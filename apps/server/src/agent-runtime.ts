import { AgentChannelService } from "./agent-channel.js";
import { parseAgentResults } from "./agent-result-parser.js";
import { AgentTerminalEventRepository } from "./agent-terminal-events.js";
import { TerminalService, type TerminalWindow } from "./terminal.js";

type RuntimeState = "stopped" | "running";

export interface AgentRuntimeStatus {
  taskId: string;
  state: RuntimeState;
  intervalMs: number;
  lastTickAt?: string;
  lastError?: string;
}

interface RuntimeHandle {
  status: AgentRuntimeStatus;
  timer?: NodeJS.Timeout;
}

export class AgentRuntimeManager {
  private readonly runtimes = new Map<string, RuntimeHandle>();

  constructor(
    private readonly agentChannel: AgentChannelService,
    private readonly terminals: TerminalService,
    private readonly terminalEvents: AgentTerminalEventRepository
  ) {}

  start(taskId: string, intervalMs = 3000): AgentRuntimeStatus {
    const existing = this.runtimes.get(taskId);
    if (existing?.timer) {
      return existing.status;
    }

    const handle: RuntimeHandle = {
      status: {
        taskId,
        state: "running",
        intervalMs
      }
    };

    handle.timer = setInterval(() => {
      this.tick(taskId).catch((error: unknown) => {
        handle.status.lastError = error instanceof Error ? error.message : String(error);
      });
    }, intervalMs);
    handle.timer.unref?.();

    this.runtimes.set(taskId, handle);
    void this.tick(taskId);

    return handle.status;
  }

  stop(taskId: string): AgentRuntimeStatus {
    const existing = this.runtimes.get(taskId);
    if (existing?.timer) {
      clearInterval(existing.timer);
    }

    const status: AgentRuntimeStatus = {
      taskId,
      state: "stopped",
      intervalMs: existing?.status.intervalMs ?? 3000,
      lastTickAt: existing?.status.lastTickAt,
      lastError: existing?.status.lastError
    };
    this.runtimes.set(taskId, { status });

    return status;
  }

  status(taskId: string): AgentRuntimeStatus {
    return this.runtimes.get(taskId)?.status ?? { taskId, state: "stopped", intervalMs: 3000 };
  }

  async tick(taskId: string): Promise<AgentRuntimeStatus> {
    const handle = this.runtimes.get(taskId) ?? {
      status: { taskId, state: "stopped" as RuntimeState, intervalMs: 3000 }
    };
    handle.status.lastTickAt = new Date().toISOString();
    handle.status.lastError = undefined;
    this.runtimes.set(taskId, handle);

    try {
      await this.deliverPending(taskId);

      const workflow = this.agentChannel.getWorkflow(taskId);
      const window = windowForWorkflow(workflow.state);
      if (window) {
        await this.pollWindow(taskId, window);
        await this.deliverPending(taskId);
      }
    } catch (error) {
      handle.status.lastError = error instanceof Error ? error.message : String(error);
    }

    return handle.status;
  }

  private async deliverPending(taskId: string): Promise<void> {
    const messages = this.agentChannel.getPendingOutboundMessages(taskId);

    for (const message of messages) {
      if (message.toAgent === "claude" || message.toAgent === "codex") {
        await this.terminals.sendMessage(taskId, message.toAgent, message.content);
        this.agentChannel.markDelivered(message);
      }
    }
  }

  private async pollWindow(taskId: string, window: TerminalWindow): Promise<void> {
    const output = await this.terminals.captureWindow(taskId, window);
    const parsed = parseAgentResults(output);

    for (const result of parsed) {
      if (this.terminalEvents.hasEvent(taskId, window, result.hash)) {
        continue;
      }

      this.terminalEvents.saveEvent({
        taskId,
        windowName: window,
        eventHash: result.hash,
        fromAgent: result.input.fromAgent,
        type: result.input.type,
        content: result.input.content
      });

      this.agentChannel.submitAgentMessage(taskId, result.input);
    }
  }
}

function windowForWorkflow(state: string): TerminalWindow | undefined {
  if (state === "waiting_codex_review" || state === "waiting_codex_rereview") {
    return "codex";
  }

  if (state === "waiting_claude_fix") {
    return "claude";
  }

  return undefined;
}
