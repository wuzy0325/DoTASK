import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { taskStatuses, taskTypes, type CreateTaskInput, type TaskDetail, type TaskSummary, type UpdateTaskInput } from "@ai-task-workbench/shared";

const createTaskSchema = z.object({
  id: z.string().min(1).optional(),
  title: z.string().min(1),
  type: z.enum(taskTypes),
  repoUrl: z.string().min(1),
  baseBranch: z.string().min(1),
  branch: z.string().min(1),
  skillProfile: z.string().min(1),
  requirementMarkdown: z.string().min(1)
});

const updateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  status: z.enum(taskStatuses).optional(),
  repoUrl: z.string().min(1).optional(),
  baseBranch: z.string().min(1).optional(),
  branch: z.string().min(1).optional(),
  skillProfile: z.string().min(1).optional(),
  requirementMarkdown: z.string().min(1).optional(),
  workspacePath: z.string().min(1).optional()
});

interface TaskRow {
  id: string;
  title: string;
  type: "feature" | "qa_fix";
  status: TaskSummary["status"];
  repo_url: string;
  workspace_path: string | null;
  base_branch: string;
  branch: string;
  skill_profile: string;
  requirement_markdown: string;
  created_at: string;
  updated_at: string;
}

export function parseCreateTaskInput(input: unknown): CreateTaskInput {
  return createTaskSchema.parse(input);
}

export function parseUpdateTaskInput(input: unknown): UpdateTaskInput {
  return updateTaskSchema.parse(input);
}

export class TaskRepository {
  constructor(private readonly db: DatabaseSync) {}

  create(input: CreateTaskInput): TaskDetail {
    const now = new Date().toISOString();
    const id = input.id ?? randomUUID();

    const statement = this.db.prepare(
      `INSERT INTO tasks (
          id, title, type, status, phase, repo_url, workspace_path, base_branch, branch,
          skill_profile, requirement_markdown, created_at, updated_at
        ) VALUES (
          @id, @title, @type, @status, @phase, @repoUrl, @workspacePath, @baseBranch,
          @branch, @skillProfile, @requirementMarkdown, @createdAt, @updatedAt
        )`
    );
    statement.run({
      id,
      title: input.title,
      type: input.type,
      status: "READY",
      phase: null,
      repoUrl: input.repoUrl,
      workspacePath: null,
      baseBranch: input.baseBranch,
      branch: input.branch,
      skillProfile: input.skillProfile,
      requirementMarkdown: input.requirementMarkdown,
      createdAt: now,
      updatedAt: now
    });

    const task = this.get(id);
    if (!task) {
      throw new Error(`Task ${id} was not created`);
    }

    return task;
  }

  list(): TaskSummary[] {
    const rows = this.db
      .prepare("SELECT * FROM tasks ORDER BY updated_at DESC")
      .all() as unknown as TaskRow[];

    return rows.map(rowToSummary);
  }

  get(id: string): TaskDetail | undefined {
    const row = this.db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as TaskRow | undefined;
    return row ? rowToDetail(row) : undefined;
  }

  update(id: string, input: UpdateTaskInput): TaskDetail | undefined {
    const current = this.get(id);
    if (!current) {
      return undefined;
    }

    const next = {
      title: input.title ?? current.title,
      status: input.status ?? current.status,
      repoUrl: input.repoUrl ?? current.repoUrl,
      baseBranch: input.baseBranch ?? current.baseBranch,
      branch: input.branch ?? current.branch,
      skillProfile: input.skillProfile ?? current.skillProfile,
      requirementMarkdown: input.requirementMarkdown ?? current.requirementMarkdown,
      workspacePath: input.workspacePath ?? current.workspacePath ?? null,
      updatedAt: new Date().toISOString(),
      id
    };

    this.db
      .prepare(
        `UPDATE tasks SET
          title = @title,
          status = @status,
          repo_url = @repoUrl,
          base_branch = @baseBranch,
          branch = @branch,
          skill_profile = @skillProfile,
          requirement_markdown = @requirementMarkdown,
          workspace_path = @workspacePath,
          updated_at = @updatedAt
        WHERE id = @id`
      )
      .run(next);

    return this.get(id);
  }
}

function rowToSummary(row: TaskRow): TaskSummary {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    status: row.status,
    repoUrl: row.repo_url,
    baseBranch: row.base_branch,
    branch: row.branch,
    skillProfile: row.skill_profile,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function rowToDetail(row: TaskRow): TaskDetail {
  return {
    ...rowToSummary(row),
    requirementMarkdown: row.requirement_markdown,
    workspacePath: row.workspace_path ?? undefined
  };
}
