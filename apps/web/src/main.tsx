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

const apiBase = "http://127.0.0.1:3333";

function App() {
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [selectedTask, setSelectedTask] = useState<TaskDetail | null>(null);
  const [agentChannel, setAgentChannel] = useState<AgentChannelSnapshot | null>(null);
  const [terminalSession, setTerminalSession] = useState<TerminalSessionSnapshot | null>(null);
  const [agentRuntime, setAgentRuntime] = useState<AgentRuntimeSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function loadTasks() {
    const response = await fetch(`${apiBase}/api/tasks`);
    if (!response.ok) {
      throw new Error("Failed to load tasks");
    }
    setTasks(await response.json());
  }

  async function loadTask(id: string) {
    const response = await fetch(`${apiBase}/api/tasks/${id}`);
    if (!response.ok) {
      throw new Error("Failed to load task detail");
    }
    setSelectedTask(await response.json());
    await loadAgentChannel(id);
    await loadTerminalSession(id);
    await loadAgentRuntime(id);
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
  }, []);

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
      event.currentTarget.reset();
      await loadTasks();
      setSelectedTask(task);
      await loadAgentChannel(task.id);
      await loadTerminalSession(task.id);
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

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Local-first Ubuntu workbench</p>
          <h1>AI Task Workbench</h1>
        </div>
        <p className="summary">Manual import, isolated Git workspace, Claude development, Codex review.</p>
      </header>

      {error ? <div className="error">{error}</div> : null}

      <section className="grid">
        <form className="panel form" onSubmit={createTask}>
          <h2>New Task</h2>
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
            Git Repository
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
            Requirement Markdown
            <textarea name="requirementMarkdown" required rows={10} placeholder="Paste task requirement or QA feedback here." />
          </label>
          <button disabled={isSubmitting}>{isSubmitting ? "Creating..." : "Create Task"}</button>
        </form>

        <section className="panel">
          <h2>Dashboard</h2>
          <div className="taskList">
            {tasks.length === 0 ? <p className="muted">No tasks yet.</p> : null}
            {tasks.map((task) => (
              <button className="taskCard" key={task.id} onClick={() => loadTask(task.id)}>
                <span className="status">{task.status}</span>
                <strong>{task.title}</strong>
                <span>{task.branch}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="panel detail">
          <h2>Task Detail</h2>
          {selectedTask ? (
            <article>
              <dl>
                <dt>ID</dt>
                <dd>{selectedTask.id}</dd>
                <dt>Type</dt>
                <dd>{selectedTask.type}</dd>
                <dt>Status</dt>
                <dd>{selectedTask.status}</dd>
                <dt>Repository</dt>
                <dd>{selectedTask.repoUrl}</dd>
                <dt>Branch</dt>
                <dd>{selectedTask.branch}</dd>
                <dt>Skill Profile</dt>
                <dd>{selectedTask.skillProfile}</dd>
                <dt>Workspace</dt>
                <dd>{selectedTask.workspacePath ?? "Not prepared"}</dd>
              </dl>
              <button type="button" onClick={prepareWorkspace}>Prepare Workspace</button>
              <h3>Requirement</h3>
              <pre>{selectedTask.requirementMarkdown}</pre>
            </article>
          ) : (
            <p className="muted">Select a task to inspect details.</p>
          )}
        </section>

        <section className="panel agentPanel">
          <h2>Agent Channel</h2>
          {selectedTask ? (
            <>
              <div className="channelHeader">
                <span className="status">{agentChannel?.workflow.state ?? "loading"}</span>
                <div className="actions">
                  <button type="button" onClick={startTerminalSession}>Start Terminals</button>
                  <button type="button" onClick={startReview}>Start Codex Review</button>
                  <button type="button" onClick={deliverAgentMessages}>Deliver to Windows</button>
                  <button type="button" onClick={() => pollAgentResult("codex")}>Poll Codex</button>
                  <button type="button" onClick={() => pollAgentResult("claude")}>Poll Claude</button>
                  <button type="button" onClick={() => setRuntime("start")}>Auto Start</button>
                  <button type="button" onClick={() => setRuntime("tick")}>Auto Tick</button>
                  <button type="button" onClick={() => setRuntime("stop")}>Auto Stop</button>
                </div>
              </div>
              <p className="muted">
                Terminal: {terminalSession?.status ?? "unknown"}
                {terminalSession?.sessionName ? ` (${terminalSession.sessionName})` : ""}
                {terminalSession?.errorMessage ? ` - ${terminalSession.errorMessage}` : ""}
              </p>
              <p className="muted">
                Runtime: {agentRuntime?.state ?? "unknown"}
                {agentRuntime?.lastTickAt ? ` - last tick ${agentRuntime.lastTickAt}` : ""}
                {agentRuntime?.lastError ? ` - ${agentRuntime.lastError}` : ""}
              </p>
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
                {agentChannel?.messages.map((message) => (
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
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
