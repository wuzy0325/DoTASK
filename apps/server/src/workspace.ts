import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createWorkspaceSlug } from "@ai-task-workbench/core";
import type { TaskDetail } from "@ai-task-workbench/shared";
import type { RuntimePaths } from "./config.js";

export interface PreparedWorkspace {
  workspacePath: string;
  metaPath: string;
  taskJsonPath: string;
  requirementPath: string;
  startMindProjectPromptPath: string;
}

export class WorkspaceManager {
  constructor(private readonly runtimePaths: RuntimePaths) {}

  async prepareTaskWorkspace(task: TaskDetail): Promise<PreparedWorkspace> {
    const workspacePath = task.workspacePath ?? resolve(this.runtimePaths.workspaceRoot, createWorkspaceSlug(task.id, task.title));
    const metaPath = resolve(workspacePath, ".task-meta");
    const taskJsonPath = resolve(metaPath, "task.json");
    const requirementPath = resolve(metaPath, "requirement.md");
    const startMindProjectPromptPath = resolve(metaPath, "start-mind-project.md");
    const startMindProjectPrompt = buildStartMindProjectPrompt(task);

    await mkdir(workspacePath, { recursive: true });
    await mkdir(metaPath, { recursive: true });
    await writeFile(taskJsonPath, `${JSON.stringify(task, null, 2)}\n`, "utf8");
    await writeFile(requirementPath, task.requirementMarkdown, "utf8");
    await writeFile(startMindProjectPromptPath, startMindProjectPrompt, "utf8");

    return {
      workspacePath,
      metaPath,
      taskJsonPath,
      requirementPath,
      startMindProjectPromptPath
    };
  }
}

export function buildStartMindProjectPrompt(task: TaskDetail): string {
  return `start mind project

Project ID: ${task.id}
Task title: ${task.title}
Git address: ${task.repoUrl}
Base branch: ${task.baseBranch}
Task branch: ${task.branch}
Skill profile: ${task.skillProfile}

User prompt:
${task.requirementMarkdown}
`;
}
