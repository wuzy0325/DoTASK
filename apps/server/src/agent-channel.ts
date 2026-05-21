import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  agentMessageTypes,
  agentRoles,
  type AgentMessage,
  type AgentMessageType,
  type AgentRole,
  type AgentWorkflowSnapshot,
  type AgentWorkflowState,
  type SubmitAgentMessageInput
} from "@ai-task-workbench/shared";

const submitAgentMessageSchema = z.object({
  fromAgent: z.enum(agentRoles),
  type: z.enum(agentMessageTypes),
  content: z.string().min(1)
});

interface AgentMessageRow {
  id: string;
  task_id: string;
  from_agent: AgentRole;
  to_agent: AgentRole;
  type: AgentMessageType;
  content: string;
  created_at: string;
}

interface AgentWorkflowRow {
  task_id: string;
  state: AgentWorkflowState;
  last_message_id: string | null;
  updated_at: string;
}

export function parseSubmitAgentMessageInput(input: unknown): SubmitAgentMessageInput {
  return submitAgentMessageSchema.parse(input);
}

export class AgentChannelService {
  private readonly bugContexts = new Map<string, string>();

  constructor(private readonly db: DatabaseSync) {}

  setBugContext(taskId: string, bugEntries: string): void {
    this.bugContexts.set(taskId, bugEntries);
  }

  clearBugContext(taskId: string): void {
    this.bugContexts.delete(taskId);
  }

  startQaFixRound(taskId: string, codexPrompt: string): AgentMessage {
    const message = this.addMessage({
      taskId,
      fromAgent: "system",
      toAgent: "codex",
      type: "review_request",
      content: codexPrompt
    });
    this.upsertWorkflow(taskId, "waiting_codex_review", message.id);
    return message;
  }

  getWorkflow(taskId: string): AgentWorkflowSnapshot {
    const row = this.db
      .prepare("SELECT * FROM agent_workflows WHERE task_id = ?")
      .get(taskId) as unknown as AgentWorkflowRow | undefined;

    if (row) {
      return rowToWorkflow(row);
    }

    return this.upsertWorkflow(taskId, "idle");
  }

  listMessages(taskId: string): AgentMessage[] {
    const rows = this.db
      .prepare("SELECT * FROM agent_messages WHERE task_id = ? ORDER BY created_at ASC")
      .all(taskId) as unknown as AgentMessageRow[];

    return rows.map(rowToMessage);
  }

  startReview(taskId: string): AgentMessage {
    const message = this.addMessage({
      taskId,
      fromAgent: "system",
      toAgent: "codex",
      type: "review_request",
      content: codexReviewPrompt()
    });
    this.upsertWorkflow(taskId, "waiting_codex_review", message.id);

    return message;
  }

  submitAgentMessage(taskId: string, input: SubmitAgentMessageInput): {
    accepted: AgentMessage;
    nextMessage?: AgentMessage;
    workflow: AgentWorkflowSnapshot;
  } {
    const current = this.getWorkflow(taskId);
    const accepted = this.addMessage({
      taskId,
      fromAgent: input.fromAgent,
      toAgent: "system",
      type: input.type,
      content: input.content
    });

    const next = this.nextAction(taskId, current.state, input);
    const workflow = this.upsertWorkflow(taskId, next.state, next.message?.id ?? accepted.id);

    return {
      accepted,
      nextMessage: next.message,
      workflow
    };
  }

  getPendingOutboundMessages(taskId: string): AgentMessage[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM agent_messages
         WHERE task_id = ? AND from_agent = 'system' AND to_agent IN ('claude', 'codex')
           AND id NOT IN (SELECT message_id FROM agent_message_deliveries WHERE task_id = ?)
         ORDER BY created_at ASC`
      )
      .all(taskId, taskId) as unknown as AgentMessageRow[];

    return rows.map(rowToMessage);
  }

  markDelivered(message: AgentMessage): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO agent_message_deliveries (
          message_id, task_id, to_agent, delivered_at
        ) VALUES (
          @messageId, @taskId, @toAgent, @deliveredAt
        )`
      )
      .run({
        messageId: message.id,
        taskId: message.taskId,
        toAgent: message.toAgent,
        deliveredAt: new Date().toISOString()
      });
  }

  private nextAction(
    taskId: string,
    state: AgentWorkflowState,
    input: SubmitAgentMessageInput
  ): { state: AgentWorkflowState; message?: AgentMessage } {
    if (state === "waiting_codex_review" && input.fromAgent === "codex" && input.type === "review_result") {
      const verdict = extractVerdict(input.content);
      if (verdict === "approved") {
        const message = this.addMessage({
          taskId,
          fromAgent: "system",
          toAgent: "claude",
          type: "wait",
          content: "Codex review approved. Wait for the system to run tests or generate artifacts."
        });
        return { state: "done", message };
      }

      const message = this.addMessage({
        taskId,
        fromAgent: "system",
        toAgent: "claude",
        type: "fix_request",
        content: claudeFixPrompt(input.content)
      });
      return { state: "waiting_claude_fix", message };
    }

    if (state === "waiting_claude_fix" && input.fromAgent === "claude" && input.type === "fix_result") {
      const bugContext = this.bugContexts.get(taskId);
      const content = bugContext
        ? `Claude reports the fix is complete.\n\nClaude fix summary:\n${input.content}\n\n---\n\nRe-review with the same QA bug entries:\n\n${bugContext}`
        : codexReReviewPrompt(input.content);
      const message = this.addMessage({
        taskId,
        fromAgent: "system",
        toAgent: "codex",
        type: "review_request",
        content
      });
      return { state: "waiting_codex_rereview", message };
    }

    if (state === "waiting_codex_rereview" && input.fromAgent === "codex" && input.type === "review_result") {
      const verdict = extractVerdict(input.content);
      if (verdict === "needs_human") {
        return { state: "needs_human" };
      }

      if (verdict === "approved") {
        const message = this.addMessage({
          taskId,
          fromAgent: "system",
          toAgent: "claude",
          type: "wait",
          content: "Codex re-review approved. Wait for the system to continue with tests or artifacts."
        });
        return { state: "done", message };
      }

      const message = this.addMessage({
        taskId,
        fromAgent: "system",
        toAgent: "claude",
        type: "fix_request",
        content: claudeFixPrompt(input.content)
      });
      return { state: "waiting_claude_fix", message };
    }

    if (input.type === "error") {
      return { state: "needs_human" };
    }

    return { state };
  }

  private addMessage(input: {
    taskId: string;
    fromAgent: AgentRole;
    toAgent: AgentRole;
    type: AgentMessageType;
    content: string;
  }): AgentMessage {
    const message: AgentMessage = {
      id: randomUUID(),
      taskId: input.taskId,
      fromAgent: input.fromAgent,
      toAgent: input.toAgent,
      type: input.type,
      content: input.content,
      createdAt: new Date().toISOString()
    };

    this.db
      .prepare(
        `INSERT INTO agent_messages (
          id, task_id, from_agent, to_agent, type, content, created_at
        ) VALUES (
          @id, @taskId, @fromAgent, @toAgent, @type, @content, @createdAt
        )`
      )
      .run({
        id: message.id,
        taskId: message.taskId,
        fromAgent: message.fromAgent,
        toAgent: message.toAgent,
        type: message.type,
        content: message.content,
        createdAt: message.createdAt
      });

    return message;
  }

  private upsertWorkflow(
    taskId: string,
    state: AgentWorkflowState,
    lastMessageId?: string
  ): AgentWorkflowSnapshot {
    const updatedAt = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO agent_workflows (task_id, state, last_message_id, updated_at)
         VALUES (@taskId, @state, @lastMessageId, @updatedAt)
         ON CONFLICT(task_id) DO UPDATE SET
           state = excluded.state,
           last_message_id = excluded.last_message_id,
           updated_at = excluded.updated_at`
      )
      .run({ taskId, state, lastMessageId: lastMessageId ?? null, updatedAt });

    return { taskId, state, lastMessageId, updatedAt };
  }
}

function rowToMessage(row: AgentMessageRow): AgentMessage {
  return {
    id: row.id,
    taskId: row.task_id,
    fromAgent: row.from_agent,
    toAgent: row.to_agent,
    type: row.type,
    content: row.content,
    createdAt: row.created_at
  };
}

function rowToWorkflow(row: AgentWorkflowRow): AgentWorkflowSnapshot {
  return {
    taskId: row.task_id,
    state: row.state,
    lastMessageId: row.last_message_id ?? undefined,
    updatedAt: row.updated_at
  };
}

function extractVerdict(content: string): "approved" | "needs_fix" | "needs_human" {
  const normalized = content.toLowerCase();
  if (normalized.includes("needs_human") || normalized.includes("needs human")) {
    return "needs_human";
  }
  if (normalized.includes("approved") || normalized.includes("pass") || normalized.includes("no blocking")) {
    return "approved";
  }
  return "needs_fix";
}

function codexReviewPrompt(): string {
  return `You are the Codex review agent.

Review the current git diff against the task requirement and skill context.

Write a structured review with this required final line:
Verdict: approved | needs_fix | needs_human

If there are blocking issues, explain each issue clearly.`;
}

function codexReReviewPrompt(fixSummary: string): string {
  return `Claude reports the review fix is complete.

Claude fix summary:
${fixSummary}

Re-review the current git diff and previous concerns.

Write a structured review with this required final line:
Verdict: approved | needs_fix | needs_human

When finished, print this exact machine-readable block in the terminal:
[[AI_TASK_WORKBENCH_RESULT]]
agent: codex
type: review_result
status: done
content: <review summary including Verdict: approved | needs_fix | needs_human>
[[/AI_TASK_WORKBENCH_RESULT]]`;
}

function claudeFixPrompt(reviewResult: string): string {
  return `Codex found issues that need fixing.

Codex review:
${reviewResult}

Please fix the blocking issues with the smallest correct change.

After fixing, respond through the agent channel with:
type: fix_result
content: a concise summary of what changed and what remains.

When finished, print this exact machine-readable block in the terminal:
[[AI_TASK_WORKBENCH_RESULT]]
agent: claude
type: fix_result
status: done
content: <short summary of how review feedback was fixed>
[[/AI_TASK_WORKBENCH_RESULT]]`;
}
