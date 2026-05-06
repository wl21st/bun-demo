## ADDED Requirements

### Requirement: TUI entry point launches agent with live display
The system SHALL provide a `src/tui.tsx` entry point that accepts a task string as CLI arguments, strips any leading slash-command modifiers via `parseTaskArg()`, and renders an interactive terminal UI while the agent executes.

#### Scenario: Launch with task argument
- **WHEN** user runs `bun run tui "write tests for math.ts"`
- **THEN** the TUI renders and the agent begins executing the task

#### Scenario: Launch with pre-run slash modifiers
- **WHEN** user runs `bun run tui "/verbose /model gpt-4o fix the auth bug"`
- **THEN** `parseTaskArg` strips the modifiers, sets `verbose=true` and `model="gpt-4o"`, and the agent runs with task `"fix the auth bug"`

#### Scenario: Launch with no task argument
- **WHEN** user runs `bun run tui` with no arguments
- **THEN** the TUI prints a usage error and exits with code 1

### Requirement: Task header panel displays the user's task
The system SHALL render a visible task description panel at the top of the TUI for the duration of the run.

#### Scenario: Task displayed immediately
- **WHEN** the TUI starts
- **THEN** the task string is displayed before the first agent step executes

### Requirement: Current step panel shows live progress
The system SHALL render a current-step panel that updates on each agent step with the step number, tool name, and tool input.

#### Scenario: Step start updates current step panel
- **WHEN** the agent begins a step
- **THEN** the panel shows the step number, a spinner, the tool name, and the tool input (truncated to 200 chars)

#### Scenario: Step completes updates panel to done state
- **WHEN** the agent step completes
- **THEN** the spinner is replaced with a checkmark (✓) or cross (✗) based on `observation.ok`

### Requirement: Step history panel accumulates completed steps
The system SHALL render a scrollable history list of all completed steps below the current-step panel.

#### Scenario: Completed steps appear in history
- **WHEN** a step completes
- **THEN** the step is appended to the history list with its tool name and ok/fail indicator

### Requirement: Final output panel renders agent result
The system SHALL display the finish tool's message in a dedicated output panel when the agent completes successfully.

#### Scenario: Agent finishes successfully
- **WHEN** the agent calls the `finish` tool
- **THEN** the TUI replaces the current-step panel with a final output panel showing the finish message and, if the queue is empty, exits after a brief pause

#### Scenario: Agent exhausts MAX_STEPS
- **WHEN** the agent loop exits without calling `finish`
- **THEN** the TUI displays an error message and, if the queue is empty, exits with code 1

### Requirement: Command input bar accepts slash commands at all times
The system SHALL render a persistent `<CommandInput>` bar at the bottom of the TUI using `ink-text-input` with `showCursor` enabled (blinking cursor). The bar SHALL accept input during agent execution and dispatch typed `Command` values.

#### Scenario: Blinking cursor always visible
- **WHEN** the TUI is running
- **THEN** a blinking cursor is visible in the command input bar at all times

#### Scenario: /abort stops the current run
- **WHEN** the user types `/abort` and presses Enter
- **THEN** `controller.abort()` is called and the run ends after the current step completes

#### Scenario: /pause suspends between steps
- **WHEN** the user types `/pause` and presses Enter
- **THEN** `controller.pause()` is called; the agent finishes its current step and waits

#### Scenario: /verbose toggles full tool input display
- **WHEN** the user types `/verbose`
- **THEN** the current-step and history panels toggle between truncated (200 chars) and full tool input display

#### Scenario: /clear resets the history display
- **WHEN** the user types `/clear`
- **THEN** the step history panel is cleared visually; agent state is not affected

#### Scenario: /model sets model for queued tasks
- **WHEN** the user types `/model <name>` during a run
- **THEN** the model is updated for all tasks currently in the queue; the active run is unaffected

#### Scenario: /help displays available commands
- **WHEN** the user types `/help`
- **THEN** the list of available slash commands is shown inline above the command bar

#### Scenario: Unknown command shows inline error
- **WHEN** the user submits an unrecognised slash command
- **THEN** the command bar displays an error message inline and clears after 3 seconds

### Requirement: Task queue enables sequential follow-up runs
The system SHALL maintain a `queue: string[]` in `<App>` state. When a run ends with `AgentFinished` and the queue is non-empty, the TUI SHALL automatically dequeue the next task, append a visual separator to the step history, and start a new `runAgent()` call with a fresh `AgentController`. When a run ends with `AgentFailed`, the TUI SHALL NOT auto-advance; it SHALL display the failure and wait for user input.

#### Scenario: /add enqueues a follow-up task
- **WHEN** the user types `/add <task>`
- **THEN** the task string is appended to the queue and the `<QueuePanel>` becomes visible

#### Scenario: Queue auto-advances after successful run
- **WHEN** a run ends with `AgentFinished` and the queue is non-empty
- **THEN** the next task is dequeued, a separator is appended to history, and the agent begins immediately

#### Scenario: Queue stops on failure — waits for user
- **WHEN** a run ends with `AgentFailed` and the queue is non-empty
- **THEN** the TUI displays the failure message and the remaining queue, and waits for user input without auto-advancing

#### Scenario: /skip advances past a failed task
- **WHEN** a run has ended with `AgentFailed` and the user types `/skip`
- **THEN** the next task is dequeued and the agent begins immediately; if the queue is empty `/skip` is a no-op

#### Scenario: /abort after failure discards remaining queue
- **WHEN** a run has ended with `AgentFailed` and the user types `/abort`
- **THEN** the remaining queue is cleared and the TUI exits with code 1

#### Scenario: Queue panel hidden when empty
- **WHEN** the queue is empty
- **THEN** the `<QueuePanel>` is not rendered and the layout is unchanged from the single-task view
