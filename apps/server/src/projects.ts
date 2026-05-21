import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import {
  projectDevelopmentActions,
  type ProjectDevelopmentAction,
  type ProjectDevelopmentStatus,
  type ProjectFlowStep,
  type ProjectState,
  type ProjectSummary,
  type RegisterProjectInput
} from "@ai-task-workbench/shared";

const registerProjectSchema = z.object({
  name: z.string().min(1).optional(),
  rootPath: z.string().min(1)
});

const developmentActionSchema = z.object({
  action: z.enum(projectDevelopmentActions)
});

const developmentStatusDetails: Record<ProjectDevelopmentStatus, { label: string; detail: string }> = {
  project_created: {
    label: "建立项目",
    detail: "Project folder is registered. Ready to start Claude development."
  },
  development_running: {
    label: "开发中",
    detail: "Claude is expected to run the start project skill in the project root."
  },
  dev_submitted: {
    label: "开发完成提交",
    detail: "Development result was submitted for Codex review."
  },
  review_running: {
    label: "质检中",
    detail: "Codex is reviewing with the fixed review prompt."
  },
  fixing_review: {
    label: "质检回来修复中",
    detail: "Claude is fixing Codex review feedback."
  },
  resubmitted: {
    label: "再次提交",
    detail: "Claude fix result was resubmitted for another review."
  },
  rereview_running: {
    label: "质检中",
    detail: "Codex is re-reviewing the fixed result."
  },
  review_done: {
    label: "质检结束",
    detail: "Codex approved the result. Ready to package."
  },
  packaging: {
    label: "结算中",
    detail: "Packaging skill is running and preparing the final files."
  },
  package_done: {
    label: "打包确认完成",
    detail: "The expected submission files are ready for web upload."
  },
  web_submitted: {
    label: "网页已提交",
    detail: "The final two generated files were submitted on the website."
  }
};

const actionToStatus: Record<ProjectDevelopmentAction, ProjectDevelopmentStatus> = {
  start_development: "development_running",
  submit_development: "dev_submitted",
  start_review: "review_running",
  request_fix: "fixing_review",
  resubmit_fix: "resubmitted",
  start_rereview: "rereview_running",
  approve_review: "review_done",
  start_packaging: "packaging",
  confirm_package: "package_done",
  submit_web: "web_submitted"
};

interface ProjectRow {
  id: string;
  name: string;
  root_path: string;
  created_at: string;
  updated_at: string;
}

export function parseRegisterProjectInput(input: unknown): RegisterProjectInput {
  return registerProjectSchema.parse(input);
}

export function parseDevelopmentAction(input: unknown): ProjectDevelopmentAction {
  return developmentActionSchema.parse(input).action;
}

export class ProjectRepository {
  constructor(private readonly db: DatabaseSync) {}

  async register(input: RegisterProjectInput): Promise<ProjectSummary> {
    const now = new Date().toISOString();
    const rootPath = resolve(input.rootPath);
    const existing = await this.getByRootPath(rootPath);

    if (existing) {
      return existing;
    }

    const id = randomUUID();
    const name = input.name ?? (basename(rootPath) || rootPath);

    this.db
      .prepare(
        `INSERT INTO projects (id, name, root_path, created_at, updated_at)
         VALUES (@id, @name, @rootPath, @createdAt, @updatedAt)`
      )
      .run({ id, name, rootPath, createdAt: now, updatedAt: now });

    await writeProjectState(rootPath, createInitialProjectState(id, rootPath, now));

    const project = await this.get(id);
    if (!project) {
      throw new Error(`Project ${id} was not registered`);
    }

    return project;
  }

  async list(): Promise<ProjectSummary[]> {
    const rows = this.db.prepare("SELECT * FROM projects ORDER BY updated_at DESC").all() as unknown as ProjectRow[];
    return Promise.all(rows.map((row) => rowToProject(row)));
  }

  async get(id: string): Promise<ProjectSummary | undefined> {
    const row = this.db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as ProjectRow | undefined;
    return row ? rowToProject(row) : undefined;
  }

  async getByRootPath(rootPath: string): Promise<ProjectSummary | undefined> {
    const row = this.db.prepare("SELECT * FROM projects WHERE root_path = ?").get(rootPath) as ProjectRow | undefined;
    if (!row) {
      return undefined;
    }

    return rowToProject(row);
  }

  async advanceDevelopment(id: string, action: ProjectDevelopmentAction): Promise<ProjectSummary | undefined> {
    const row = this.db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as ProjectRow | undefined;
    if (!row) {
      return undefined;
    }

    const now = new Date().toISOString();
    const nextStatus = actionToStatus[action];
    const state = await readProjectState(row.id, row.root_path, row.updated_at);
    const detail = developmentStatusDetails[nextStatus];
    const nextState: ProjectState = {
      ...state,
      mainPhase: "development",
      development: {
        status: nextStatus,
        detail: detail.detail,
        updatedAt: now
      },
      developmentFlow: buildDevelopmentFlow(nextStatus, state.developmentFlow, now),
      updatedAt: now
    };

    await writeProjectState(row.root_path, nextState);
    this.db.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(now, id);

    return this.get(id);
  }
}

async function rowToProject(row: ProjectRow): Promise<ProjectSummary> {
  return {
    id: row.id,
    name: row.name,
    rootPath: row.root_path,
    state: await readProjectState(row.id, row.root_path, row.updated_at),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function readProjectState(projectId: string, rootPath: string, fallbackUpdatedAt: string): Promise<ProjectState> {
  const statePath = getProjectStatePath(rootPath);

  try {
    const state = JSON.parse(await readFile(statePath, "utf8")) as ProjectState;
    if (!state.developmentFlow) {
      return {
        ...state,
        developmentFlow: buildDevelopmentFlow("project_created", [], fallbackUpdatedAt)
      };
    }

    return state;
  } catch {
    const state = createInitialProjectState(projectId, rootPath, fallbackUpdatedAt);
    await writeProjectState(rootPath, state);
    return state;
  }
}

function createInitialProjectState(projectId: string, rootPath: string, now: string): ProjectState {
  return {
    projectId,
    rootPath,
    mainPhase: "development",
    development: {
      status: "not_started",
      detail: "Waiting for development flow.",
      updatedAt: now
    },
    bugFix: {
      status: "not_started",
      detail: "Waiting for bug fix flow.",
      updatedAt: now
    },
    developmentFlow: buildDevelopmentFlow("project_created", [], now),
    updatedAt: now
  };
}

function buildDevelopmentFlow(
  activeStatus: ProjectDevelopmentStatus,
  previousSteps: ProjectFlowStep[],
  updatedAt: string
): ProjectFlowStep[] {
  const order = Object.keys(developmentStatusDetails) as ProjectDevelopmentStatus[];
  const activeIndex = order.indexOf(activeStatus);
  const previousUpdatedAt = new Map(previousSteps.map((step) => [step.key, step.updatedAt]));

  return order.map((key, index) => ({
    key,
    label: developmentStatusDetails[key].label,
    status: index < activeIndex ? "done" : index === activeIndex ? "active" : "pending",
    updatedAt: index <= activeIndex ? previousUpdatedAt.get(key) ?? updatedAt : undefined
  }));
}

async function writeProjectState(rootPath: string, state: ProjectState): Promise<void> {
  const tmpPath = resolve(rootPath, ".tmp");
  await mkdir(tmpPath, { recursive: true });
  await writeFile(getProjectStatePath(rootPath), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function getProjectStatePath(rootPath: string): string {
  return resolve(rootPath, ".tmp", "ai-task-workbench-state.json");
}
