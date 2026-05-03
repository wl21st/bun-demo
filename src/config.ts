import { consola } from "consola";

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) {
        consola.error("OPENAI_API_KEY is required");
        process.exit(1);
    }
    return {
        apiKey,
        baseURL: env.OPENAI_BASE_URL,
        model: env.OPENAI_MODEL ?? "gpt-4o",
        maxSteps: Number(env.MAX_STEPS ?? "12"),
    } as const;
}

export const config = loadConfig();
