import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import type { AgentRole, AgentMessageType } from "@ai-task-workbench/shared";

export class AgentTerminalEventRepository {
  constructor(private readonly db: DatabaseSync) {}

  hasEvent(taskId: string, windowName: string, eventHash: string): boolean {
    const row = this.db
      .prepare("SELECT id FROM agent_terminal_events WHERE task_id = ? AND window_name = ? AND event_hash = ?")
      .get(taskId, windowName, eventHash);

    return Boolean(row);
  }

  saveEvent(input: {
    taskId: string;
    windowName: string;
    eventHash: string;
    fromAgent: AgentRole;
    type: AgentMessageType;
    content: string;
  }): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO agent_terminal_events (
          id, task_id, window_name, event_hash, from_agent, type, content, created_at
        ) VALUES (
          @id, @taskId, @windowName, @eventHash, @fromAgent, @type, @content, @createdAt
        )`
      )
      .run({
        id: randomUUID(),
        taskId: input.taskId,
        windowName: input.windowName,
        eventHash: input.eventHash,
        fromAgent: input.fromAgent,
        type: input.type,
        content: input.content,
        createdAt: new Date().toISOString()
      });
  }
}
