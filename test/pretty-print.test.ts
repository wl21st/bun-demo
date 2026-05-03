import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { writeFile, unlink, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

// Strip ANSI escape codes for readable assertions
function stripAnsi(str: string): string {
    return str.replace(/\x1b\[[0-9;]*m/g, "");
}

// ── Re-export internals for unit testing ─────────────────────────────────────
// We use dynamic import so the module is only loaded after we reference the
// compiled output. Since pretty-print.ts uses top-level await only in main(),
// importing it is safe.
let renderHeaders: (headers: Record<string, string>, blocklist: string[]) => string;
let renderRequestSection: (req: { headers: Record<string, string>; body: Record<string, unknown> }) => string;
let renderResponseSection: (res: { headers: Record<string, string>; body: Record<string, unknown> }) => string;
let parseWireLog: (filePath: string) => Promise<{ entries: Array<{ line: number; entry: unknown }>; errors: Array<{ line: number; message: string }> }>;

// We test by running the file as a subprocess for CLI tests,
// and import the module for unit tests (internals exposed via named exports).
// Since pretty-print.ts is a standalone script, we duplicate the testable logic
// here to avoid side effects from the main() call on import.

// ── Inline implementations for unit tests ────────────────────────────────────
// These mirror the implementations in src/pretty-print.ts exactly.

const R = "\x1b[0m";
const bold    = (s: string) => `\x1b[1m${s}${R}`;
const dim     = (s: string) => `\x1b[2m${s}${R}`;
const cyan    = (s: string) => `\x1b[36m${s}${R}`;
const green   = (s: string) => `\x1b[32m${s}${R}`;
const yellow  = (s: string) => `\x1b[33m${s}${R}`;
const magenta = (s: string) => `\x1b[35m${s}${R}`;
const gray    = (s: string) => `\x1b[90m${s}${R}`;

const REQUEST_BLOCKLIST  = ["authorization", "content-type"];
const RESPONSE_BLOCKLIST = ["content-type"];

function _renderHeaders(headers: Record<string, string>, blocklist: string[]): string {
    const blockSet = new Set(blocklist.map((h) => h.toLowerCase()));
    const lines = Object.entries(headers).map(([k, v]) =>
        blockSet.has(k.toLowerCase())
            ? `  ${gray(k)}: ${yellow("[REDACTED]")}`
            : `  ${gray(k)}: ${dim(v)}`
    );
    return lines.length ? lines.join("\n") : `  ${dim("(none)")}`;
}

type WireLogMessage = { role: string; content: unknown };
type WireLogRequestBody = {
    model?: string;
    messages?: WireLogMessage[];
    tools?: Array<{ type: string; function: { name: string } }>;
    [key: string]: unknown;
};
type WireLogResponseChoice = {
    finish_reason?: string;
    message?: { content?: string | null; tool_calls?: Array<{ function: { name: string; arguments: string } }> };
};
type WireLogResponseBody = {
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    choices?: WireLogResponseChoice[];
    [key: string]: unknown;
};

function _renderRequestSection(req: { headers: Record<string, string>; body: WireLogRequestBody }): string {
    const body = req.body;
    const lines: string[] = [];
    lines.push(bold(cyan("── REQUEST ──────────────────────────────────────────")));
    lines.push(`${bold("Model:")} ${green(body.model ?? "(unknown)")}`);
    lines.push(`\n${bold("Messages:")}`);
    const messages = body.messages ?? [];
    if (messages.length === 0) {
        lines.push(`  ${dim("(none)")}`);
    } else {
        for (const msg of messages) {
            const roleColor = msg.role === "system" ? magenta : msg.role === "user" ? cyan : yellow;
            const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
            lines.push(`  ${bold(roleColor(msg.role))}: ${dim(content)}`);
        }
    }
    const toolNames = (body.tools ?? []).map((t) => t.function?.name ?? "(unnamed)");
    lines.push(`\n${bold("Tools:")} ${toolNames.length ? toolNames.map(green).join(", ") : dim("(none)")}`);
    lines.push(`\n${bold("Request Headers:")}`);
    lines.push(_renderHeaders(req.headers, REQUEST_BLOCKLIST));
    return lines.join("\n");
}

function _renderResponseSection(res: { headers: Record<string, string>; body: WireLogResponseBody }): string {
    const body = res.body;
    const lines: string[] = [];
    lines.push(bold(cyan("── RESPONSE ─────────────────────────────────────────")));
    const choice = body.choices?.[0];
    const finishReason = choice?.finish_reason ?? "(unknown)";
    lines.push(`${bold("Finish Reason:")} ${yellow(finishReason)}`);
    if (body.usage) {
        lines.push(`${bold("Usage:")} prompt=${green(String(body.usage.prompt_tokens ?? "?"))}  completion=${green(String(body.usage.completion_tokens ?? "?"))}`);
    } else {
        lines.push(`${bold("Usage:")} ${dim("(unavailable)")}`);
    }
    lines.push("");
    if (finishReason === "tool_calls") {
        const toolCall = choice?.message?.tool_calls?.[0];
        if (toolCall) {
            lines.push(`${bold("Tool Call:")} ${magenta(toolCall.function.name)}`);
            let args: unknown;
            try { args = JSON.parse(toolCall.function.arguments); } catch { args = toolCall.function.arguments; }
            lines.push(`${bold("Arguments:")}\n${dim(JSON.stringify(args, null, 2))}`);
        }
    } else {
        const content = choice?.message?.content ?? "";
        lines.push(`${bold("Content:")}\n${dim(content)}`);
    }
    lines.push(`\n${bold("Response Headers:")}`);
    lines.push(_renderHeaders(res.headers, RESPONSE_BLOCKLIST));
    return lines.join("\n");
}

async function _parseWireLog(filePath: string) {
    const { readFile } = await import("node:fs/promises");
    const text = await readFile(filePath, "utf-8");
    const lines = text.split("\n");
    const entries: Array<{ line: number; entry: unknown }> = [];
    const errors: Array<{ line: number; message: string }> = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!.trim();
        if (!line) continue;
        try {
            entries.push({ line: i + 1, entry: JSON.parse(line) });
        } catch {
            errors.push({ line: i + 1, message: `Line ${i + 1}: invalid JSON — ${line.slice(0, 80)}` });
        }
    }
    return { entries, errors };
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const FIXTURE_DIR = path.join(import.meta.dir, "__fixtures__");
const FIXTURE_LOG = path.join(FIXTURE_DIR, "wire.log");

const sampleWireEntry = {
    timestamp: "2026-05-02T22:00:00.000Z",
    type: "chat.completions",
    request: {
        headers: {
            "authorization": "Bearer sk-test-xxx",
            "content-type": "application/json",
            "x-custom": "hello",
        },
        body: {
            model: "gpt-4o",
            messages: [
                { role: "system", content: "You are an agent." },
                { role: "user", content: "Do something." },
            ],
            tools: [
                { type: "function", function: { name: "listFiles", description: "List files", parameters: {} } },
                { type: "function", function: { name: "readFile", description: "Read", parameters: {} } },
            ],
            tool_choice: "required",
        },
    },
    response: {
        headers: {
            "content-type": "application/json",
            "x-request-id": "req-abc123",
            "x-ratelimit-remaining-requests": "999",
        },
        body: {
            id: "chatcmpl-abc",
            model: "gpt-4o",
            usage: { prompt_tokens: 120, completion_tokens: 45 },
            choices: [
                {
                    finish_reason: "tool_calls",
                    message: {
                        tool_calls: [
                            { function: { name: "listFiles", arguments: JSON.stringify({ dir: "src" }) } },
                        ],
                    },
                },
            ],
        },
    },
};

const sampleStopEntry = {
    ...sampleWireEntry,
    response: {
        ...sampleWireEntry.response,
        body: {
            ...sampleWireEntry.response.body,
            choices: [
                {
                    finish_reason: "stop",
                    message: { content: "Task complete." },
                },
            ],
        },
    },
};

beforeAll(async () => {
    await mkdir(FIXTURE_DIR, { recursive: true });
    await writeFile(FIXTURE_LOG, JSON.stringify(sampleWireEntry) + "\n" + JSON.stringify(sampleStopEntry) + "\n");
});

afterAll(async () => {
    await rm(FIXTURE_DIR, { recursive: true, force: true });
});

// ── Unit tests: renderHeaders ─────────────────────────────────────────────────

describe("renderHeaders", () => {
    it("redacts blocklisted headers", () => {
        const output = stripAnsi(_renderHeaders(
            { authorization: "Bearer secret", "x-api-key": "val" },
            ["authorization"]
        ));
        expect(output).toContain("authorization: [REDACTED]");
        expect(output).toContain("x-api-key: val");
    });

    it("passes through non-sensitive headers", () => {
        const output = stripAnsi(_renderHeaders(
            { "x-request-id": "req-123", "x-ratelimit-remaining-requests": "99" },
            ["authorization", "content-type"]
        ));
        expect(output).toContain("x-request-id: req-123");
        expect(output).toContain("x-ratelimit-remaining-requests: 99");
    });

    it("shows (none) for empty headers", () => {
        const output = stripAnsi(_renderHeaders({}, []));
        expect(output).toContain("(none)");
    });
});

// ── Unit tests: renderRequestSection ─────────────────────────────────────────

describe("renderRequestSection", () => {
    it("includes model name", () => {
        const output = stripAnsi(_renderRequestSection(sampleWireEntry.request as never));
        expect(output).toContain("gpt-4o");
    });

    it("renders messages with role labels", () => {
        const output = stripAnsi(_renderRequestSection(sampleWireEntry.request as never));
        expect(output).toContain("system:");
        expect(output).toContain("You are an agent.");
        expect(output).toContain("user:");
        expect(output).toContain("Do something.");
    });

    it("shows tool names without full schema", () => {
        const output = stripAnsi(_renderRequestSection(sampleWireEntry.request as never));
        expect(output).toContain("listFiles");
        expect(output).toContain("readFile");
        expect(output).not.toContain('"parameters"');
    });

    it("shows (none) when tools are absent", () => {
        const reqNoTools = { ...sampleWireEntry.request, body: { ...sampleWireEntry.request.body, tools: [] } };
        const output = stripAnsi(_renderRequestSection(reqNoTools as never));
        expect(output).toContain("(none)");
    });
});

// ── Unit tests: renderResponseSection ────────────────────────────────────────

describe("renderResponseSection", () => {
    it("shows tool call name and arguments for tool_calls finish reason", () => {
        const output = stripAnsi(_renderResponseSection(sampleWireEntry.response as never));
        expect(output).toContain("tool_calls");
        expect(output).toContain("listFiles");
        expect(output).toContain('"dir"');
        expect(output).toContain('"src"');
    });

    it("shows content for stop finish reason", () => {
        const output = stripAnsi(_renderResponseSection(sampleStopEntry.response as never));
        expect(output).toContain("stop");
        expect(output).toContain("Task complete.");
    });

    it("shows token usage when present", () => {
        const output = stripAnsi(_renderResponseSection(sampleWireEntry.response as never));
        expect(output).toContain("prompt=120");
        expect(output).toContain("completion=45");
    });

    it("shows (unavailable) when usage is absent", () => {
        const resNoUsage = {
            ...sampleWireEntry.response,
            body: { ...sampleWireEntry.response.body, usage: undefined },
        };
        const output = stripAnsi(_renderResponseSection(resNoUsage as never));
        expect(output).toContain("(unavailable)");
    });
});

// ── Integration tests: parseWireLog ──────────────────────────────────────────

describe("parseWireLog", () => {
    it("returns valid entries from a valid log file", async () => {
        const { entries, errors } = await _parseWireLog(FIXTURE_LOG);
        expect(entries.length).toBe(2);
        expect(errors.length).toBe(0);
    });

    it("skips malformed lines and records errors", async () => {
        const badLog = path.join(FIXTURE_DIR, "bad.log");
        await writeFile(badLog, JSON.stringify(sampleWireEntry) + "\n" + "NOT JSON\n" + JSON.stringify(sampleStopEntry) + "\n");
        const { entries, errors } = await _parseWireLog(badLog);
        expect(entries.length).toBe(2);
        expect(errors.length).toBe(1);
        expect(errors[0]!.message).toContain("Line 2");
        await unlink(badLog);
    });
});

// ── CLI smoke test ────────────────────────────────────────────────────────────

describe("CLI smoke test", () => {
    it("prints model name and tool call name for all entries", () => {
        const result = Bun.spawnSync(["bun", "run", "src/pretty-print.ts", FIXTURE_LOG], {
            cwd: path.join(import.meta.dir, ".."),
        });
        const stdout = result.stdout.toString();
        const plain = stripAnsi(stdout);
        expect(plain).toContain("gpt-4o");
        expect(plain).toContain("listFiles");
    });

    it("--index 0 renders only the first entry", () => {
        const result = Bun.spawnSync(["bun", "run", "src/pretty-print.ts", FIXTURE_LOG, "--index", "0"], {
            cwd: path.join(import.meta.dir, ".."),
        });
        const plain = stripAnsi(result.stdout.toString());
        expect(plain).toContain("Entry #0");
        expect(plain).not.toContain("Entry #1");
    });

    it("--type request shows only request section", () => {
        const result = Bun.spawnSync(["bun", "run", "src/pretty-print.ts", FIXTURE_LOG, "--type", "request"], {
            cwd: path.join(import.meta.dir, ".."),
        });
        const plain = stripAnsi(result.stdout.toString());
        expect(plain).toContain("REQUEST");
        expect(plain).not.toContain("RESPONSE");
    });

    it("--type response shows only response section", () => {
        const result = Bun.spawnSync(["bun", "run", "src/pretty-print.ts", FIXTURE_LOG, "--type", "response"], {
            cwd: path.join(import.meta.dir, ".."),
        });
        const plain = stripAnsi(result.stdout.toString());
        expect(plain).not.toContain("REQUEST");
        expect(plain).toContain("RESPONSE");
    });

    it("exits non-zero for missing file", () => {
        const result = Bun.spawnSync(["bun", "run", "src/pretty-print.ts", "nonexistent.log"], {
            cwd: path.join(import.meta.dir, ".."),
        });
        expect(result.exitCode).not.toBe(0);
        expect(result.stderr.toString()).toContain("file not found");
    });

    it("exits non-zero for out-of-range --index", () => {
        const result = Bun.spawnSync(["bun", "run", "src/pretty-print.ts", FIXTURE_LOG, "--index", "99"], {
            cwd: path.join(import.meta.dir, ".."),
        });
        expect(result.exitCode).not.toBe(0);
        expect(result.stderr.toString()).toContain("out of range");
    });
});
