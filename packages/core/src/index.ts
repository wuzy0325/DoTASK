export type StepResult =
  | { status: "passed"; outputPath?: string }
  | { status: "failed"; errorMessage: string; outputPath?: string }
  | { status: "needs_human"; errorMessage: string; outputPath?: string }
  | { status: "skipped"; outputPath?: string };

export interface StepRunner<TTask> {
  name: string;
  canRun(task: TTask): Promise<boolean>;
  run(task: TTask): Promise<StepResult>;
}

export function createWorkspaceSlug(taskId: string, title: string): string {
  const normalizedTitle = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return normalizedTitle ? `task-${taskId}-${normalizedTitle}` : `task-${taskId}`;
}
