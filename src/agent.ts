import { createLogger } from "./logger";

const consola = createLogger("agent");
import { executeStep } from "./executor";
import { planNextStep } from "./planner";
import type { AgentStep, Observation } from "./types";
import { config } from "./config";

const task = process.argv.slice(2).join(" ");

if (!task) {
    consola.error(`Usage:\nbun run agent "generate tests for demo/math.ts and make them pass"`);
    process.exit(1);
}

const history: Array<{
    step: AgentStep;
    observation: Observation;
}> = [];

const MAX_STEPS = config.maxSteps;

consola.info("Task:", task);
consola.log("----");

for (let i = 0; i < MAX_STEPS; i++) {
    consola.info(`Step ${i + 1}`);

    const step = await planNextStep({
        config,
        task,
        history,
    });

    consola.info("Tool:", step.tool);

    const observation = await executeStep(step);

    history.push({
        step,
        observation,
    });

    consola.log("OK:", observation.ok);
    consola.log("Output:");
    consola.log(observation.output.slice(0, 2000));
    consola.log("----");

    if (step.tool === "finish") {
        break;
    }
}