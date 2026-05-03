import type { AgentStep, Observation } from "./types";
import { listFiles, readFile, runTests, shell, writeFile } from "./tools";

export async function executeStep(step: AgentStep): Promise<Observation> {
    switch (step.tool) {
        case "listFiles":
            return listFiles(step.input.dir);

        case "readFile":
            return readFile(step.input.path);

        case "writeFile":
            return writeFile(step.input.path, step.input.content);

        case "shell":
            return shell(step.input.command);

        case "test":
            return runTests();

        case "finish":
            return {
                ok: true,
                output: step.input.message,
            };

        default:
            return {
                ok: false,
                output: `Unknown tool: ${JSON.stringify(step)}`,
            };
    }
}