import { describe, it, expect, mock } from "bun:test";
import { executeStep } from "../src/executor";
import type { AgentStep, Observation } from "../src/types";

describe("executeStep", () => {
    it("returns the finish message as output", async () => {
        const step: AgentStep = { tool: "finish", input: { message: "all done" } };
        const obs = await executeStep(step);
        expect(obs.ok).toBe(true);
        expect(obs.output).toBe("all done");
    });

    it("returns ok:false for an unknown tool", async () => {
        const step = { tool: "unknown", input: {} } as unknown as AgentStep;
        const obs = await executeStep(step);
        expect(obs.ok).toBe(false);
        expect(obs.output).toContain("Unknown tool");
    });
});

// Since src/agent.ts is a script that executes immediately and calls process.exit(),
// we test the core logic loop separately here.
describe("agent loop logic", () => {
    it("stops when the finish tool is encountered", async () => {
        let callIndex = 0;
        const plannedSteps: AgentStep[] = [
            { tool: "listFiles", input: { dir: "." } },
            { tool: "finish", input: { message: "Done" } },
        ];

        const mockPlan = mock(async (): Promise<AgentStep> => plannedSteps[callIndex++]!);
        const mockExecute = mock(
            async (step: AgentStep): Promise<Observation> => ({
                ok: true,
                output: step.tool === "finish" ? step.input.message : "ok",
            }),
        );

        const history: Array<{ step: AgentStep; observation: Observation }> = [];
        const maxSteps = 5;

        for (let i = 0; i < maxSteps; i++) {
            const step = await mockPlan();
            const observation = await mockExecute(step);
            history.push({ step, observation });
            if (step.tool === "finish") break;
        }

        expect(history).toHaveLength(2);
        expect(history[0]?.step.tool).toBe("listFiles");
        expect(history[1]?.step.tool).toBe("finish");
        expect(mockPlan).toHaveBeenCalledTimes(2);
        expect(mockExecute).toHaveBeenCalledTimes(2);
    });

    it("stops after maxSteps even without a finish tool", async () => {
        const mockPlan = mock(
            async (): Promise<AgentStep> => ({
                tool: "listFiles",
                input: { dir: "." },
            }),
        );
        const mockExecute = mock(
            async (_step: AgentStep): Promise<Observation> => ({
                ok: true,
                output: "file1.ts",
            }),
        );

        const history: Array<{ step: AgentStep; observation: Observation }> = [];
        const maxSteps = 3;

        for (let i = 0; i < maxSteps; i++) {
            const step = await mockPlan();
            const observation = await mockExecute(step);
            history.push({ step, observation });
            if (step.tool === "finish") break;
        }

        expect(history).toHaveLength(3);
        expect(mockPlan).toHaveBeenCalledTimes(3);
        expect(mockExecute).toHaveBeenCalledTimes(3);
    });
});
