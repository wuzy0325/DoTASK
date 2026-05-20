import type { DatabaseSync } from "node:sqlite";
import type { AppConfig } from "./config.js";
import { runCommand } from "./process.js";

const terminalWindows = ["claude", "codex", "test", "shell"] as const;

export type TerminalWindow = (typeof terminalWindows)[number];

interface TerminalSessionRow {
  task_id: string;
  session_name: string;
  workspace_path: string | null;
  status: "ready" | "failed";
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface TerminalSessionSnapshot {
  taskId: string;
  sessionName: string;
  workspacePath?: string;
  status: "ready" | "failed";
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export class TerminalService {
  constructor(
    private readonly db: DatabaseSync,
    private readonly config: AppConfig
  ) {}

  getSession(taskId: string): TerminalSessionSnapshot | undefined {
    const row = this.db
      .prepare("SELECT * FROM terminal_sessions WHERE task_id = ?")
      .get(taskId) as unknown as TerminalSessionRow | undefined;

    return row ? rowToSnapshot(row) : undefined;
  }

  async ensureTaskSession(taskId: string, workspacePath?: string): Promise<TerminalSessionSnapshot> {
    const sessionName = safeSessionName(`task-${taskId}`);
    const cwd = workspacePath || process.cwd();

    try {
      const hasSession = await this.hasSession(sessionName);
      if (!hasSession) {
        await runTmux(["new-session", "-d", "-s", sessionName, "-c", cwd, this.config.terminal.shell]);
      }

      await this.ensureWindow(sessionName, "claude", cwd, this.config.agents.claude.command, this.config.agents.claude.args);
      await this.ensureWindow(sessionName, "codex", cwd, this.config.agents.codex.command, this.config.agents.codex.args);
      await this.ensureWindow(sessionName, "test", cwd, this.config.terminal.shell, []);
      await this.ensureWindow(sessionName, "shell", cwd, this.config.terminal.shell, []);

      return this.saveSession(taskId, sessionName, workspacePath, "ready");
    } catch (error) {
      return this.saveSession(taskId, sessionName, workspacePath, "failed", error instanceof Error ? error.message : String(error));
    }
  }

  async sendMessage(taskId: string, window: TerminalWindow, content: string): Promise<void> {
    const session = this.getSession(taskId);
    if (!session || session.status !== "ready") {
      throw new Error("Terminal session is not ready");
    }

    await runTmux(["send-keys", "-t", `${session.sessionName}:${window}`, content, "Enter"]);
  }

  async captureWindow(taskId: string, window: TerminalWindow): Promise<string> {
    const session = this.getSession(taskId);
    if (!session || session.status !== "ready") {
      throw new Error("Terminal session is not ready");
    }

    const result = await runTmux(["capture-pane", "-p", "-t", `${session.sessionName}:${window}`]);
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || `tmux capture-pane failed with exit code ${result.exitCode}`);
    }

    return result.stdout;
  }

  private async hasSession(sessionName: string): Promise<boolean> {
    const result = await runTmux(["has-session", "-t", sessionName]);
    return result.exitCode === 0;
  }

  private async ensureWindow(
    sessionName: string,
    window: TerminalWindow,
    cwd: string,
    command: string,
    args: string[]
  ): Promise<void> {
    const existing = await runTmux(["list-windows", "-t", sessionName, "-F", "#{window_name}"]);
    if (existing.exitCode !== 0) {
      throw new Error(existing.stderr || "tmux list-windows failed");
    }

    if (existing.stdout.split(/\r?\n/).includes(window)) {
      return;
    }

    const result = await runTmux(["new-window", "-t", sessionName, "-n", window, "-c", cwd, command, ...args]);
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || `tmux new-window ${window} failed`);
    }
  }

  private saveSession(
    taskId: string,
    sessionName: string,
    workspacePath: string | undefined,
    status: "ready" | "failed",
    errorMessage?: string
  ): TerminalSessionSnapshot {
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO terminal_sessions (
          task_id, session_name, workspace_path, status, error_message, created_at, updated_at
        ) VALUES (
          @taskId, @sessionName, @workspacePath, @status, @errorMessage, @createdAt, @updatedAt
        )
        ON CONFLICT(task_id) DO UPDATE SET
          session_name = excluded.session_name,
          workspace_path = excluded.workspace_path,
          status = excluded.status,
          error_message = excluded.error_message,
          updated_at = excluded.updated_at`
      )
      .run({
        taskId,
        sessionName,
        workspacePath: workspacePath ?? null,
        status,
        errorMessage: errorMessage ?? null,
        createdAt: now,
        updatedAt: now
      });

    return {
      taskId,
      sessionName,
      workspacePath,
      status,
      errorMessage,
      createdAt: now,
      updatedAt: now
    };
  }
}

function rowToSnapshot(row: TerminalSessionRow): TerminalSessionSnapshot {
  return {
    taskId: row.task_id,
    sessionName: row.session_name,
    workspacePath: row.workspace_path ?? undefined,
    status: row.status,
    errorMessage: row.error_message ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function runTmux(args: string[]) {
  const result = await runCommand("tmux", args);
  if (result.exitCode !== 0 && args[0] !== "has-session") {
    throw new Error(result.stderr || `tmux ${args.join(" ")} failed with exit code ${result.exitCode}`);
  }

  return result;
}

function safeSessionName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80);
}
