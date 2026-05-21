import Fastify from "fastify";
import { AgentChannelService, parseSubmitAgentMessageInput } from "./agent-channel.js";
import { parseAgentResults } from "./agent-result-parser.js";
import { AgentRuntimeManager } from "./agent-runtime.js";
import { AgentTerminalEventRepository } from "./agent-terminal-events.js";
import { checkRequiredCommands } from "./commands.js";
import { ensureRuntimeDirectories, loadAppConfig, resolveRuntimePaths } from "./config.js";
import { openDatabase } from "./db.js";
import { parseCreateTaskInput, parseUpdateTaskInput, TaskRepository } from "./tasks.js";
import { TerminalService } from "./terminal.js";
import { buildStartMindProjectPrompt, WorkspaceManager } from "./workspace.js";
import { scanBugFiles, generateQaFixCodexPrompt } from "./qa-fix-flow.js";
import { parseDevelopmentAction, parseRegisterProjectInput, ProjectRepository } from "./projects.js";

const server = Fastify({ logger: true });

const config = await loadAppConfig();
const runtimePaths = resolveRuntimePaths(config);
await ensureRuntimeDirectories(runtimePaths);
const database = openDatabase(runtimePaths);
const tasks = new TaskRepository(database.db);
const projects = new ProjectRepository(database.db);
const agentChannel = new AgentChannelService(database.db);
const agentTerminalEvents = new AgentTerminalEventRepository(database.db);
const terminals = new TerminalService(database.db, config);
const agentRuntime = new AgentRuntimeManager(agentChannel, terminals, agentTerminalEvents);
const workspaceManager = new WorkspaceManager(runtimePaths);

const commandChecks = await checkRequiredCommands([
  "git",
  "tmux",
  config.agents.claude.command,
  config.agents.codex.command
]);
const missingCommands = commandChecks.filter((check) => !check.available);

if (missingCommands.length > 0) {
  server.log.warn({ missingCommands }, "Some required commands are not available");
}

server.get("/health", async () => ({
  status: "ok",
  runtimePaths,
  database: {
    path: database.dbPath
  },
  commands: commandChecks
}));

server.get("/api/tasks", async () => tasks.list());

server.get("/api/projects", async () => projects.list());

server.post("/api/projects", async (request, reply) => {
  const input = parseRegisterProjectInput(request.body);
  const project = await projects.register(input);

  return reply.code(201).send(project);
});

server.get<{ Params: { id: string } }>("/api/projects/:id", async (request, reply) => {
  const project = await projects.get(request.params.id);
  if (!project) {
    return reply.code(404).send({ error: "Project not found" });
  }

  return project;
});

server.post<{ Params: { id: string } }>("/api/projects/:id/development/advance", async (request, reply) => {
  const action = parseDevelopmentAction(request.body);
  const project = await projects.advanceDevelopment(request.params.id, action);
  if (!project) {
    return reply.code(404).send({ error: "Project not found" });
  }

  return project;
});

server.post("/api/tasks", async (request, reply) => {
  const input = parseCreateTaskInput(request.body);
  const task = tasks.create(input);

  return reply.code(201).send(task);
});

server.get<{ Params: { id: string } }>("/api/tasks/:id", async (request, reply) => {
  const task = tasks.get(request.params.id);
  if (!task) {
    return reply.code(404).send({ error: "Task not found" });
  }

  return task;
});

server.patch<{ Params: { id: string } }>("/api/tasks/:id", async (request, reply) => {
  const input = parseUpdateTaskInput(request.body);
  const task = tasks.update(request.params.id, input);
  if (!task) {
    return reply.code(404).send({ error: "Task not found" });
  }

  return task;
});

server.post<{ Params: { id: string } }>("/api/tasks/:id/prepare-workspace", async (request, reply) => {
  const task = tasks.get(request.params.id);
  if (!task) {
    return reply.code(404).send({ error: "Task not found" });
  }

  const workspace = await workspaceManager.prepareTaskWorkspace(task);
  const updatedTask = tasks.update(request.params.id, {
    workspacePath: workspace.workspacePath,
    status: "WORKSPACE_READY"
  });

  return reply.code(201).send({
    task: updatedTask,
    workspace
  });
});

server.post<{ Params: { id: string } }>("/api/tasks/:id/start-mind-project", async (request, reply) => {
  const task = tasks.get(request.params.id);
  if (!task) {
    return reply.code(404).send({ error: "Task not found" });
  }

  const workspace = await workspaceManager.prepareTaskWorkspace(task);
  const updatedTask = tasks.update(request.params.id, {
    workspacePath: workspace.workspacePath,
    status: "DEV_RUNNING"
  });
  if (!updatedTask) {
    return reply.code(404).send({ error: "Task not found" });
  }

  const session = await terminals.ensureTaskSession(request.params.id, workspace.workspacePath);
  if (session.status !== "ready") {
    return reply.code(500).send({ task: updatedTask, workspace, terminalSession: session });
  }

  const prompt = buildStartMindProjectPrompt(updatedTask);
  await terminals.sendMessage(request.params.id, "claude", prompt);

  return reply.code(201).send({
    task: updatedTask,
    workspace,
    terminalSession: session,
    promptPath: workspace.startMindProjectPromptPath
  });
});

server.get<{ Params: { id: string } }>("/api/tasks/:id/agent-channel", async (request, reply) => {
  const task = tasks.get(request.params.id);
  if (!task) {
    return reply.code(404).send({ error: "Task not found" });
  }

  return {
    workflow: agentChannel.getWorkflow(request.params.id),
    messages: agentChannel.listMessages(request.params.id)
  };
});

server.post<{ Params: { id: string } }>("/api/tasks/:id/agent-channel/start-review", async (request, reply) => {
  const task = tasks.get(request.params.id);
  if (!task) {
    return reply.code(404).send({ error: "Task not found" });
  }

  const message = agentChannel.startReview(request.params.id);

  return reply.code(201).send({
    workflow: agentChannel.getWorkflow(request.params.id),
    message
  });
});

server.post<{ Params: { id: string } }>("/api/tasks/:id/agent-channel/messages", async (request, reply) => {
  const task = tasks.get(request.params.id);
  if (!task) {
    return reply.code(404).send({ error: "Task not found" });
  }

  const input = parseSubmitAgentMessageInput(request.body);
  return reply.code(201).send(agentChannel.submitAgentMessage(request.params.id, input));
});

server.get<{ Params: { id: string } }>("/api/tasks/:id/terminal-session", async (request, reply) => {
  const task = tasks.get(request.params.id);
  if (!task) {
    return reply.code(404).send({ error: "Task not found" });
  }

  return terminals.getSession(request.params.id) ?? { status: "missing" };
});

server.post<{ Params: { id: string } }>("/api/tasks/:id/terminal-session/start", async (request, reply) => {
  const task = tasks.get(request.params.id);
  if (!task) {
    return reply.code(404).send({ error: "Task not found" });
  }

  const session = await terminals.ensureTaskSession(request.params.id, task.workspacePath);
  return reply.code(session.status === "ready" ? 201 : 500).send(session);
});

server.post<{ Params: { id: string } }>("/api/tasks/:id/agent-channel/deliver", async (request, reply) => {
  const task = tasks.get(request.params.id);
  if (!task) {
    return reply.code(404).send({ error: "Task not found" });
  }

  const messages = agentChannel.getPendingOutboundMessages(request.params.id);
  const delivered: string[] = [];

  for (const message of messages) {
    if (message.toAgent === "claude" || message.toAgent === "codex") {
      await terminals.sendMessage(request.params.id, message.toAgent, message.content);
      delivered.push(message.id);
    }
  }

  return { delivered };
});

server.get<{ Params: { id: string; window: "claude" | "codex" | "test" | "shell" } }>(
  "/api/tasks/:id/terminal-session/:window/capture",
  async (request, reply) => {
    const task = tasks.get(request.params.id);
    if (!task) {
      return reply.code(404).send({ error: "Task not found" });
    }

    const output = await terminals.captureWindow(request.params.id, request.params.window);
    return { output };
  }
);

server.post<{ Params: { id: string; window: "claude" | "codex" } }>(
  "/api/tasks/:id/terminal-session/:window/poll-result",
  async (request, reply) => {
    const task = tasks.get(request.params.id);
    if (!task) {
      return reply.code(404).send({ error: "Task not found" });
    }

    const output = await terminals.captureWindow(request.params.id, request.params.window);
    const parsed = parseAgentResults(output);
    const accepted = [];

    for (const result of parsed) {
      if (agentTerminalEvents.hasEvent(request.params.id, request.params.window, result.hash)) {
        continue;
      }

      agentTerminalEvents.saveEvent({
        taskId: request.params.id,
        windowName: request.params.window,
        eventHash: result.hash,
        fromAgent: result.input.fromAgent,
        type: result.input.type,
        content: result.input.content
      });

      accepted.push(agentChannel.submitAgentMessage(request.params.id, result.input));
    }

    return {
      parsed: parsed.length,
      accepted: accepted.length,
      workflow: agentChannel.getWorkflow(request.params.id)
    };
  }
);

server.get<{ Params: { id: string } }>("/api/tasks/:id/agent-runtime", async (request, reply) => {
  const task = tasks.get(request.params.id);
  if (!task) {
    return reply.code(404).send({ error: "Task not found" });
  }

  return agentRuntime.status(request.params.id);
});

server.post<{ Params: { id: string } }>("/api/tasks/:id/agent-runtime/start", async (request, reply) => {
  const task = tasks.get(request.params.id);
  if (!task) {
    return reply.code(404).send({ error: "Task not found" });
  }

  return agentRuntime.start(request.params.id);
});

server.post<{ Params: { id: string } }>("/api/tasks/:id/agent-runtime/stop", async (request, reply) => {
  const task = tasks.get(request.params.id);
  if (!task) {
    return reply.code(404).send({ error: "Task not found" });
  }

  return agentRuntime.stop(request.params.id);
});

server.post<{ Params: { id: string } }>("/api/tasks/:id/agent-runtime/tick", async (request, reply) => {
  const task = tasks.get(request.params.id);
  if (!task) {
    return reply.code(404).send({ error: "Task not found" });
  }

  return agentRuntime.tick(request.params.id);
});

server.post<{ Params: { id: string } }>("/api/tasks/:id/qa-fix/start", async (request, reply) => {
  const task = tasks.get(request.params.id);
  if (!task) {
    return reply.code(404).send({ error: "Task not found" });
  }

  const workspace = task.workspacePath;
  if (!workspace) {
    return reply.code(400).send({ error: "Task workspace not prepared. Call prepare-workspace first." });
  }

  const bugEntries = await scanBugFiles(workspace);
  if (bugEntries.length === 0) {
    return reply.code(400).send({ error: `No bug files found in ${workspace}/.tmp/bug/` });
  }

  const codexPrompt = generateQaFixCodexPrompt(bugEntries);
  agentChannel.setBugContext(request.params.id, codexPrompt);
  const message = agentChannel.startQaFixRound(request.params.id, codexPrompt);

  return reply.code(201).send({
    bugCount: bugEntries.length,
    bugFiles: bugEntries.map((b) => b.fileName),
    workflow: agentChannel.getWorkflow(request.params.id),
    message
  });
});

const port = Number(process.env.PORT ?? 3333);
const host = process.env.HOST ?? "127.0.0.1";

try {
  await server.listen({ port, host });
} catch (error) {
  server.log.error(error);
  process.exit(1);
}
