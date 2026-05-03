# bun-ai-agent

A ReAct-style AI agent built with [Bun](https://bun.com) that iteratively reasons and acts to complete coding tasks using an OpenAI-compatible LLM API.

## Setup

```bash
bun install
cp .env.example .env
# Edit .env and set OPENAI_API_KEY
```

## Environment Variables

| Variable          | Required | Default                                   | Description                          |
|-------------------|----------|-------------------------------------------|--------------------------------------|
| `OPENAI_API_KEY`  | yes      | —                                         | API key for the LLM provider         |
| `OPENAI_BASE_URL` | no       | `https://integrate.api.nvidia.com/v1`     | Base URL for an OpenAI-compatible API|
| `OPENAI_MODEL`    | no       | `google/gemma-4-31b-it`                   | Model ID to use                      |
| `MAX_STEPS`       | no       | `12`                                      | Maximum agent loop iterations        |

## Usage

```bash
# Run the agent with a task
bun run agent "your task here"

# Example
bun run agent "generate complete tests for src/math.ts and ensure bun test passes"

# Run all tests
bun test

# Run a single test file
bun test test/config.test.ts

# Watch mode
bun test --watch
```

## Inspecting LLM Traffic

Every LLM call is logged to `logs/agent-wire.log` as NDJSON. Use the pretty-print tool to inspect it:

```bash
# Print all entries
bun run src/pretty-print.ts logs/agent-wire.log

# Print only the first entry
bun run src/pretty-print.ts logs/agent-wire.log --index 0

# Show only the request half
bun run src/pretty-print.ts logs/agent-wire.log --type request

# Show only the response half
bun run src/pretty-print.ts logs/agent-wire.log --type response
```

Each entry shows the model, messages with role labels, tool definitions, finish reason, token usage, tool call arguments, and headers (with `authorization` redacted).

## Project Structure

```
bun-ai-agent/
├── src/
│   ├── agent.ts        # Entry point — reads task from CLI args, drives the agent loop
│   ├── planner.ts      # Calls the LLM via native tool calling; writes transport logs
│   ├── executor.ts     # Dispatches an AgentStep to the matching tool function
│   ├── tools.ts        # Implements the six tools: listFiles, readFile, writeFile, shell, test, finish
│   ├── config.ts       # Loads and validates config from environment variables
│   ├── logger.ts       # Shared consola logger with log4j-style formatting and ANSI colors
│   ├── types.ts        # Shared TypeScript types: Config, AgentStep, Observation, TransportLogEntry
│   └── pretty-print.ts # CLI tool — pretty-prints NDJSON wire log entries in color
├── src/math.ts         # Sample math utilities (add, divide) used for agent task examples
├── logs/
│   └── agent-wire.log  # NDJSON wire log — one line per LLM call (gitignored)
├── test/
│   ├── config.test.ts      # Unit + integration tests for config loading
│   ├── math.test.ts        # Tests for math utilities
│   ├── agent.test.ts       # Tests for agent loop behavior
│   └── pretty-print.test.ts # Unit, integration, and CLI smoke tests for pretty-print
├── index.ts          # Minimal Bun entry point
├── package.json
├── tsconfig.json
├── .env.example
└── CLAUDE.md         # AI assistant guidance for this repo
```

## Architecture

The agent follows a **ReAct loop** (Reason + Act) — it calls the LLM to decide which tool to use next, executes that tool, appends the result to history, and repeats until the task is finished or `MAX_STEPS` is reached.

```
agent.ts  →  planner.ts  →  LLM (OpenAI-compatible API)
    ↑              ↓
    └──  executor.ts  →  tools.ts
```

### File Descriptions

| File | Description |
|------|-------------|
| `src/agent.ts` | Entry point. Reads the task from CLI args, initializes the history array, and runs the `for` loop up to `MAX_STEPS`. Logs each step and observation. Exits early when the `finish` tool is called. |
| `src/planner.ts` | Constructs the system prompt and sends the current task + full history to the LLM using native OpenAI tool calling (`tool_choice: "required"`). Emits a structured DEBUG terminal log and appends a full NDJSON wire log entry to `logs/agent-wire.log` after each call. |
| `src/executor.ts` | A thin dispatch layer. Receives an `AgentStep` and calls the corresponding function in `tools.ts`, returning an `Observation`. |
| `src/tools.ts` | Implements all agent tools using Bun APIs (`Bun.file`, `Bun.write`, `bun.$`): `listFiles` (recursive directory walk), `readFile`, `writeFile`, `shell` (arbitrary shell command), `runTests` (`bun test`). |
| `src/config.ts` | Exports `loadConfig(env?)` which reads env vars and exits if `OPENAI_API_KEY` is missing. Also exports a singleton `config` used by the agent. The injectable `env` parameter makes it unit-testable. |
| `src/logger.ts` | Creates a shared `consola` instance with a custom log4j-style reporter: `YYYY-MM-DDTHH:mm:ss.sssZ LEVEL tag - message`. Exports `createLogger(tag)`, `abbrev(str)` for string truncation, and `filterHeaders(headers)` for stripping sensitive headers before logging. |
| `src/types.ts` | Shared types: `Config`, `Observation` (`{ ok, output }`), `AgentStep` — a discriminated union of all six tool call shapes — and `TransportLogEntry` for the terminal transport log shape. |
| `src/pretty-print.ts` | CLI tool for inspecting `logs/agent-wire.log`. Parses NDJSON and renders each entry with color-coded request (model, messages, tools) and response (finish reason, usage, tool call arguments) sections. Supports `--index <n>` and `--type request\|response` filters. |
| `src/math.ts` | Sample math utilities (`add`, `divide`) used as a target for agent task examples. |
| `test/config.test.ts` | Tests for `loadConfig`. Pure unit tests pass fake env objects directly; one live integration test makes a real API call (30 s timeout, requires `.env`). |
| `test/pretty-print.test.ts` | Unit tests for `renderHeaders`, `renderRequestSection`, `renderResponseSection`; integration tests for `parseWireLog`; CLI smoke tests via `Bun.spawnSync`. |

## Tools Available to the Agent

| Tool        | Input                        | Description                          |
|-------------|------------------------------|--------------------------------------|
| `listFiles` | `{ dir: string }`            | Recursively lists files in a directory (skips `node_modules`, `.git`) |
| `readFile`  | `{ path: string }`           | Reads a file and returns its contents |
| `writeFile` | `{ path, content: string }`  | Writes content to a file             |
| `shell`     | `{ command: string }`        | Executes an arbitrary shell command  |
| `test`      | `{}`                         | Runs `bun test`                      |
| `finish`    | `{ message: string }`        | Signals task completion and exits the loop |
