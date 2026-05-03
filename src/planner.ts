import OpenAI from "openai";
import type { AgentStep, Config, Observation } from "./types";

const instructions = `
You are a local code AI Agent.

Your goals:
- Operate on the current project according to the user's task
- You can read files, write files, list files, execute shell commands, and run tests
- Choose only one tool per turn
- If tests fail, continue fixing based on the errors
- Do not explain your process — return JSON only

You may only return one of the following JSON objects:

1. List files:
{
  "tool": "listFiles",
  "input": { "dir": "." }
}

2. Read file:
{
  "tool": "readFile",
  "input": { "path": "demo/math.ts" }
}

3. Write file:
{
  "tool": "writeFile",
  "input": {
    "path": "demo/math.test.ts",
    "content": "file content"
  }
}

4. Execute shell:
{
  "tool": "shell",
  "input": { "command": "ls" }
}

5. Run tests:
{
  "tool": "test",
  "input": {}
}

6. Finish:
{
  "tool": "finish",
  "input": { "message": "completion message" }
}

Hard rules:
- Output JSON only
- No Markdown
- No explanatory text
- Do not delete user files
- Do not run dangerous commands
- Prefer operating inside the demo/ directory
`;

export async function planNextStep(params: {
    config: Config;
    task: string;
    history: Array<{
        step: AgentStep;
        observation: Observation;
    }>;
}): Promise<AgentStep> {
    const client = new OpenAI({ apiKey: params.config.apiKey, baseURL: params.config.baseURL });
    const userInput = `
User task:
${params.task}

History and observations:
${JSON.stringify(params.history, null, 2)}
`;

    const response = await client.chat.completions.create({
        model: params.config.model,
        messages: [
            {
                role: "system",
                content: instructions,
            },
            {
                role: "user",
                content: userInput,
            },
        ],
    });

    const text = response.choices[0]?.message?.content?.trim() ?? "";

    try {
        return JSON.parse(stripCodeFence(text));
    } catch {
        throw new Error(`Model did not return valid JSON:\n${text}`);
    }
}

function stripCodeFence(text: string): string {
    const match = text.match(/```[\w]*\n?([\s\S]*?)\n?```/i);
    return match ? match[1]!.trim() : text.trim();
}