## 1. Dependencies and Project Setup

- [x] 1.1 Install `ink`, `react`, `@types/react`, and `ink-text-input` as dependencies via `bun add`
- [x] 1.2 Add `"jsx": "react-jsx"` to `tsconfig.json` compilerOptions (create tsconfig.json if absent)
- [x] 1.2a Smoke-test Bun+Ink JSX: create a throwaway `src/_ink_smoke.tsx` that renders `<Text>ok</Text>` via `render()` and run it with `bun run src/_ink_smoke.tsx`; confirm output then delete the file — do not proceed to Phase 2 if this fails
- [x] 1.3 Add `"tui": "bun run src/tui.tsx"` script to `package.json`

## 2. Agent Loop Extraction

- [x] 2.1 Create `src/run-agent.ts` with exported `AgentEvent` discriminated union type:
  - `StepStart { kind: "step_start", stepNumber: number, tool: string, input: unknown }`
  - `StepDone { kind: "step_done", stepNumber: number, tool: string, observation: Observation }`
  - `AgentFinished { kind: "agent_finished", message: string }`
  - `AgentFailed { kind: "agent_failed", reason: "max_steps" | "aborted" | "error", message: string }`
- [x] 2.2 Export `AgentController` interface from `src/run-agent.ts` with `abort()`, `pause()`, `resume()`, and `waitForResume(): Promise<void>` members; implement a `createAgentController()` factory
- [x] 2.3 Implement `runAgent(task, config, onEvent, controller?)` in `src/run-agent.ts` — copy the for-loop from `agent.ts`, replace consola calls with `onEvent`, check controller between steps
- [x] 2.4 Handle `planNextStep` errors by emitting `AgentFailed` (not process.exit)
- [x] 2.5 Emit `AgentFailed` with reason `"max_steps"` when loop exhausts MAX_STEPS
- [x] 2.6 Emit `AgentFailed` with reason `"aborted"` when `controller.aborted` is true after a step
- [x] 2.7 Await `controller.waitForResume()` when `controller.paused` is true after a step
- [x] 2.8 Refactor `src/agent.ts` to call `runAgent()` and log events via `consola` — verify `bun run agent` still works

## 3. Command Parsing

- [x] 3.1 Create `src/commands.ts` with exported `ParsedFlags` type and `parseTaskArg(input)` function — strips leading `/flag` and `/key value` tokens, returns `{ task, flags }`
- [x] 3.2 Export `Command` discriminated union from `src/commands.ts` with variants: `Help`, `Abort`, `Pause`, `Resume`, `Verbose`, `Clear`, `Model`, `Add`, `Skip`, `Unknown`
- [x] 3.3 Implement `parseCommand(input)` in `src/commands.ts` — maps slash command strings to `Command` variants; unknown inputs return `{ kind: "unknown", input }`

## 4. TUI Components

- [x] 4.1 Create `src/tui.tsx` — parse `process.argv` via `parseTaskArg`, exit with usage error if no task; mount `<App>` with initial task and flags
- [x] 4.2 Implement `<App>` component holding all state: `currentTask`, `queue`, `history`, `controller`, `model`, `verbose`, `status`, `helpVisible`, `commandError`
- [x] 4.3 Implement `<TaskHeader task={string} model={string}>` — renders task description and active model name
- [x] 4.4 Implement `<CurrentStep>` — shows step number, spinner (from `ink-spinner`) while running, ✓/✗ on done; respects `verbose` flag for truncation
- [x] 4.5 Implement `<StepHistory steps={CompletedStep[]} verbose={boolean}>` — list of past steps with tool name and ok indicator
- [x] 4.6 Implement `<QueuePanel queue={string[]}>` — renders only when `queue.length > 0`; lists pending task labels
- [x] 4.7 Implement `<FinalOutput event={AgentFinished | AgentFailed | null}>`
- [x] 4.8 Implement `<CommandInput>` using `ink-text-input` with `showCursor` (default `true`) — always focused; on submit calls `onCommand(parseCommand(value))`
- [x] 4.9 Wire `runAgent()` into `<App>` via `useEffect` on mount with a fresh `AgentController`; update state on each `onEvent` callback
- [x] 4.10 Dispatch `Command` variants in `<App>`:
  - `/abort` → if running: `controller.abort()`; if status is `failed`: clear queue and call `useApp().exit(1)`
  - `/pause` → `controller.pause()`
  - `/resume` → `controller.resume()`
  - `/skip` → if status is `failed` and queue non-empty: dequeue next task, append separator to history, create fresh controller, start new `runAgent()`; if queue empty: no-op
  - `/verbose` → toggle `verbose` flag
  - `/clear` → reset `history` display (not agent state)
  - `/model` → set `model` in state (applies to next queued run)
  - `/add` → push task string onto `queue`
  - `/help` → set `helpVisible`
  - `unknown` → set `commandError` (auto-clear after 3s)
- [x] 4.11 Queue advance logic: on `AgentFinished` with queue non-empty — append a visual separator to history, dequeue next task, update `currentTask`, create fresh controller, set status to `running`, start new `runAgent()` call; on `AgentFailed` — set status to `failed`, do NOT auto-advance (user must `/skip` or `/abort`); wire `/model` override: when auto-advancing, pass current `model` state into the new config
- [x] 4.12 Exit process after render settles on final state using Ink's `useApp().exit()` — code 0 for `AgentFinished`, code 1 for `AgentFailed` (only when queue is empty)

## 5. Validation

- [ ] 5.1 Run `bun run tui "list files in src/"` and verify live step updates and blinking cursor
- [ ] 5.2 Run `bun run tui "/verbose list files in src/"` and verify full tool inputs are shown
- [ ] 5.3 During a TUI run, type `/add run the tests` and verify it appears in the queue panel and executes after the first task finishes
- [ ] 5.4 During a run, type `/abort` and verify the run stops after the current step with an error message
- [ ] 5.5 Type `/help` and verify the command list appears above the input bar
- [ ] 5.6 Type an unknown command and verify an inline error appears and clears after 3 seconds
- [ ] 5.7 Queue two tasks; let task 1 succeed and verify task 2 auto-starts with a visual separator in history
- [ ] 5.8 Queue two tasks; force task 1 to fail (use a task the agent will exhaust MAX_STEPS on); verify TUI stops at failure, shows remaining queue, and does NOT auto-advance; type `/skip` and verify task 2 starts
- [ ] 5.9 With a failed task and non-empty queue, type `/abort` and verify queue is cleared and process exits code 1
- [ ] 5.10 Run `bun run agent "list files in src/"` and verify plain-log output is unchanged
- [x] 5.11 Run `bun run tui` with no args and verify usage error and exit code 1
- [x] 5.12 Run `bun test` and confirm all existing tests pass
