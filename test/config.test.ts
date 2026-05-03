import { describe, it, expect } from "bun:test";
import { consola } from "consola";
import OpenAI from "openai";
import { loadConfig } from "../src/config";

describe("config", () => {
    const base = { OPENAI_API_KEY: "test-key" };

    it("exports apiKey from OPENAI_API_KEY", () => {
        const config = loadConfig({ ...base, OPENAI_API_KEY: "test-key-123" });
        expect(config.apiKey).toBe("test-key-123");
    });

    it("exports baseURL from OPENAI_BASE_URL", () => {
        const config = loadConfig({ ...base, OPENAI_BASE_URL: "https://integrate.api.nvidia.com/v1" });
        expect(config.baseURL).toBe("https://integrate.api.nvidia.com/v1");
    });

    it("baseURL is undefined when OPENAI_BASE_URL is not set", () => {
        const config = loadConfig({ ...base });
        expect(config.baseURL).toBeUndefined();
    });

    it("defaults model to gpt-4o when OPENAI_MODEL is not set", () => {
        const config = loadConfig({ ...base });
        expect(config.model).toBe("gpt-4o");
    });

    it("uses OPENAI_MODEL when set", () => {
        const config = loadConfig({ ...base, OPENAI_MODEL: "google/gemma-4-31b-it" });
        expect(config.model).toBe("google/gemma-4-31b-it");
    });

    it("defaults maxSteps to 12 when MAX_STEPS is not set", () => {
        const config = loadConfig({ ...base });
        expect(config.maxSteps).toBe(12);
    });

    it("parses MAX_STEPS as a number", () => {
        const config = loadConfig({ ...base, MAX_STEPS: "20" });
        expect(config.maxSteps).toBe(20);
    });

    it("check if the LLM configuration is valid", async () => {
        const config = loadConfig();

        const client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL });
        const response = await client.chat.completions.create({
            model: config.model,
            messages: [{ role: "user", content: "Say 'ok'" }],
            max_completion_tokens: 16,
        });
        const text = response.choices[0]?.message?.content ?? "";
        expect(text.length).toBeGreaterThan(0);
        consola.info(`model: ${config.model}`);
        consola.info(`response: ${text.trim()}`);
    }, 30_000);
});
