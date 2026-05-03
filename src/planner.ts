import OpenAI from "openai";
import { mkdir, appendFile } from "node:fs/promises";
import type { AgentStep, Config, Observation, TransportLogEntry } from "./types";
import { createLogger, abbrev, filterHeaders } from "./logger";

const plannerLog = createLogger("planner");

const instructions = `
You are a local code AI Agent.

Your goals:
- Operate on the current project according to the user's task
- You can read files, write files, list files, execute shell commands, and run tests
- Choose only one tool per turn
- If tests fail, continue fixing based on the errors
- Do not delete user files
- Do not run dangerous commands
- Prefer operating inside the project directory
`;

const AGENT_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
    {
        type: "function",
        function: {
            name: "listFiles",
            description: "List files in a directory",
            parameters: {
                type: "object",
                properties: {
                    dir: { type: "string", description: "Directory path to list" },
                },
                required: ["dir"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "readFile",
            description: "Read a file's contents",
            parameters: {
                type: "object",
                properties: {
                    path: { type: "string", description: "File path to read" },
                },
                required: ["path"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "writeFile",
            description: "Write content to a file",
            parameters: {
                type: "object",
                properties: {
                    path: { type: "string", description: "File path to write" },
                    content: { type: "string", description: "Content to write" },
                },
                required: ["path", "content"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "shell",
            description: "Execute a shell command",
            parameters: {
                type: "object",
                properties: {
                    command: { type: "string", description: "Shell command to execute" },
                },
                required: ["command"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "test",
            description: "Run the project's test suite",
            parameters: {
                type: "object",
                properties: {},
                required: [],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "finish",
            description: "Signal that the task is complete",
            parameters: {
                type: "object",
                properties: {
                    message: { type: "string", description: "Completion message" },
                },
                required: ["message"],
            },
        },
    },
];

let logsEnsured = false;

async function ensureLogsDir(): Promise<void> {
    if (!logsEnsured) {
        await mkdir("logs", { recursive: true });
        logsEnsured = true;
    }
}

export async function planNextStep(params: {
    config: Config;
    task: string;
    history: Array<{
        step: AgentStep;
        observation: Observation;
    }>;
}): Promise<AgentStep> {
    const client = new OpenAI({ apiKey: params.config.apiKey, baseURL: params.config.baseURL });
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        {
            role: "system",
            content: instructions,
        },
        {
            role: "user",
            content: `User task:\n${params.task}\n\nHistory and observations:\n${JSON.stringify(params.history, null, 2)}`,
        },
    ];

    const createParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
        model: params.config.model,
        messages,
        tools: AGENT_TOOLS,
        tool_choice: "required",
    };

    const t0 = Date.now();
    const { data: response, response: rawResponse } = await client.chat.completions
        .create(createParams)
        .withResponse();
    const latencyMs = Date.now() - t0;

    const toolCalls = response.choices[0]?.message?.tool_calls;
    if (!toolCalls || toolCalls.length === 0) {
        throw new Error(`LLM returned no tool call: ${JSON.stringify(response)}`);
    }

    const toolCall = toolCalls[0]!;
    const toolName = toolCall.function.name as AgentStep["tool"];
    const toolArgs = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;

    // Build terminal transport log entry with abbreviated strings
    const entry: TransportLogEntry = {
        model: response.model,
        stopReason: response.choices[0]?.finish_reason ?? undefined,
        latencyMs,
        usage: {
            promptTokens: response.usage?.prompt_tokens,
            completionTokens: response.usage?.completion_tokens,
        },
        request: {
            messages: messages.map((m) => ({
                role: m.role,
                content: abbrev(typeof m.content === "string" ? m.content : JSON.stringify(m.content)),
            })),
            tools: AGENT_TOOLS.map((t) => t.function.name),
        },
        response: {
            toolCalled: toolName,
            arguments: Object.fromEntries(
                Object.entries(toolArgs).map(([k, v]) => [
                    k,
                    typeof v === "string" ? abbrev(v) : v,
                ])
            ),
        },
    };
    plannerLog.debug(entry);

    // Write raw NDJSON wire log entry (no truncation)
    const reqHeaders = filterHeaders(
        Object.fromEntries(rawResponse.headers.entries())
    );
    // Response headers come from the underlying fetch Response
    const respHeaders = filterHeaders(
        Object.fromEntries(rawResponse.headers.entries())
    );
    const wireEntry = {
        timestamp: new Date().toISOString(),
        type: "chat.completions",
        request: { headers: reqHeaders, body: createParams },
        response: { headers: respHeaders, body: response },
    };
    await ensureLogsDir();
    await appendFile("logs/agent-wire.log", JSON.stringify(wireEntry) + "\n");

    return { tool: toolName, input: toolArgs } as AgentStep;
}
