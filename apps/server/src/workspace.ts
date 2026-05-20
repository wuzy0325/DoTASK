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
}

export class WorkspaceManager {
  constructor(private readonly runtimePaths: RuntimePaths) {}

  async prepareTaskWorkspace(task: TaskDetail): Promise<PreparedWorkspace> {
    const workspacePath = task.workspacePath ?? resolve(this.runtimePaths.workspaceRoot, createWorkspaceSlug(task.id, task.title));
    const metaPath = resolve(workspacePath, ".task-meta");
    const taskJsonPath = resolve(metaPath, "task.json");
    const requirementPath = resolve(metaPath, "requirement.md");

    await mkdir(workspacePath, { recursive: true });
    await mkdir(metaPath, { recursive: true });
    await writeFile(taskJsonPath, `${JSON.stringify(task, null, 2)}\n`, "utf8");
    await writeFile(requirementPath, task.requirementMarkdown, "utf8");

    return {
      workspacePath,
      metaPath,
      taskJsonPath,
      requirementPath
    };
  }
}
