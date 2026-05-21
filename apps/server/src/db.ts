import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import type { RuntimePaths } from "./config.js";

export interface DatabaseContext {
  db: DatabaseSync;
  dbPath: string;
}

export function openDatabase(paths: RuntimePaths): DatabaseContext {
  const dbPath = resolve(paths.appRoot, "app.db");
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db);

  return { db, dbPath };
}

function migrate(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      phase TEXT,
      repo_url TEXT NOT NULL,
      workspace_path TEXT,
      base_branch TEXT NOT NULL,
      branch TEXT NOT NULL,
      skill_profile TEXT NOT NULL,
      requirement_markdown TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      root_path TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS qa_rounds (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      round_number INTEGER NOT NULL,
      feedback_path TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS pipeline_steps (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      step_name TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT,
      ended_at TEXT,
      output_path TEXT,
      error_message TEXT,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      role TEXT NOT NULL,
      command TEXT NOT NULL,
      tmux_session TEXT,
      tmux_window TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS test_runs (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      command TEXT NOT NULL,
      status TEXT NOT NULL,
      exit_code INTEGER,
      output_path TEXT,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      branch TEXT NOT NULL,
      commit_hash TEXT,
      push_status TEXT NOT NULL,
      test_status TEXT NOT NULL,
      final_report_path TEXT,
      submit_text TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS agent_workflows (
      task_id TEXT PRIMARY KEY,
      state TEXT NOT NULL,
      last_message_id TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS agent_messages (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      from_agent TEXT NOT NULL,
      to_agent TEXT NOT NULL,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS terminal_sessions (
      task_id TEXT PRIMARY KEY,
      session_name TEXT NOT NULL,
      workspace_path TEXT,
      status TEXT NOT NULL,
      error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS agent_terminal_events (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      window_name TEXT NOT NULL,
      event_hash TEXT NOT NULL,
      from_agent TEXT NOT NULL,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(task_id, window_name, event_hash),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS agent_message_deliveries (
      message_id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      to_agent TEXT NOT NULL,
      delivered_at TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (message_id) REFERENCES agent_messages(id) ON DELETE CASCADE
    );
  `);
}
