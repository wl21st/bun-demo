import { createConsola } from "consola";

const LEVEL_COLORS: Record<string, string> = {
    FATAL: "\x1b[31m",  // red
    ERROR: "\x1b[31m",  // red
    WARN:  "\x1b[33m",  // yellow
    INFO:  "\x1b[36m",  // cyan
    LOG:   "\x1b[37m",  // white
    DEBUG: "\x1b[90m",  // dark gray
    TRACE: "\x1b[90m",  // dark gray
};
const RESET = "\x1b[0m";
const DIM   = "\x1b[2m";

const consola = createConsola({
    level: 4, // enable debug (0=fatal..4=debug..5=trace)
    reporters: [
        {
            log(logObj) {
                const ts = (logObj.date ?? new Date()).toISOString();
                const level = logObj.type.toUpperCase();
                const color = LEVEL_COLORS[level] ?? "";
                const tag = logObj.tag || "app";
                const msg = logObj.args
                    .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
                    .join(" ");
                process.stdout.write(`${DIM}${ts}${RESET} ${color}${level.padEnd(5)}${RESET} ${tag} - ${msg}\n`);
            },
        },
    ],
});

export function createLogger(tag: string) {
    return consola.withTag(tag);
}

export function abbrev(str: string, limit = 1024): string {
    if (str.length <= limit) return str;
    return `${str.slice(0, 512)}...[${str.length} chars]...${str.slice(-512)}`;
}

export function filterHeaders(headers: Record<string, string>): Record<string, string> {
    const blocklist = new Set(["authorization", "content-type"]);
    return Object.fromEntries(
        Object.entries(headers).filter(([k]) => !blocklist.has(k.toLowerCase()))
    );
}
