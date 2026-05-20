import { createHash } from "node:crypto";
import type { AgentMessageType, AgentRole, SubmitAgentMessageInput } from "@ai-task-workbench/shared";

const resultPattern = /\[\[AI_TASK_WORKBENCH_RESULT\]\]([\s\S]*?)\[\[\/AI_TASK_WORKBENCH_RESULT\]\]/g;

export interface ParsedAgentResult {
  hash: string;
  input: SubmitAgentMessageInput;
}

export function parseAgentResults(output: string): ParsedAgentResult[] {
  const results: ParsedAgentResult[] = [];
  const matches = output.matchAll(resultPattern);

  for (const match of matches) {
    const rawBlock = match[0];
    const body = match[1] ?? "";
    const fields = parseFields(body);
    const fromAgent = normalizeAgent(fields.agent);
    const type = normalizeType(fields.type);
    const content = fields.content?.trim();

    if (!fromAgent || !type || !content) {
      continue;
    }

    results.push({
      hash: createHash("sha256").update(rawBlock).digest("hex"),
      input: {
        fromAgent,
        type,
        content
      }
    });
  }

  return results;
}

function parseFields(body: string): Record<string, string> {
  const lines = body.trim().split(/\r?\n/);
  const fields: Record<string, string> = {};
  let currentKey: string | undefined;

  for (const line of lines) {
    const match = /^(agent|type|status|content):\s*(.*)$/i.exec(line);
    if (match) {
      currentKey = match[1].toLowerCase();
      fields[currentKey] = match[2] ?? "";
      continue;
    }

    if (currentKey === "content") {
      fields.content = `${fields.content}\n${line}`;
    }
  }

  return fields;
}

function normalizeAgent(value: string | undefined): AgentRole | undefined {
  if (value === "claude" || value === "codex") {
    return value;
  }

  return undefined;
}

function normalizeType(value: string | undefined): AgentMessageType | undefined {
  if (value === "review_result" || value === "fix_result" || value === "error") {
    return value;
  }

  return undefined;
}
