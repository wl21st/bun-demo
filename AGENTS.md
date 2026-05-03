# AGENTS.md

Guidance for AI coding agents working in this repository.

## Project Overview

`bun-ai-agent` is a ReAct-style AI agent loop built with [Bun](https://bun.com). The agent
iteratively calls an LLM to decide which tool to use next, executes it, and repeats until the
task is done or `MAX_STEPS` is reached. It targets an OpenAI-compatible API.

---

## Commands

```sh
bun install                            # install dependencies
bun test                               # run all tests
bun test test/config.test.ts           # run a single test file
bun test --watch                       # watch mode
bun run agent "your task here"         # run the agent with a task
```

There is **no separate build step** — Bun runs TypeScript directly. There is **no linter or
formatter** configured. Type-checking only:

```sh
bunx tsc --noEmit                      # type-check without emitting
```

---

## Repository Layout

```
src/
  agent.ts      # CLI entry point; drives the agent loop
  planner.ts    # calls the LLM; returns next AgentStep as JSON
  executor.ts   # dispatches AgentStep to the matching tool
  tools.ts      # implements listFiles, readFile, writeFile, shell, test, finish
  config.ts     # loads + validates env vars; exports singleton `config`
  types.ts      # shared types: Config, AgentStep (discriminated union), Observation
demo/
  math.ts       # canonical target file for agent tasks
test/
  config.test.ts  # unit + integration tests for config loading
index.ts        # placeholder entry point (not part of the agent system)
.env.example    # template for required environment variables
```

---

## Environment Variables

Copy `.env.example` to `.env` before running the agent.

| Variable          | Required | Default                               | Description                           |
|-------------------|----------|---------------------------------------|---------------------------------------|
| `OPENAI_API_KEY`  | **yes**  | —                                     | API key for the LLM provider          |
| `OPENAI_BASE_URL` | no       | `https://integrate.api.nvidia.com/v1` | Base URL for an OpenAI-compatible API |
| `OPENAI_MODEL`    | no       | `gpt-4o`                              | Model ID                              |
| `MAX_STEPS`       | no       | `12`                                  | Maximum agent loop iterations         |

---

## Code Style

### Language & Module System

- **TypeScript** everywhere; Bun transpiles directly — no compilation step needed.
- `"type": "module"` in `package.json` — all files use ESM (`import`/`export`).
- Target/lib: `ESNext`. Module resolution: `bundler` (Bun bundler mode).

### Formatting

- **4-space indentation** (no tabs).
- **Double quotes** for all string literals, including imports.
- **Semicolons** at end of every statement.
- **Trailing commas** in multi-line objects, arrays, and parameter lists.
- Max meaningful line length: ~100 characters (no hard enforced limit).

### Imports

Order imports as follows — no blank line between groups unless it aids clarity:

1. Node built-ins — always use the `node:` protocol prefix:
   ```ts
   import { readdir } from "node:fs/promises";
   import { join } from "node:path";
   ```
2. Third-party packages:
   ```ts
   import OpenAI from "openai";
   import { consola } from "consola";
   import { $ } from "bun";
   ```
3. Local modules — relative paths, **no `.ts` extension**:
   ```ts
   import { executeStep } from "./executor";
   import { config } from "./config";
   ```

**`verbatimModuleSyntax` is enabled** — you **must** use `import type` for any import used only
as a type:
```ts
import type { AgentStep, Observation } from "./types";  // correct
import { AgentStep } from "./types";                     // error if AgentStep is type-only
```

No barrel/index files — import each module directly.

### TypeScript

- `strict: true` is enabled — no implicit `any`, no implicit `undefined`.
- `noUncheckedIndexedAccess: true` — array/object index access returns `T | undefined`; guard
  before use.
- **Explicit return types** on all exported functions:
  ```ts
  export async function listFiles(dir: string): Promise<Observation> { ... }
  ```
- Return types on private/internal helpers may be inferred when obvious.
- Use **string literal unions** instead of enums:
  ```ts
  type Tool = "listFiles" | "readFile" | "writeFile" | "shell" | "test" | "finish";
  ```
- Use **discriminated unions** (tagged with a `tool` or similar field) for variant types — see
  `AgentStep` in `src/types.ts`.
- Use `as const` on returned plain objects where the shape should be narrowed:
  ```ts
  return { apiKey, model, maxSteps } as const;
  ```
- Avoid classes — prefer plain functions and module-level named exports.
- Use `error: any` in `catch` only when you need to access non-standard properties on the error
  (e.g., Bun's shell error with `.stdout`/`.stderr`). Otherwise leave `error` untyped (implicit
  `unknown`) and convert with `String(error)`.

### Naming Conventions

| Thing | Convention | Example |
|---|---|---|
| Files | `camelCase` | `agent.ts`, `planner.ts` |
| Functions | `camelCase` | `planNextStep`, `loadConfig` |
| Types / interfaces | `PascalCase` | `Config`, `AgentStep`, `Observation` |
| Variables / constants | `camelCase` | `apiKey`, `baseURL`, `maxSteps` |
| Exported singleton | `camelCase` | `config` (from `config.ts`) |
| Private helpers | `camelCase`, unexported | `walk`, `stripCodeFence` |

### Async / Await

- Use `async/await` exclusively — no `.then()/.catch()` chains.
- Top-level `await` is supported (Bun ESM).
- Sequential async steps inside loops are fine when order matters (see `agent.ts`).

### Error Handling

- **Tool functions** (`src/tools.ts`) **must never throw**. Wrap all I/O in `try/catch` and
  return an `Observation`:
  ```ts
  return { ok: false, output: String(error) };   // on failure
  return { ok: true,  output: result };           // on success
  ```
- **Planner / non-tool code** may throw `new Error(...)` for unrecoverable programmer errors.
- **Config** calls `process.exit(1)` when a required env var is missing — do not throw.
- Use optional chaining and nullish coalescing for defensive access:
  ```ts
  response.choices[0]?.message?.content?.trim() ?? ""
  ```

### Logging

Use **`consola`** for all output — never `console.log` / `console.error` directly:
```ts
import { consola } from "consola";
consola.info("Step", i + 1);
consola.error("OPENAI_API_KEY is required");
```

### Bun APIs

Prefer Bun-native APIs over Node equivalents where available:

| Task | Use |
|---|---|
| Read a file | `Bun.file(path).text()` |
| Write a file | `Bun.write(path, content)` |
| Run a shell command | `` bun.$ `${​{ raw: command }}`.quiet() `` |
| Run tests (programmatic) | `shell("bun test")` via the `shell` tool |

---

## Testing

- **Test runner**: Bun built-in (`bun test`) — no Jest or Vitest.
- **Test files**: located in `test/`, named `<module>.test.ts`.
- **Imports** in test files: `import { describe, it, expect } from "bun:test"`.
- **Structure**: one `describe` block per module; individual cases in `it` blocks.
- Write **pure unit tests** by injecting fake env/config objects directly — no mocking framework.
- The last test in `test/config.test.ts` is a live integration test requiring `.env` credentials
  and carries a 30-second timeout: `}, 30_000)`. Mark any similar tests the same way.
- Import source files with relative paths from `test/` to `src/`:
  ```ts
  import { loadConfig } from "../src/config";
  ```

---

## Agent Conventions

- The agent is instructed to operate **primarily within the `demo/` directory**.
- `demo/math.ts` is the canonical target file for testing agent tasks.
- The agent loop is capped at `MAX_STEPS` (default 12) iterations.
- Each tool returns `Observation = { ok: boolean; output: string }`.
- Truncate observation output to 2000 characters before logging/displaying.
- The `finish` tool signals task completion and must include a human-readable `message`.
