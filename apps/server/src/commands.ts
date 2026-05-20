import { spawn } from "node:child_process";

export interface CommandCheck {
  command: string;
  available: boolean;
  error?: string;
}

export async function checkCommand(command: string): Promise<CommandCheck> {
  const probe = process.platform === "win32" ? "where" : "command";
  const args = process.platform === "win32" ? [command] : ["-v", command];

  return new Promise((resolve) => {
    const child = spawn(probe, args, { shell: process.platform !== "win32" });
    let stderr = "";

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      resolve({ command, available: false, error: error.message });
    });

    child.on("close", (code) => {
      resolve({
        command,
        available: code === 0,
        error: code === 0 ? undefined : stderr.trim() || `${command} was not found`
      });
    });
  });
}

export async function checkRequiredCommands(commands: string[]): Promise<CommandCheck[]> {
  return Promise.all([...new Set(commands)].map((command) => checkCommand(command)));
}
