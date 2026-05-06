## ADDED Requirements

### Requirement: Exportable runAgent function encapsulates the agent loop
The system SHALL export a `runAgent(task, config, onEvent, controller?)` function from `src/run-agent.ts` that executes the full ReAct agent loop, emits typed progress events via the `onEvent` callback, and checks the optional `AgentController` between every step.

#### Scenario: runAgent executes all steps and emits events
- **WHEN** `runAgent` is called with a task and config
- **THEN** it calls `planNextStep` and `executeStep` in a loop, emitting a `StepStart` event before each step and a `StepDone` event after each step

#### Scenario: runAgent emits AgentFinished on finish tool
- **WHEN** the agent calls the `finish` tool
- **THEN** `runAgent` emits an `AgentFinished` event with the finish message and resolves

#### Scenario: runAgent emits AgentFailed when MAX_STEPS exhausted
- **WHEN** the loop reaches MAX_STEPS without a `finish` tool call
- **THEN** `runAgent` emits an `AgentFailed` event with reason `"max_steps"` and resolves

#### Scenario: runAgent emits AgentFailed on planNextStep error
- **WHEN** `planNextStep` throws
- **THEN** `runAgent` emits an `AgentFailed` event with the error message and resolves

### Requirement: AgentController enables abort and pause/resume between steps
The system SHALL export an `AgentController` interface from `src/run-agent.ts` with `abort()`, `pause()`, `resume()`, and `waitForResume(): Promise<void>` members. After each step completes, `runAgent` SHALL check `controller.aborted` (emit `AgentFailed` with reason `"aborted"` and return) then `controller.paused` (await `waitForResume()`) before starting the next step.

#### Scenario: Abort stops the run after the current step
- **WHEN** `controller.abort()` is called while a step is executing
- **THEN** the current step completes normally and `runAgent` emits `AgentFailed` with reason `"aborted"` before starting the next step

#### Scenario: Pause suspends between steps
- **WHEN** `controller.pause()` is called
- **THEN** `runAgent` completes the current step and waits before starting the next step until `controller.resume()` is called

#### Scenario: No controller passes through unchanged
- **WHEN** `runAgent` is called without a `controller` argument
- **THEN** the loop runs to completion with no abort/pause checks

### Requirement: Agent event type definitions exported from run-agent module
The system SHALL export a discriminated union type `AgentEvent` with variants `StepStart`, `StepDone`, `AgentFinished`, and `AgentFailed` from `src/run-agent.ts`.

#### Scenario: Consumers can type-narrow on event kind
- **WHEN** a consumer receives an `AgentEvent`
- **THEN** narrowing on `event.kind` SHALL give access to the fields specific to that variant

### Requirement: agent.ts uses runAgent as its loop driver
The system SHALL refactor `src/agent.ts` to call `runAgent()` and log events via `consola` rather than containing its own loop.

#### Scenario: Plain agent run produces same observable output
- **WHEN** user runs `bun run agent "<task>"`
- **THEN** the console output is equivalent to the previous plain-log behavior (step number, tool name, observation ok/output)
