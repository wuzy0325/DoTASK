import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

export interface BugEntry {
  fileName: string;
  content: string;
}

export async function scanBugFiles(workspacePath: string): Promise<BugEntry[]> {
  const bugDir = resolve(workspacePath, ".tmp/bug");
  let entries: string[];

  try {
    entries = await readdir(bugDir);
  } catch {
    return [];
  }

  const results: BugEntry[] = [];

  for (const entry of entries) {
    if (entry.startsWith(".")) {
      continue;
    }

    const fullPath = resolve(bugDir, entry);
    try {
      const content = await readFile(fullPath, "utf8");
      results.push({ fileName: entry, content });
    } catch {
      continue;
    }
  }

  return results;
}

export function generateQaFixCodexPrompt(bugEntries: BugEntry[]): string {
  const bugList = bugEntries
    .map(
      (b, i) =>
        `Bug Entry ${i + 1} — ${b.fileName}\n${b.content}`
    )
    .join("\n\n---\n\n");

  return `You are the Codex QA bug fix review agent.

Bug entries from QA:

${bugList}

For each bug entry above:
1. Review the current code.
2. Determine whether the bug has been fixed.
3. If not fixed, provide clear, specific fix guidance (file paths, line numbers, logic changes).
4. If fixed, mark it as resolved.

At the end, output exactly:

Verdict: approved | needs_fix | needs_human

- "approved" only when ALL bug entries are resolved.
- "needs_fix" when any bug entry is still unresolved.
- "needs_human" when you cannot determine or need manual intervention.

When finished, print this exact block:

[[AI_TASK_WORKBENCH_RESULT]]
agent: codex
type: review_result
status: done
content: <your structured review and verdict>
[[/AI_TASK_WORKBENCH_RESULT]]`;
}

export function generateQaFixClaudePrompt(reviewContent: string): string {
  return `Codex reviewed the QA bug entries and found issues that need fixing.

Codex review:
${reviewContent}

Please fix all blocking issues with the smallest correct changes.
After fixing, respond through the agent channel.

When finished, print this exact block:

[[AI_TASK_WORKBENCH_RESULT]]
agent: claude
type: fix_result
status: done
content: <short summary of what was fixed>
[[/AI_TASK_WORKBENCH_RESULT]]`;
}
