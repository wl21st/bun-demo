import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { writeFile, unlink, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import {
    renderHeaders as _renderHeaders,
    renderRequestSection as _renderRequestSection,
    renderResponseSection as _renderResponseSection,
    parseWireLog as _parseWireLog,
} from "../src/pretty-print";

// Strip ANSI escape codes for readable assertions
function stripAnsi(str: string): string {
    return str.replace(/\x1b\[[0-9;]*m/g, "");
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

    it("redacts mixed-case blocklisted header keys", () => {
        const output = stripAnsi(_renderHeaders(
            { Authorization: "Bearer secret", "Content-Type": "application/json" },
            ["authorization", "content-type"]
        ));
        expect(output).toContain("Authorization: [REDACTED]");
        expect(output).toContain("Content-Type: [REDACTED]");
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

    it("shows fallback when tool_calls finish reason has empty tool_calls array", () => {
        const resEmpty = {
            ...sampleWireEntry.response,
            body: {
                ...sampleWireEntry.response.body,
                choices: [{ finish_reason: "tool_calls", message: { tool_calls: [] } }],
            },
        };
        const output = stripAnsi(_renderResponseSection(resEmpty as never));
        expect(output).toContain("(no tool call data)");
    });
});

// ── Integration tests: parseWireLog ──────────────────────────────────────────

describe("parseWireLog", () => {
    it("returns valid entries from a valid log file", async () => {
        const { entries, errors } = await _parseWireLog(FIXTURE_LOG);
        expect(entries.length).toBe(2);
        expect(errors.length).toBe(0);
    });

    it("skips malformed lines and records errors with parse detail", async () => {
        const badLog = path.join(FIXTURE_DIR, "bad.log");
        await writeFile(badLog, JSON.stringify(sampleWireEntry) + "\n" + "NOT JSON\n" + JSON.stringify(sampleStopEntry) + "\n");
        const { entries, errors } = await _parseWireLog(badLog);
        expect(entries.length).toBe(2);
        expect(errors.length).toBe(1);
        expect(errors[0]!.message).toContain("Line 2");
        await unlink(badLog);
    });
});

// ── CLI smoke tests ───────────────────────────────────────────────────────────

describe("CLI smoke test", () => {
    it("prints model name and tool call name for all entries", () => {
        const result = Bun.spawnSync(["bun", "run", "src/pretty-print.ts", FIXTURE_LOG], {
            cwd: path.join(import.meta.dir, ".."),
        });
        const plain = stripAnsi(result.stdout.toString());
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

    it("exits non-zero for --type with invalid value", () => {
        const result = Bun.spawnSync(["bun", "run", "src/pretty-print.ts", FIXTURE_LOG, "--type", "invalid"], {
            cwd: path.join(import.meta.dir, ".."),
        });
        expect(result.exitCode).not.toBe(0);
        expect(result.stderr.toString()).toContain('--type must be');
    });

    it("exits non-zero for --index with no value", () => {
        const result = Bun.spawnSync(["bun", "run", "src/pretty-print.ts", FIXTURE_LOG, "--index"], {
            cwd: path.join(import.meta.dir, ".."),
        });
        expect(result.exitCode).not.toBe(0);
        expect(result.stderr.toString()).toContain("--index requires a value");
    });

    it("exits non-zero for unrecognized flag", () => {
        const result = Bun.spawnSync(["bun", "run", "src/pretty-print.ts", FIXTURE_LOG, "--unknown"], {
            cwd: path.join(import.meta.dir, ".."),
        });
        expect(result.exitCode).not.toBe(0);
        expect(result.stderr.toString()).toContain("unrecognized flag");
    });

    it("exits non-zero when log file has parse errors but still renders valid entries", async () => {
        const mixedLog = path.join(FIXTURE_DIR, "mixed.log");
        await writeFile(mixedLog, JSON.stringify(sampleWireEntry) + "\nBAD LINE\n");
        const result = Bun.spawnSync(["bun", "run", "src/pretty-print.ts", mixedLog], {
            cwd: path.join(import.meta.dir, ".."),
        });
        expect(result.exitCode).not.toBe(0);
        expect(stripAnsi(result.stdout.toString())).toContain("gpt-4o");
        await unlink(mixedLog);
    });
});
