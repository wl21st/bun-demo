## ADDED Requirements

### Requirement: CLI tool renders NDJSON wire log entries in human-readable format
The system SHALL provide a `src/pretty-print.ts` CLI tool that accepts a path to an NDJSON wire log file as its first positional argument and prints each entry to stdout in formatted, color-coded output.

#### Scenario: Basic invocation prints all entries
- **WHEN** the user runs `bun run src/pretty-print.ts logs/agent-wire.log`
- **THEN** each NDJSON line in the file is rendered as a formatted block to stdout

#### Scenario: File not found produces error message
- **WHEN** the user passes a path that does not exist
- **THEN** the tool prints an error message to stderr and exits with a non-zero status code

#### Scenario: Malformed NDJSON line is skipped with a warning
- **WHEN** a line in the log file fails JSON.parse
- **THEN** the tool prints a warning to stderr identifying the line number, continues rendering remaining valid lines, and exits with a non-zero status code

### Requirement: Request section displays model, messages, and tool definitions
The tool SHALL render the request half of each entry showing: the model name, each message with its role and content, and the list of tool definition names.

#### Scenario: Messages rendered with role labels
- **WHEN** a wire log entry is rendered
- **THEN** each message in `request.body.messages` is shown with its `role` (e.g., `system`, `user`, `assistant`) preceding the `content`

#### Scenario: Tool names listed without full schema
- **WHEN** a wire log entry contains tool definitions in `request.body.tools`
- **THEN** only the `function.name` of each tool is shown, not the full JSON schema

#### Scenario: No tool definitions shows empty list
- **WHEN** `request.body.tools` is absent or empty
- **THEN** the tools line shows `(none)`

### Requirement: Response section displays finish reason, usage, and tool call
The tool SHALL render the response half of each entry showing: the finish reason, prompt and completion token counts, and for tool-call responses the tool name and formatted arguments.

#### Scenario: Tool call response shows name and arguments
- **WHEN** `response.body.choices[0].finish_reason` is `"tool_calls"`
- **THEN** the tool name and JSON-formatted arguments from `choices[0].message.tool_calls[0]` are displayed

#### Scenario: Non-tool-call response shows content
- **WHEN** `response.body.choices[0].finish_reason` is `"stop"`
- **THEN** the content from `choices[0].message.content` is displayed

#### Scenario: Token usage shown when present
- **WHEN** `response.body.usage` is present
- **THEN** prompt and completion token counts are displayed

#### Scenario: Token usage omitted when absent
- **WHEN** `response.body.usage` is absent
- **THEN** usage line shows `(unavailable)`

### Requirement: Headers rendered as compact table with sensitive headers redacted
The tool SHALL display request and response headers as a compact `key: value` list. Headers matching the blocklist (request: `authorization`; request and response: `content-type`) SHALL be replaced with `[REDACTED]`.

#### Scenario: Authorization header is redacted
- **WHEN** a wire log entry is rendered
- **THEN** the `authorization` header value in the request section shows `[REDACTED]`

#### Scenario: Non-sensitive headers shown as-is
- **WHEN** `x-request-id` or `x-ratelimit-*` headers are present in response headers
- **THEN** they are displayed with their actual values

### Requirement: --index flag filters to a single entry
The tool SHALL support an `--index <n>` CLI flag (0-based) that, when provided, renders only the nth entry in the log file.

#### Scenario: Valid index renders single entry
- **WHEN** user runs `bun run src/pretty-print.ts logs/agent-wire.log --index 2`
- **THEN** only the third entry (0-based index 2) is rendered

#### Scenario: Out-of-range index produces error
- **WHEN** the specified index exceeds the number of entries in the file
- **THEN** the tool prints an error to stderr and exits with a non-zero status code

### Requirement: --type flag filters to request or response half
The tool SHALL support a `--type <request|response>` CLI flag that, when provided, renders only the specified half of each entry.

#### Scenario: --type request shows only request section
- **WHEN** user passes `--type request`
- **THEN** only the request half (model, messages, tools, headers) is rendered for each entry

#### Scenario: --type response shows only response section
- **WHEN** user passes `--type response`
- **THEN** only the response half (finish reason, usage, tool call/content, headers) is rendered for each entry
