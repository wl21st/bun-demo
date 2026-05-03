## Context

The agent (`src/agent.ts`) is a top-level script that runs a synchronous for-loop calling `planNextStep` and `executeStep` in sequence, logging output via `consola`. All UI concerns are inline in this loop. To add a TUI we need to separate the loop logic from its presentation so both a plain-log runner and an Ink-rendered runner can share the same core loop.

The project uses Bun, which supports JSX/TSX natively and is compatible with Ink (which targets Node ≥18; Bun is ABI-compatible). No bundler is needed.

## Goals / Non-Goals

**Goals:**
- Live terminal UI showing: task description, step counter, current tool + input, step result, final output
- Reusable `runAgent()` function that emits progress events consumed by any presenter (plain logger or TUI)
- New `bun run tui` script entry point
- Ink + React as the rendering layer
- Persistent command input bar with blinking cursor accepting slash commands at any time
- Task queue: `/add <task>` enqueues follow-up tasks that run sequentially after the current task
- Graceful abort and pause/resume via `AgentController` passed into `runAgent()`
- Pre-run slash command modifiers parsed from the CLI task argument

**Non-Goals:**
- Persisting history or replaying sessions in the TUI
- Changing agent logic (`planner.ts`, `executor.ts`, `tools.ts`)
- Supporting non-Bun runtimes
- Interrupting a tool call mid-execution (pause/abort only take effect between steps)

## Decisions

### 1. Extract agent loop to `src/run-agent.ts` with an event callback and controller

**Decision**: Pull the for-loop from `agent.ts` into `runAgent(task, config, onEvent, controller?)` where `onEvent` receives typed progress events (`StepStart`, `StepDone`, `AgentFinished`, `AgentFailed`). `AgentController` is an optional object with `abort()`, `pause()`, and `resume()` methods.

The loop checks the controller between every step:
```ts
if (controller?.aborted) { emit AgentFailed("aborted"); return }
if (controller?.paused)  { await controller.waitForResume() }
```

**Alternatives considered**:
- `EventEmitter` — adds unnecessary Node-ism; a plain callback is simpler for a synchronous-async loop.
- `AbortSignal` alone — handles abort but not pause/resume.
- Streaming via `AsyncGenerator` — clean but requires callers to drive iteration; a callback push model is easier to consume from both an `agent.ts` await and an Ink re-render.

**Rationale**: Callback + optional controller is the simplest contract. `agent.ts` passes no controller (fire-and-forget); the TUI creates one and wires it to `/abort` and `/pause`.

### 2. Use Ink + React for the TUI

**Decision**: Ink 5.x with React 18. Renders to stdout using a virtual DOM diff, so only changed lines repaint.

**Alternatives considered**:
- Raw ANSI escape codes — low-level, hard to maintain, no layout primitives.
- Blessed/neo-blessed — heavier, less idiomatic for a Bun+TS project; complex widget tree for what is essentially a read-only log view.
- `cli-spinners` + manual rewrite — no layout, manual cursor management.

**Rationale**: Ink is the standard React-for-CLI library, has Bun support, and keeps the TUI component tree familiar to anyone reading the codebase.

### 3. `agent.ts` becomes a thin wrapper, not deleted

**Decision**: Keep `src/agent.ts` as the plain-log entry point, refactored to call `runAgent()` and log events via `consola`. Do not merge it into the TUI.

**Rationale**: Keeps `bun run agent` working for headless/CI use; the TUI is an additive entry point.

### 4. Slash command handling

**Decision**: Two separate concerns — pre-run parsing and mid-run dispatch — handled in `src/commands.ts`.

**Pre-run**: The CLI task argument is parsed before `runAgent()` is called. Leading `/flag` and `/key value` tokens are stripped and applied as config overrides; the remainder is the task string:
```
"/ verbose /model gpt-4o fix the auth bug"
→ { flags: { verbose: true, model: "gpt-4o" }, task: "fix the auth bug" }
```

**Mid-run**: User types into the `<CommandInput>` bar at any time. On submit, `parseCommand(input)` returns a typed `Command` discriminated union dispatched by `<App>`:

| Command | Effect |
|---|---|
| `/help` | Show command list inline in TUI |
| `/abort` | During run: `controller.abort()`. After `AgentFailed`: clear queue and exit code 1. |
| `/pause` | `controller.pause()` — resumes on `/resume` |
| `/resume` | `controller.resume()` — unpauses a paused run |
| `/verbose` | Toggle `verbose` state (full tool inputs) |
| `/clear` | Reset `history` display (not agent state) |
| `/model <name>` | Set model for all queued tasks (not current run) |
| `/add <task>` | Push task string onto queue |
| `/skip` | After `AgentFailed`: advance to next queued task; no-op if queue empty |

Unknown commands show an inline error in the command bar.

### 5. Task queue

**Decision**: `<App>` holds `queue: string[]` in state. Auto-advance behavior depends on how the run ended:

- **`AgentFinished`**: if queue is non-empty, auto-dequeue next task, append a visual separator to step history (preserving prior run context), start new `runAgent()` with fresh controller. No user prompt needed.
- **`AgentFailed`**: stop. Display failure and remaining queue. Wait for user to type `/skip` (advance to next task) or `/abort` (clear queue, exit code 1). This prevents silent error swallowing across a multi-task queue.

The `<QueuePanel>` component renders only when `queue.length > 0`, showing pending task labels. This keeps the default single-task layout unchanged.

### 6. Component layout

```
┌─ Agent TUI ─────────────────────────────────────┐
│ Task: fix the auth bug         [model: claude-3] │
├─────────────────────────────────────────────────┤
│ Step 3 / 20  ⟳  shell                           │
│   { command: "bun test" }                        │
├─────────────────────────────────────────────────┤
│ History                                          │
│  ✓ Step 1  readFile   src/auth.ts                │
│  ✓ Step 2  writeFile  src/auth.ts                │
│  ⟳ Step 3  shell  ...                           │
├─────────────────────────────────────────────────┤
│ Queue  [2 pending]          (hidden when empty)  │
│   · also fix the login flow                      │
│   · add tests for both                           │
├─────────────────────────────────────────────────┤
│ Output:  (shown after finish tool)               │
├─────────────────────────────────────────────────┤
│ > _                        /help for commands    │
└─────────────────────────────────────────────────┘
```

`<CommandInput>` uses `ink-text-input` with `showCursor` (default `true`) — blinking cursor is provided by the library. Input is always focused; `focus` prop stays `true` for the duration of the session.

Single `<App>` component holds all state. Child components: `<TaskHeader>`, `<CurrentStep>`, `<StepHistory>`, `<QueuePanel>`, `<FinalOutput>`, `<CommandInput>`.

## Risks / Trade-offs

- **Ink terminal width** → Ink auto-wraps at terminal columns; long tool inputs may wrap awkwardly. Mitigation: truncate long strings in the UI layer only.
- **Bun + Ink JSX transform** → Bun requires `"jsx": "react-jsx"` in `tsconfig.json` and `.tsx` extension. Mitigation: add tsconfig pragma; test with `bun run src/tui.tsx` before wiring scripts.
- **consola output interferes with Ink** → consola writes to stdout/stderr; Ink takes over stdout. Agent loop events must NOT call consola when running inside the TUI. Mitigation: `runAgent()` emits events only; presenters decide how to log.
- **No test coverage for TUI components** → Ink components are hard to unit-test in Bun today. Mitigation: keep component logic thin; test `runAgent()` and event shape separately.
