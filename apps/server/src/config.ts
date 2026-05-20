import { access, mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { parse } from "yaml";
import { z } from "zod";

const commandSchema = z.object({
  command: z.string().min(1),
  args: z.array(z.string()).default([])
});

const appConfigSchema = z.object({
  workspaceRoot: z.string().min(1),
  agents: z.object({
    claude: commandSchema,
    codex: commandSchema
  }),
  terminal: z.object({
    backend: z.literal("tmux"),
    shell: z.string().min(1)
  }),
  concurrency: z.object({
    maxAutoPipelines: z.number().int().positive(),
    maxClaudeAgents: z.number().int().positive(),
    maxCodexAgents: z.number().int().positive(),
    maxTestRunners: z.number().int().positive()
  }),
  git: z.object({
    defaultBaseBranch: z.string().min(1),
    autoPush: z.boolean(),
    commitMessageTemplate: z.object({
      feature: z.string().min(1),
      fix: z.string().min(1)
    })
  }),
  skills: z.object({
    root: z.string().min(1),
    defaultProfile: z.string().min(1)
  }),
  checks: z.object({
    autoDetect: z.boolean(),
    defaultCommands: z.record(z.record(z.string()))
  })
});

export type AppConfig = z.infer<typeof appConfigSchema>;

export interface RuntimePaths {
  appRoot: string;
  workspaceRoot: string;
  skillsRoot: string;
}

function expandHome(path: string): string {
  return path === "~" || path.startsWith("~/") ? resolve(homedir(), path.slice(2)) : path;
}

export async function loadAppConfig(configPath?: string): Promise<AppConfig> {
  const raw = await readFile(configPath ?? (await findConfigPath()), "utf8");
  return appConfigSchema.parse(parse(raw));
}

async function findConfigPath(): Promise<string> {
  let current = process.cwd();

  while (true) {
    const candidate = resolve(current, "config/app.config.yaml");
    if (await pathExists(candidate)) {
      return candidate;
    }

    const parent = dirname(current);
    if (parent === current) {
      throw new Error("Could not find config/app.config.yaml from current working directory");
    }

    current = parent;
  }
}

export function resolveRuntimePaths(config: AppConfig): RuntimePaths {
  const workspaceRoot = expandHome(config.workspaceRoot);
  const skillsRoot = expandHome(config.skills.root);

  return {
    appRoot: resolve(workspaceRoot, ".."),
    workspaceRoot,
    skillsRoot
  };
}

export async function ensureRuntimeDirectories(paths: RuntimePaths): Promise<void> {
  await mkdir(paths.appRoot, { recursive: true });
  await mkdir(paths.workspaceRoot, { recursive: true });
  await mkdir(paths.skillsRoot, { recursive: true });
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
