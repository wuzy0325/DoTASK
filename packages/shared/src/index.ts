export const taskTypes = ["feature", "qa_fix"] as const;

export type TaskType = (typeof taskTypes)[number];

export const taskStatuses = [
  "DRAFT",
  "READY",
  "CLONING",
  "WORKSPACE_READY",
  "CONTEXT_READY",
  "AGENTS_READY",
  "DEV_RUNNING",
  "DEV_DONE",
  "REVIEW_RUNNING",
  "REVIEW_DONE",
  "FIXING_REVIEW",
  "FIX_DONE",
  "TESTING",
  "TEST_PASSED",
  "COMMITTING",
  "COMMITTED",
  "PUSHING",
  "PUSHED",
  "ARTIFACT_GENERATING",
  "ARTIFACT_READY",
  "DONE",
  "FAILED_CLONE",
  "FAILED_CONTEXT",
  "FAILED_AGENT_START",
  "FAILED_DEV",
  "FAILED_REVIEW",
  "FAILED_FIX",
  "FAILED_TEST",
  "FAILED_COMMIT",
  "FAILED_PUSH",
  "FAILED_ARTIFACT",
  "NEEDS_HUMAN",
  "PAUSED",
  "CANCELLED"
] as const;

export type TaskStatus = (typeof taskStatuses)[number];

export const pipelineSteps = [
  "clone",
  "prepareContext",
  "startAgents",
  "dev",
  "review",
  "fixReview",
  "test",
  "commit",
  "push",
  "generateArtifact"
] as const;

export type PipelineStepName = (typeof pipelineSteps)[number];

export const stepStatuses = ["pending", "running", "passed", "failed", "skipped", "needs_human"] as const;

export type StepStatus = (typeof stepStatuses)[number];

export interface TaskSummary {
  id: string;
  title: string;
  type: TaskType;
  status: TaskStatus;
  repoUrl: string;
  baseBranch: string;
  branch: string;
  skillProfile: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskDetail extends TaskSummary {
  requirementMarkdown: string;
  workspacePath?: string;
}

export interface CreateTaskInput {
  id?: string;
  title: string;
  type: TaskType;
  repoUrl: string;
  baseBranch: string;
  branch: string;
  skillProfile: string;
  requirementMarkdown: string;
}

export interface UpdateTaskInput {
  title?: string;
  status?: TaskStatus;
  repoUrl?: string;
  baseBranch?: string;
  branch?: string;
  skillProfile?: string;
  requirementMarkdown?: string;
  workspacePath?: string;
}

export const agentRoles = ["claude", "codex", "system"] as const;

export type AgentRole = (typeof agentRoles)[number];

export const agentMessageTypes = [
  "review_request",
  "review_result",
  "fix_request",
  "fix_result",
  "status_update",
  "wait",
  "error"
] as const;

export type AgentMessageType = (typeof agentMessageTypes)[number];

export const agentWorkflowStates = [
  "idle",
  "waiting_codex_review",
  "codex_review_done",
  "waiting_claude_fix",
  "claude_fix_done",
  "waiting_codex_rereview",
  "done",
  "needs_human"
] as const;

export type AgentWorkflowState = (typeof agentWorkflowStates)[number];

export interface AgentMessage {
  id: string;
  taskId: string;
  fromAgent: AgentRole;
  toAgent: AgentRole;
  type: AgentMessageType;
  content: string;
  createdAt: string;
}

export interface AgentWorkflowSnapshot {
  taskId: string;
  state: AgentWorkflowState;
  lastMessageId?: string;
  updatedAt: string;
}

export interface SubmitAgentMessageInput {
  fromAgent: AgentRole;
  type: AgentMessageType;
  content: string;
}
