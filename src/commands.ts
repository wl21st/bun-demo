export type ParsedFlags = {
    verbose?: boolean;
    model?: string;
};

export type ParsedTask = {
    task: string;
    flags: ParsedFlags;
};

export function parseTaskArg(input: string): ParsedTask {
    const flags: ParsedFlags = {};
    let rest = input.trim();

    // Consume leading /flag and /key value tokens
    while (rest.startsWith("/")) {
        const verboseMatch = rest.match(/^\/verbose\s*/i);
        if (verboseMatch) {
            flags.verbose = true;
            rest = rest.slice(verboseMatch[0].length).trim();
            continue;
        }
        const modelMatch = rest.match(/^\/model\s+(\S+)\s*/i);
        if (modelMatch) {
            flags.model = modelMatch[1];
            rest = rest.slice(modelMatch[0].length).trim();
            continue;
        }
        // Unknown leading slash token — stop consuming modifiers
        break;
    }

    return { task: rest, flags };
}

export type Command =
    | { kind: "help" }
    | { kind: "abort" }
    | { kind: "pause" }
    | { kind: "resume" }
    | { kind: "verbose" }
    | { kind: "clear" }
    | { kind: "model"; name: string }
    | { kind: "add"; task: string }
    | { kind: "skip" }
    | { kind: "unknown"; input: string };

export function parseCommand(input: string): Command {
    const trimmed = input.trim();

    if (trimmed === "/help") return { kind: "help" };
    if (trimmed === "/abort") return { kind: "abort" };
    if (trimmed === "/pause") return { kind: "pause" };
    if (trimmed === "/resume") return { kind: "resume" };
    if (trimmed === "/verbose") return { kind: "verbose" };
    if (trimmed === "/clear") return { kind: "clear" };
    if (trimmed === "/skip") return { kind: "skip" };

    const modelMatch = trimmed.match(/^\/model\s+(\S+)$/);
    if (modelMatch) return { kind: "model", name: modelMatch[1]! };

    const addMatch = trimmed.match(/^\/add\s+(.+)$/s);
    if (addMatch) return { kind: "add", task: addMatch[1]!.trim() };

    return { kind: "unknown", input: trimmed };
}
