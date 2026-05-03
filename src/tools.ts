import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import type { Observation } from "./types";

export async function listFiles(dir: string): Promise<Observation> {
    try {
        const files = await walk(dir);
        return {
            ok: true,
            output: files.join("\n"),
        };
    } catch (error) {
        return {
            ok: false,
            output: String(error),
        };
    }
}

async function walk(dir: string): Promise<string[]> {
    const entries = await readdir(dir, {
        withFileTypes: true,
    });

    const results: string[] = [];

    for (const entry of entries) {
        if (
            entry.name === "node_modules" ||
            entry.name === ".git" ||
            entry.name === "bun.lockb"
        ) {
            continue;
        }

        const fullPath = join(dir, entry.name);

        if (entry.isDirectory()) {
            results.push(...(await walk(fullPath)));
        } else {
            results.push(fullPath);
        }
    }

    return results;
}

export async function readFile(path: string): Promise<Observation> {
    try {
        const text = await Bun.file(path).text();

        return {
            ok: true,
            output: text,
        };
    } catch (error) {
        return {
            ok: false,
            output: String(error),
        };
    }
}

export async function writeFile(
    path: string,
    content: string,
): Promise<Observation> {
    try {
        await Bun.write(path, content);

        return {
            ok: true,
            output: `Wrote file: ${path}`,
        };
    } catch (error) {
        return {
            ok: false,
            output: String(error),
        };
    }
}

export async function shell(command: string): Promise<Observation> {
    try {
        const result = await $`${{ raw: command }}`.quiet();

        return {
            ok: true,
            output: [
                result.stdout.toString(),
                result.stderr.toString(),
            ]
                .filter(Boolean)
                .join("\n"),
        };
    } catch (error: any) {
        return {
            ok: false,
            output: [
                error.stdout?.toString(),
                error.stderr?.toString(),
                error.message,
            ]
                .filter(Boolean)
                .join("\n"),
        };
    }
}

export async function runTests(): Promise<Observation> {
    return shell("bun test");
}