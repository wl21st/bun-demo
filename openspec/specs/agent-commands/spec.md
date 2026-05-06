## ADDED Requirements

### Requirement: parseTaskArg strips pre-run slash modifiers from CLI input
The system SHALL export a `parseTaskArg(input: string)` function from `src/commands.ts` that strips leading `/flag` and `/key value` tokens and returns `{ task: string, flags: ParsedFlags }`.

#### Scenario: Modifiers extracted before task text
- **WHEN** input is `"/verbose /model gpt-4o fix the auth bug"`
- **THEN** `parseTaskArg` returns `{ task: "fix the auth bug", flags: { verbose: true, model: "gpt-4o" } }`

#### Scenario: No modifiers returns input unchanged
- **WHEN** input contains no leading slash tokens
- **THEN** `parseTaskArg` returns `{ task: input, flags: {} }`

### Requirement: parseCommand parses mid-run slash commands into a typed union
The system SHALL export a `parseCommand(input: string)` function from `src/commands.ts` that returns a discriminated union `Command` with variants: `Help`, `Abort`, `Pause`, `Resume`, `Verbose`, `Clear`, `Model`, `Add`, `Skip`, `Unknown`.

#### Scenario: Known commands parse correctly
- **WHEN** input is `/abort`
- **THEN** `parseCommand` returns `{ kind: "abort" }`

#### Scenario: Commands with arguments parse the argument
- **WHEN** input is `/model claude-opus-4-7`
- **THEN** `parseCommand` returns `{ kind: "model", name: "claude-opus-4-7" }`

#### Scenario: /add captures the full task string
- **WHEN** input is `/add also fix the login flow`
- **THEN** `parseCommand` returns `{ kind: "add", task: "also fix the login flow" }`

#### Scenario: /skip returns Skip variant
- **WHEN** input is `/skip`
- **THEN** `parseCommand` returns `{ kind: "skip" }`

#### Scenario: Unknown input returns Unknown variant
- **WHEN** input is `/notacommand`
- **THEN** `parseCommand` returns `{ kind: "unknown", input: "/notacommand" }`
