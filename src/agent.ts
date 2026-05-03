import { createLogger } from "./logger";
import { config } from "./config";
import { runAgent } from "./run-agent";
import type { AgentEvent } from "./run-agent";

const consola = createLogger("agent");

const task = process.argv.slice(2).join(" ");

if (!task) {
    consola.error(`Usage:\nbun run agent "generate tests for demo/math.ts and make them pass"`);
    process.exit(1);
}

consola.info("Task:", task);
consola.log("----");

await runAgent(task, config, (event: AgentEvent) => {
    switch (event.kind) {
        case "step_start":
            consola.info(`Step ${event.stepNumber}`);
            consola.info("Tool:", event.tool, event.input);
            break;
        case "step_done":
            consola.log("OK:", event.observation.ok);
            consola.log(`Output (${event.tool}):`);
            consola.log(event.observation.output.slice(0, 2000));
            consola.log("----");
            break;
        case "agent_finished":
            break;
        case "agent_failed":
            consola.error(event.message);
            process.exit(1);
    }
});
