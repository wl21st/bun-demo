import { createConsola } from "consola";

const consola = createConsola({
    level: 4, // enable debug (0=fatal..4=debug..5=trace)
    reporters: [
        {
            log(logObj) {
                const ts = (logObj.date ?? new Date()).toISOString();
                const level = logObj.type.toUpperCase();
                const tag = logObj.tag || "app";
                const msg = logObj.args
                    .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
                    .join(" ");
                process.stdout.write(`${ts} ${level} ${tag} - ${msg}\n`);
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
