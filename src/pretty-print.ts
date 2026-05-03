import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

// ── Types ─────────────────────────────────────────────────────────────────────

type WireLogMessage = { role: string; content: unknown };

type WireLogRequestBody = {
    model?: string;
    messages?: WireLogMessage[];
    tools?: Array<{ type: string; function: { name: string } }>;
    [key: string]: unknown;
};

type WireLogResponseChoice = {
    finish_reason?: string;
    message?: {
        content?: string | null;
        tool_calls?: Array<{
            function: { name: string; arguments: string };
        }>;
    };
};

type WireLogResponseBody = {
    model?: string;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    choices?: WireLogResponseChoice[];
    [key: string]: unknown;
};

export type WireLogEntry = {
    timestamp: string;
    type: string;
    request: { headers: Record<string, string>; body: WireLogRequestBody };
    response: { headers: Record<string, string>; body: WireLogResponseBody };
};

// ── ANSI color helpers ────────────────────────────────────────────────────────

export const R = "\x1b[0m";
export const bold    = (s: string) => `\x1b[1m${s}${R}`;
export const dim     = (s: string) => `\x1b[2m${s}${R}`;
export const cyan    = (s: string) => `\x1b[36m${s}${R}`;
export const green   = (s: string) => `\x1b[32m${s}${R}`;
export const yellow  = (s: string) => `\x1b[33m${s}${R}`;
export const magenta = (s: string) => `\x1b[35m${s}${R}`;
export const gray    = (s: string) => `\x1b[90m${s}${R}`;

// ── Wire log parser ───────────────────────────────────────────────────────────

export type ParseResult = {
    entries: Array<{ line: number; entry: WireLogEntry }>;
    errors: Array<{ line: number; message: string }>;
};

export async function parseWireLog(filePath: string): Promise<ParseResult> {
    const text = await readFile(filePath, "utf-8");
    const lines = text.split("\n");
    const entries: ParseResult["entries"] = [];
    const errors: ParseResult["errors"] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!.trim();
        if (!line) continue;
        try {
            entries.push({ line: i + 1, entry: JSON.parse(line) as WireLogEntry });
        } catch (cause) {
            const detail = cause instanceof Error ? cause.message : String(cause);
            errors.push({ line: i + 1, message: `Line ${i + 1}: invalid JSON (${detail}) — ${line.slice(0, 80)}` });
        }
    }
    return { entries, errors };
}

// ── Renderers ─────────────────────────────────────────────────────────────────

const REQUEST_BLOCKLIST  = ["authorization", "content-type"];
const RESPONSE_BLOCKLIST = ["content-type"];

export function renderHeaders(headers: Record<string, string>, blocklist: string[]): string {
    const blockSet = new Set(blocklist.map((h) => h.toLowerCase()));
    const lines = Object.entries(headers).map(([k, v]) =>
        blockSet.has(k.toLowerCase())
            ? `  ${gray(k)}: ${yellow("[REDACTED]")}`
            : `  ${gray(k)}: ${dim(v)}`
    );
    return lines.length ? lines.join("\n") : `  ${dim("(none)")}`;
}

export function renderRequestSection(req: WireLogEntry["request"]): string {
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
    lines.push(renderHeaders(req.headers, REQUEST_BLOCKLIST));

    return lines.join("\n");
}

export function renderResponseSection(res: WireLogEntry["response"]): string {
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
            try {
                args = JSON.parse(toolCall.function.arguments);
            } catch (cause) {
                const detail = cause instanceof Error ? cause.message : String(cause);
                lines.push(yellow(`  [Warning: argument parse failed — ${detail}]`));
                args = toolCall.function.arguments;
            }
            lines.push(`${bold("Arguments:")}\n${dim(JSON.stringify(args, null, 2))}`);
        } else {
            lines.push(dim("(no tool call data)"));
        }
    } else {
        const content = choice?.message?.content ?? "";
        lines.push(`${bold("Content:")}\n${dim(content)}`);
    }

    lines.push(`\n${bold("Response Headers:")}`);
    lines.push(renderHeaders(res.headers, RESPONSE_BLOCKLIST));

    return lines.join("\n");
}

function renderEntry(
    entry: WireLogEntry,
    index: number,
    type: "request" | "response" | "both"
): string {
    const parts: string[] = [];
    const sep = bold(`\n${"═".repeat(56)}`);
    parts.push(`${sep}\n${bold(`Entry #${index}`)}  ${dim(entry.timestamp)}  ${gray(entry.type)}`);

    if (type === "request" || type === "both") {
        parts.push("\n" + renderRequestSection(entry.request));
    }
    if (type === "response" || type === "both") {
        parts.push("\n" + renderResponseSection(entry.response));
    }

    return parts.join("\n");
}

// ── CLI entry point ───────────────────────────────────────────────────────────

function parseArgs(): { filePath: string; index: number | null; type: "request" | "response" | "both" } | null {
    const args = process.argv.slice(2);

    if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
        process.stderr.write(
            "Usage: bun run src/pretty-print.ts <logfile> [--index <n>] [--type request|response]\n"
        );
        return null;
    }

    const filePath = args[0]!;
    let index: number | null = null;
    let type: "request" | "response" | "both" = "both";

    for (let i = 1; i < args.length; i++) {
        if (args[i] === "--index") {
            if (args[i + 1] === undefined) {
                process.stderr.write(`Error: --index requires a value\n`);
                process.exit(1);
            }
            index = parseInt(args[++i]!, 10);
            if (isNaN(index)) {
                process.stderr.write(`Error: --index must be a number\n`);
                process.exit(1);
            }
        } else if (args[i] === "--type") {
            if (args[i + 1] === undefined) {
                process.stderr.write(`Error: --type requires a value\n`);
                process.exit(1);
            }
            const val = args[++i]!;
            if (val !== "request" && val !== "response") {
                process.stderr.write(`Error: --type must be "request" or "response"\n`);
                process.exit(1);
            }
            type = val;
        } else {
            process.stderr.write(`Error: unrecognized flag: ${args[i]}\n`);
            process.exit(1);
        }
    }

    return { filePath, index, type };
}

async function main() {
    const opts = parseArgs();
    if (!opts) { process.exit(0); }

    const { filePath, index, type } = opts;

    if (!existsSync(filePath)) {
        process.stderr.write(`Error: file not found: ${filePath}\n`);
        process.exit(1);
    }

    const { entries, errors } = await parseWireLog(filePath);

    for (const err of errors) {
        process.stderr.write(`Warning: ${err.message}\n`);
    }

    let selected = entries;
    if (index !== null) {
        if (index >= entries.length) {
            process.stderr.write(`Error: --index ${index} out of range (${entries.length} entries)\n`);
            process.exit(1);
        }
        selected = [entries[index]!];
    }

    for (let i = 0; i < selected.length; i++) {
        const displayIdx = index !== null ? index : entries.indexOf(selected[i]!);
        process.stdout.write(renderEntry(selected[i]!.entry, displayIdx, type) + "\n");
    }

    if (errors.length > 0) process.exit(1);
}

if (import.meta.main) {
    main().catch((err) => {
        process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exit(1);
    });
}
