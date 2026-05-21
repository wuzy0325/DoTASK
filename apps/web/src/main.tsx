import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { FormEvent, useEffect, useState } from "react";
import "./styles.css";

interface TaskSummary {
  id: string;
  title: string;
  type: "feature" | "qa_fix";
  status: string;
  repoUrl: string;
  baseBranch: string;
  branch: string;
  skillProfile: string;
  createdAt: string;
  updatedAt: string;
}

interface TaskDetail extends TaskSummary {
  requirementMarkdown: string;
  workspacePath?: string;
}

interface AgentMessage {
  id: string;
  fromAgent: "claude" | "codex" | "system";
  toAgent: "claude" | "codex" | "system";
  type: string;
  content: string;
  createdAt: string;
}

interface AgentChannelSnapshot {
  workflow: {
    state: string;
    updatedAt: string;
  };
  messages: AgentMessage[];
}

interface TerminalSessionSnapshot {
  status: string;
  sessionName?: string;
  errorMessage?: string;
}

interface AgentRuntimeSnapshot {
  state: string;
  lastTickAt?: string;
  lastError?: string;
}

interface ProjectFlowState {
  status: string;
  detail: string;
  updatedAt: string;
}

interface ProjectFlowStep {
  key: string;
  label: string;
  status: "pending" | "active" | "done";
  updatedAt?: string;
}

interface ProjectState {
  projectId: string;
  rootPath: string;
  mainPhase: "development" | "bug_fix";
  development: ProjectFlowState;
  bugFix: ProjectFlowState;
  developmentFlow: ProjectFlowStep[];
  updatedAt: string;
}

interface ProjectSummary {
  id: string;
  name: string;
  rootPath: string;
  state: ProjectState;
  createdAt: string;
  updatedAt: string;
}

type AgentWindowName = "claude" | "codex";

type ProjectDevelopmentAction =
  | "start_development"
  | "submit_development"
  | "start_review"
  | "request_fix"
  | "resubmit_fix"
  | "start_rereview"
  | "approve_review"
  | "start_packaging"
  | "confirm_package"
  | "submit_web";

const developmentActions: Array<{ action: ProjectDevelopmentAction; label: string }> = [
  { action: "start_development", label: "Start Project" },
  { action: "submit_development", label: "Dev Submitted" },
  { action: "start_review", label: "Start Codex Review" },
  { action: "request_fix", label: "Fix Review" },
  { action: "resubmit_fix", label: "Resubmit" },
  { action: "start_rereview", label: "Re-review" },
  { action: "approve_review", label: "Review Approved" },
  { action: "start_packaging", label: "Start Packaging" },
  { action: "confirm_package", label: "Package OK" },
  { action: "submit_web", label: "Web Submitted" }
];

const apiBase = "http://127.0.0.1:3333";

function getStatusTone(status: string) {
  if (status.startsWith("FAILED")) {
    return "danger";
  }
  if (["DONE", "PUSHED", "ARTIFACT_READY", "TEST_PASSED"].includes(status)) {
    return "success";
  }
  if (["NEEDS_HUMAN", "PAUSED", "CANCELLED"].includes(status)) {
    return "warning";
  }
  if (status.includes("RUNNING") || status.includes("CLONING") || status.includes("TESTING")) {
    return "active";
  }

  return "neutral";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function App() {
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedProject, setSelectedProject] = useState<ProjectSummary | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskDetail | null>(null);
  const [agentChannel, setAgentChannel] = useState<AgentChannelSnapshot | null>(null);
  const [terminalSession, setTerminalSession] = useState<TerminalSessionSnapshot | null>(null);
  const [agentRuntime, setAgentRuntime] = useState<AgentRuntimeSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [qaFixResult, setQaFixResult] = useState<{ bugCount: number; bugFiles: string[] } | null>(null);
  const [isTaskWindowOpen, setIsTaskWindowOpen] = useState(false);
  const [activeAgentWindow, setActiveAgentWindow] = useState<AgentWindowName>("claude");
  const [terminalOutput, setTerminalOutput] = useState<string>("");

  async function loadTasks() {
    const response = await fetch(`${apiBase}/api/tasks`);
    if (!response.ok) {
      throw new Error("Failed to load tasks");
    }
    setTasks(await response.json());
  }

  async function loadProjects() {
    const response = await fetch(`${apiBase}/api/projects`);
    if (!response.ok) {
      throw new Error("Failed to load projects");
    }
    const loadedProjects = (await response.json()) as ProjectSummary[];
    setProjects(loadedProjects);
    setSelectedProject((current) => current ?? loadedProjects[0] ?? null);
  }

  async function loadTask(id: string) {
    const response = await fetch(`${apiBase}/api/tasks/${id}`);
    if (!response.ok) {
      throw new Error("Failed to load task detail");
    }
    setSelectedTask(await response.json());
    setIsTaskWindowOpen(true);
    await loadAgentChannel(id);
    await loadTerminalSession(id);
    await loadAgentRuntime(id);
  }

  async function openAgentWindow(windowName: AgentWindowName) {
    if (!selectedTask) {
      return;
    }

    setActiveAgentWindow(windowName);
    setTerminalOutput("Loading terminal output...");
    const response = await fetch(`${apiBase}/api/tasks/${selectedTask.id}/terminal-session/${windowName}/capture`);
    if (!response.ok) {
      const message = await response.text();
      setTerminalOutput(message);
      return;
    }

    const result = (await response.json()) as { output?: string };
    setTerminalOutput(result.output?.trim() || "No captured output yet. Start terminals, then refresh this window.");
  }

  async function loadAgentChannel(taskId: string) {
    const response = await fetch(`${apiBase}/api/tasks/${taskId}/agent-channel`);
    if (!response.ok) {
      throw new Error("Failed to load agent channel");
    }
    setAgentChannel(await response.json());
  }

  async function loadTerminalSession(taskId: string) {
    const response = await fetch(`${apiBase}/api/tasks/${taskId}/terminal-session`);
    if (!response.ok) {
      throw new Error("Failed to load terminal session");
    }
    setTerminalSession(await response.json());
  }

  async function loadAgentRuntime(taskId: string) {
    const response = await fetch(`${apiBase}/api/tasks/${taskId}/agent-runtime`);
    if (!response.ok) {
      throw new Error("Failed to load agent runtime");
    }
    setAgentRuntime(await response.json());
  }

  useEffect(() => {
    loadTasks().catch((loadError: unknown) => setError(String(loadError)));
    loadProjects().catch((loadError: unknown) => setError(String(loadError)));
  }, []);

  async function registerProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get("name") ?? "") || undefined,
      rootPath: String(form.get("rootPath") ?? "")
    };

    try {
      const response = await fetch(`${apiBase}/api/projects`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message);
      }
      const project = (await response.json()) as ProjectSummary;
      event.currentTarget.reset();
      setSelectedProject(project);
      await loadProjects();
    } catch (registerError: unknown) {
      setError(String(registerError));
    }
  }

  async function advanceProjectDevelopment(action: ProjectDevelopmentAction) {
    if (!selectedProject) {
      return;
    }

    setError(null);
    const response = await fetch(`${apiBase}/api/projects/${selectedProject.id}/development/advance`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action })
    });
    if (!response.ok) {
      const message = await response.text();
      setError(message);
      return;
    }

    const project = (await response.json()) as ProjectSummary;
    setSelectedProject(project);
    await loadProjects();
  }

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const form = new FormData(event.currentTarget);
    const payload = {
      title: String(form.get("title") ?? ""),
      type: String(form.get("type") ?? "feature"),
      repoUrl: String(form.get("repoUrl") ?? ""),
      baseBranch: String(form.get("baseBranch") ?? "main"),
      branch: String(form.get("branch") ?? ""),
      skillProfile: String(form.get("skillProfile") ?? "fullstack-feature"),
      requirementMarkdown: String(form.get("requirementMarkdown") ?? "")
    };

    try {
      const response = await fetch(`${apiBase}/api/tasks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message);
      }
      const task = (await response.json()) as TaskDetail;
      const startResponse = await fetch(`${apiBase}/api/tasks/${task.id}/start-mind-project`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}"
      });
      if (!startResponse.ok) {
        const message = await startResponse.text();
        throw new Error(message);
      }
      const started = (await startResponse.json()) as {
        task: TaskDetail;
        terminalSession: TerminalSessionSnapshot;
      };
      event.currentTarget.reset();
      await loadTasks();
      setSelectedTask(started.task);
      setIsTaskWindowOpen(true);
      setTerminalSession(started.terminalSession);
      await loadAgentChannel(task.id);
      await loadAgentRuntime(task.id);
    } catch (createError: unknown) {
      setError(String(createError));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function startReview() {
    if (!selectedTask) {
      return;
    }
    await fetch(`${apiBase}/api/tasks/${selectedTask.id}/agent-channel/start-review`, { method: "POST" });
    await loadAgentChannel(selectedTask.id);
  }

  async function startTerminalSession() {
    if (!selectedTask) {
      return;
    }
    const response = await fetch(`${apiBase}/api/tasks/${selectedTask.id}/terminal-session/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}"
    });
    setTerminalSession(await response.json());
    if (!response.ok) {
      setError("Terminal session failed to start. Check tmux availability and task workspace.");
    }
  }

  async function deliverAgentMessages() {
    if (!selectedTask) {
      return;
    }
    const response = await fetch(`${apiBase}/api/tasks/${selectedTask.id}/agent-channel/deliver`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}"
    });
    if (!response.ok) {
      const message = await response.text();
      setError(message);
    }
  }

  async function pollAgentResult(windowName: "claude" | "codex") {
    if (!selectedTask) {
      return;
    }
    const response = await fetch(`${apiBase}/api/tasks/${selectedTask.id}/terminal-session/${windowName}/poll-result`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}"
    });
    if (!response.ok) {
      const message = await response.text();
      setError(message);
      return;
    }
    await loadAgentChannel(selectedTask.id);
  }

  async function setRuntime(action: "start" | "stop" | "tick") {
    if (!selectedTask) {
      return;
    }
    const response = await fetch(`${apiBase}/api/tasks/${selectedTask.id}/agent-runtime/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}"
    });
    if (!response.ok) {
      const message = await response.text();
      setError(message);
      return;
    }
    setAgentRuntime(await response.json());
    await loadAgentChannel(selectedTask.id);
  }

  async function prepareWorkspace() {
    if (!selectedTask) {
      return;
    }
    const response = await fetch(`${apiBase}/api/tasks/${selectedTask.id}/prepare-workspace`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}"
    });
    if (!response.ok) {
      const message = await response.text();
      setError(message);
      return;
    }
    const result = await response.json();
    setSelectedTask(result.task);
    await loadTasks();
  }

  async function startQaFix() {
    if (!selectedTask) {
      return;
    }
    setQaFixResult(null);
    setError(null);
    const response = await fetch(`${apiBase}/api/tasks/${selectedTask.id}/qa-fix/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}"
    });
    if (!response.ok) {
      const message = await response.text();
      setError(message);
      return;
    }
    const result = await response.json();
    setQaFixResult(result);
    await loadAgentChannel(selectedTask.id);
  }

  async function submitAgentMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTask) {
      return;
    }

    const form = new FormData(event.currentTarget);
    const payload = {
      fromAgent: String(form.get("fromAgent") ?? "codex"),
      type: String(form.get("type") ?? "review_result"),
      content: String(form.get("content") ?? "")
    };

    await fetch(`${apiBase}/api/tasks/${selectedTask.id}/agent-channel/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    event.currentTarget.reset();
    await loadAgentChannel(selectedTask.id);
  }

  const selectedTaskMessages = agentChannel?.messages ?? [];
  const selectedTaskTone = selectedTask ? getStatusTone(selectedTask.status) : "neutral";

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Agent operations board</p>
          <h1>Task Command Center</h1>
        </div>
        <div className="summary">
          <strong>{projects.length} projects · {tasks.length} tasks</strong>
          <span>Remember project roots, read each project state from .tmp, then open tasks for Claude and Codex details.</span>
        </div>
      </header>

      {error ? <div className="error">{error}</div> : null}

      <section className="board">
        <aside className="panel taskQueue">
          <div className="sectionHeader">
            <div>
              <p className="eyebrow">Projects</p>
              <h2>Root List</h2>
            </div>
            <span className="countBadge">{projects.length}</span>
          </div>
          <div className="projectList">
            {projects.length === 0 ? <p className="muted">No projects registered. Add a root path first.</p> : null}
            {projects.map((project) => {
              const isSelected = selectedProject?.id === project.id;
              const phaseState = project.state.mainPhase === "development" ? project.state.development : project.state.bugFix;

              return (
                <button
                  className={`projectCard ${isSelected ? "selected" : ""}`}
                  key={project.id}
                  onClick={() => setSelectedProject(project)}
                  type="button"
                >
                  <span className="projectName">{project.name}</span>
                  <span className="taskMeta">{project.rootPath}</span>
                  <span className={`statusPill ${getStatusTone(phaseState.status)}`}>{project.state.mainPhase}</span>
                  <span className="taskDate">{phaseState.status} · {formatDate(project.state.updatedAt)}</span>
                </button>
              );
            })}
          </div>

          <div className="sectionHeader taskHeader">
            <div>
              <p className="eyebrow">Tasks</p>
              <h2>Work Items</h2>
            </div>
            <span className="countBadge">{tasks.length}</span>
          </div>
          <div className="taskList">
            {tasks.length === 0 ? <p className="muted">No tasks yet. Create one from the composer.</p> : null}
            {tasks.map((task) => {
              const tone = getStatusTone(task.status);
              const isSelected = selectedTask?.id === task.id;

              return (
                <button
                  className={`taskCard ${isSelected ? "selected" : ""}`}
                  key={task.id}
                  onClick={() => loadTask(task.id)}
                  type="button"
                >
                  <span className={`statusPill ${tone}`}>{task.status}</span>
                  <strong>{task.title}</strong>
                  <span className="taskMeta">{task.type} · {task.branch}</span>
                  <span className="taskDate">Updated {formatDate(task.updatedAt)}</span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="workspaceStage">
          {selectedProject ? (
            <section className="projectStateBar">
              <div>
                <p className="eyebrow">Selected project</p>
                <h2>{selectedProject.name}</h2>
                <p>{selectedProject.rootPath}</p>
              </div>
              <div className="phaseGrid">
                <div className={selectedProject.state.mainPhase === "development" ? "active" : ""}>
                  <span>Development</span>
                  <strong>{selectedProject.state.development.status}</strong>
                  <p>{selectedProject.state.development.detail}</p>
                </div>
                <div className={selectedProject.state.mainPhase === "bug_fix" ? "active" : ""}>
                  <span>Bug Fix</span>
                  <strong>{selectedProject.state.bugFix.status}</strong>
                  <p>{selectedProject.state.bugFix.detail}</p>
                </div>
              </div>
              <div className="flowTimeline">
                {selectedProject.state.developmentFlow.map((step) => (
                  <div className={`flowStep ${step.status}`} key={step.key}>
                    <span>{step.label}</span>
                    {step.updatedAt ? <small>{formatDate(step.updatedAt)}</small> : null}
                  </div>
                ))}
              </div>
              <div className="actions projectFlowActions">
                {developmentActions.map((item) => (
                  <button key={item.action} type="button" onClick={() => advanceProjectDevelopment(item.action)}>
                    {item.label}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {selectedTask && isTaskWindowOpen ? (
            <article className="taskWindow">
              <header className="windowChrome">
                <div>
                  <p className="eyebrow">Task window</p>
                  <h2>{selectedTask.title}</h2>
                </div>
                <div className="windowControls">
                  <span className={`statusPill ${selectedTaskTone}`}>{selectedTask.status}</span>
                  <button className="ghostButton" type="button" onClick={() => setIsTaskWindowOpen(false)}>Close</button>
                </div>
              </header>

              <div className="windowGrid">
                <section className="detailStack">
                  <div className="infoGrid">
                    <div>
                      <span>Repository</span>
                      <strong>{selectedTask.repoUrl}</strong>
                    </div>
                    <div>
                      <span>Branch</span>
                      <strong>{selectedTask.branch}</strong>
                    </div>
                    <div>
                      <span>Workspace</span>
                      <strong>{selectedTask.workspacePath ?? "Not prepared"}</strong>
                    </div>
                    <div>
                      <span>Skill profile</span>
                      <strong>{selectedTask.skillProfile}</strong>
                    </div>
                  </div>

                  <div className="actions primaryActions">
                    <button type="button" onClick={prepareWorkspace}>Prepare Workspace</button>
                    <button type="button" onClick={startTerminalSession}>Start Windows</button>
                    <button type="button" onClick={startQaFix}>Start QA Fix</button>
                  </div>

                  {qaFixResult ? (
                    <p className="muted">QA Fix started: {qaFixResult.bugCount} bug file(s) found ({qaFixResult.bugFiles.join(", ")})</p>
                  ) : null}

                  <section className="requirementPane">
                    <div className="sectionHeader slim">
                      <h3>Requirement</h3>
                      <span>{selectedTask.type}</span>
                    </div>
                    <pre>{selectedTask.requirementMarkdown}</pre>
                  </section>
                </section>

                <section className="agentConsole">
                  <div className="agentTabs">
                    <button
                      className={activeAgentWindow === "claude" ? "active" : ""}
                      type="button"
                      onClick={() => openAgentWindow("claude")}
                    >
                      Claude Window
                    </button>
                    <button
                      className={activeAgentWindow === "codex" ? "active" : ""}
                      type="button"
                      onClick={() => openAgentWindow("codex")}
                    >
                      Codex Window
                    </button>
                  </div>

                  <div className="runtimeStrip">
                    <span>Terminal: {terminalSession?.status ?? "unknown"}</span>
                    <span>Runtime: {agentRuntime?.state ?? "unknown"}</span>
                    <span>Flow: {agentChannel?.workflow.state ?? "loading"}</span>
                  </div>

                  <pre className="terminalPane">{terminalOutput || `Click Claude Window or Codex Window to open captured output.`}</pre>

                  <div className="actions consoleActions">
                    <button type="button" onClick={startReview}>Start Codex Review</button>
                    <button type="button" onClick={deliverAgentMessages}>Deliver</button>
                    <button type="button" onClick={() => pollAgentResult("codex")}>Poll Codex</button>
                    <button type="button" onClick={() => pollAgentResult("claude")}>Poll Claude</button>
                    <button type="button" onClick={() => setRuntime("start")}>Auto Start</button>
                    <button type="button" onClick={() => setRuntime("tick")}>Tick</button>
                    <button type="button" onClick={() => setRuntime("stop")}>Stop</button>
                  </div>
                </section>
              </div>
            </article>
          ) : (
            <section className="emptyStage">
              <p className="eyebrow">No window open</p>
              <h2>Select a task to open its workbench.</h2>
              <p>Each task opens as a focused workspace with status, requirements, Claude output, Codex output, and review handoff controls.</p>
            </section>
          )}
        </section>

        <aside className="composerStack">
          <form className="panel form" onSubmit={registerProject}>
            <div>
              <p className="eyebrow">Remember</p>
              <h2>Project Root</h2>
            </div>
            <label>
              Name
              <input name="name" placeholder="Billing service" />
            </label>
            <label>
              Root Path
              <input name="rootPath" required placeholder="C:\\work\\project" />
            </label>
            <button type="submit">Add Project</button>
          </form>

          <form className="panel form" onSubmit={createTask}>
            <div>
              <p className="eyebrow">Create</p>
              <h2>New Task</h2>
              <p className="muted">Creates the ID folder, starts Claude, and sends the start mind project skill.</p>
            </div>
          <label>
            Title
            <input name="title" required placeholder="User login feature" />
          </label>
          <label>
            Type
            <select name="type" defaultValue="feature">
              <option value="feature">Feature</option>
              <option value="qa_fix">QA Fix</option>
            </select>
          </label>
          <label>
            Git Address
            <input name="repoUrl" required placeholder="git@example.com:team/project.git" />
          </label>
          <div className="columns">
            <label>
              Base Branch
              <input name="baseBranch" required defaultValue="main" />
            </label>
            <label>
              Task Branch
              <input name="branch" required placeholder="task/10001-login" />
            </label>
          </div>
          <label>
            Skill Profile
            <input name="skillProfile" required defaultValue="fullstack-feature" />
          </label>
          <label>
            Skill Prompt
            <textarea name="requirementMarkdown" required rows={10} placeholder="Paste the prompt used by the start mind project skill." />
          </label>
          <button disabled={isSubmitting}>{isSubmitting ? "Starting Claude..." : "Create and Start"}</button>
          </form>
        </aside>
      </section>

      <section className="panel agentPanel">
        <div className="sectionHeader">
          <div>
            <p className="eyebrow">Conversation</p>
            <h2>Agent Channel</h2>
          </div>
          <span className="countBadge">{selectedTaskMessages.length}</span>
        </div>
          {selectedTask ? (
            <>
              <form className="form compact" onSubmit={submitAgentMessage}>
                <div className="columns">
                  <label>
                    From
                    <select name="fromAgent" defaultValue="codex">
                      <option value="codex">Codex</option>
                      <option value="claude">Claude</option>
                    </select>
                  </label>
                  <label>
                    Type
                    <select name="type" defaultValue="review_result">
                      <option value="review_result">Review Result</option>
                      <option value="fix_result">Fix Result</option>
                      <option value="error">Error</option>
                    </select>
                  </label>
                </div>
                <textarea name="content" required rows={5} placeholder="Paste simulated Codex review or Claude fix result. Include Verdict: approved | needs_fix | needs_human for reviews." />
                <button>Submit Agent Message</button>
              </form>
              <div className="messages">
                {selectedTaskMessages.map((message) => (
                  <article className="message" key={message.id}>
                    <header>
                      <strong>{message.fromAgent} -&gt; {message.toAgent}</strong>
                      <span>{message.type}</span>
                    </header>
                    <pre>{message.content}</pre>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <p className="muted">Select a task to inspect agent communication.</p>
          )}
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
