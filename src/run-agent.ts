import type { Config, Observation } from "./types";
import { planNextStep } from "./planner";
import { executeStep } from "./executor";

export type AgentEvent =
    | { kind: "step_start"; stepNumber: number; tool: string; input: unknown }
    | { kind: "step_done"; stepNumber: number; tool: string; observation: Observation }
    | { kind: "agent_finished"; message: string }
    | { kind: "agent_failed"; reason: "max_steps" | "aborted" | "error"; message: string };

export interface AgentController {
    abort(): void;
    pause(): void;
    resume(): void;
    waitForResume(): Promise<void>;
    readonly aborted: boolean;
    readonly paused: boolean;
}

export function createAgentController(): AgentController {
    let aborted = false;
    let paused = false;
    // resolve fn for the current pause promise; null when not paused
    let resumeResolve: (() => void) | null = null;

    return {
        abort() { aborted = true; },
        pause() {
            if (!aborted) paused = true;
        },
        resume() {
            paused = false;
            resumeResolve?.();
            resumeResolve = null;
        },
        waitForResume() {
            if (!paused) return Promise.resolve();
            return new Promise<void>(resolve => { resumeResolve = resolve; });
        },
        get aborted() { return aborted; },
        get paused() { return paused; },
    };
}

export async function runAgent(
    task: string,
    config: Config,
    onEvent: (event: AgentEvent) => void,
    controller?: AgentController,
): Promise<void> {
    const history: Array<{ step: Awaited<ReturnType<typeof planNextStep>>; observation: Observation }> = [];

    for (let i = 0; i < config.maxSteps; i++) {
        let step: Awaited<ReturnType<typeof planNextStep>>;
        try {
            step = await planNextStep({ config, task, history });
        } catch (err) {
            onEvent({
                kind: "agent_failed",
                reason: "error",
                message: err instanceof Error ? err.message : String(err),
            });
            return;
        }

        onEvent({ kind: "step_start", stepNumber: i + 1, tool: step.tool, input: step.input });

        const observation = await executeStep(step);
        history.push({ step, observation });

        onEvent({ kind: "step_done", stepNumber: i + 1, tool: step.tool, observation });

        if (step.tool === "finish") {
            onEvent({ kind: "agent_finished", message: step.input.message });
            return;
        }

        if (controller?.aborted) {
            onEvent({ kind: "agent_failed", reason: "aborted", message: "Aborted by user." });
            return;
        }

        if (controller?.paused) {
            await controller.waitForResume();
        }
    }

    onEvent({ kind: "agent_failed", reason: "max_steps", message: `Exhausted ${config.maxSteps} steps without finishing.` });
}
