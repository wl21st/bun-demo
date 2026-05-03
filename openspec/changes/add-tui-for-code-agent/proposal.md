## Why

The code agent currently outputs its reasoning and tool calls as plain log lines, making it hard to follow multi-step execution in real time. A TUI gives the user a structured, live view of agent progress — task input, current step, tool calls, and final output — without scrolling through raw logs.

## What Changes

- New `tui.tsx` entry point that wraps the existing agent loop in an interactive terminal UI
- A React/Ink component tree rendering agent state panels (task, step progress, tool calls, output)
- The agent loop is extracted into a reusable `runAgent()` function so both `agent.ts` (plain) and `tui.tsx` (TUI) can drive it
- Live streaming updates: each step transition re-renders the relevant panel
- A persistent command input bar with blinking cursor accepting slash commands mid-run
- A task queue: multiple follow-up tasks can be enqueued via `/add` and run sequentially after the current task finishes
- An `AgentController` passed into `runAgent()` enabling graceful abort and pause/resume between steps
- Pre-run slash command modifiers parsed from the CLI task argument (e.g. `/verbose /model gpt-4o fix the auth bug`)

## Capabilities

### New Capabilities

- `agent-tui`: Interactive terminal UI for the code agent — live step tracker, tool call display, task queue, slash command input with blinking cursor, and final result pane using Ink (React for CLIs)
- `agent-commands`: Slash command parser and handler — `/help`, `/abort`, `/pause`, `/verbose`, `/clear`, `/model`, `/add` — wired to TUI state and `AgentController`

### Modified Capabilities

- `agent-loop`: Extract the agent loop from `agent.ts` into an exportable `runAgent(task, config, onEvent, controller?)` function; `AgentController` enables abort and pause/resume between steps

## Impact

- New dependencies: `ink`, `react`, `ink-text-input` (Ink supports Bun natively)
- New files: `src/tui.tsx`, `src/run-agent.ts`, `src/commands.ts`
- `src/agent.ts` refactored to call `runAgent()` from `src/run-agent.ts`
- No changes to `planner.ts`, `executor.ts`, `tools.ts`, or `types.ts`
- New `package.json` scripts: `"tui": "bun run src/tui.tsx"`
