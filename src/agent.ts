import { createLogger } from "./logger";
import { executeStep } from "./executor";
import { planNextStep } from "./planner";
import type { AgentStep, Observation } from "./types";
import { config } from "./config";

const consola = createLogger("agent");

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

let finished = false;

for (let i = 0; i < MAX_STEPS; i++) {
    consola.info(`Step ${i + 1}`);

    let step: AgentStep;
    try {
        step = await planNextStep({ config, task, history });
    } catch (err) {
        consola.error(`Step ${i + 1}: planNextStep failed: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
    }

    consola.info("Tool:", step.tool, step.input);

    const observation = await executeStep(step);

    history.push({ step, observation });

    consola.log("OK:", observation.ok);
    consola.log(`Output (${step.tool}):`);
    consola.log(observation.output.slice(0, 2000));
    consola.log("----");

    if (step.tool === "finish") {
        finished = true;
        break;
    }
}

if (!finished) {
    consola.error(`Agent exhausted MAX_STEPS (${MAX_STEPS}) without finishing.`);
    process.exit(1);
}
