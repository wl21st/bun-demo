## ADDED Requirements

### Requirement: Pretty terminal transport log emitted per LLM call
The planner SHALL emit a structured DEBUG log entry to the terminal after each LLM call via the tagged planner logger. The entry MUST include: `model`, `stopReason` (`finish_reason` from the response), `usage` (`promptTokens`, `completionTokens`), `latencyMs`, `request` (messages array with roles and abbreviated content, plus tool names list), and `response` (toolCalled and arguments object with abbreviated values).

#### Scenario: Successful LLM call produces a terminal log entry
- **WHEN** the planner completes an LLM call successfully
- **THEN** a DEBUG entry is emitted to the terminal containing model, stopReason, usage, latencyMs, request summary, and response summary

#### Scenario: Long string fields are abbreviated
- **WHEN** any string field in the terminal log entry exceeds 1024 characters
- **THEN** it is shown as `<first 512 chars>...[N chars]...<last 512 chars>`

#### Scenario: Token usage unavailable
- **WHEN** the LLM response omits `usage` (e.g., some proxy endpoints)
- **THEN** the terminal log entry is still emitted with `promptTokens` and `completionTokens` set to `undefined`

#### Scenario: Latency is measured end-to-end
- **WHEN** a transport log entry is emitted
- **THEN** `latencyMs` reflects the elapsed time from immediately before `client.chat.completions.create` is called to immediately after it resolves

### Requirement: Raw wire log written to logs/agent-wire.log
The planner SHALL append one NDJSON line to `logs/agent-wire.log` after each LLM call. Each line MUST contain:
- `timestamp`: ISO-8601 string
- `type`: the string `"chat.completions"`
- `request`: `{ headers, body }` — `body` is the exact params passed to `create()`, `headers` are all request headers with `authorization` and `content-type` stripped
- `response`: `{ headers, body }` — `body` is the full API response object (`id`, `created`, `model`, `usage`, `system_fingerprint`, `choices`), `headers` are all response headers with `content-type` stripped

No field truncation. The `logs/` directory SHALL be created if it does not exist.

#### Scenario: Wire log line structure is correct
- **WHEN** the planner completes an LLM call successfully
- **THEN** one NDJSON line is appended to `logs/agent-wire.log` containing `timestamp`, `type`, `request.headers`, `request.body`, `response.headers`, and `response.body`

#### Scenario: Wire log type field identifies the endpoint
- **WHEN** a wire log line is written
- **THEN** the `type` field is `"chat.completions"`

#### Scenario: Authorization header is never logged
- **WHEN** a wire log line is written
- **THEN** `request.headers` does NOT contain the `authorization` key

#### Scenario: Non-trivial response headers are captured
- **WHEN** the API response includes `x-request-id` or `x-ratelimit-*` headers
- **THEN** those headers appear in `response.headers` in the wire log entry

#### Scenario: Unexpected headers are captured automatically
- **WHEN** the API response includes any header not in the blocklist
- **THEN** that header appears in `response.headers` — no allowlist maintenance required

#### Scenario: Wire log contains untruncated content
- **WHEN** a writeFile tool call with a large content argument is made
- **THEN** the `logs/agent-wire.log` entry contains the complete untruncated `arguments.content` value

#### Scenario: logs/ directory is gitignored
- **WHEN** the `logs/` directory is checked
- **THEN** it appears in `.gitignore` and is not tracked by git

### Requirement: All logging uses log4j-style format via shared logger module
The codebase SHALL have a `src/logger.ts` module that creates a consola instance with a custom reporter producing log4j-style lines. All modules SHALL import their logger from this module rather than from `consola` directly. The format SHALL be: `<ISO-8601 timestamp> <LEVEL> <tag> - <message>`.

#### Scenario: Log line format is correct
- **WHEN** any module emits a log entry
- **THEN** the output line matches the pattern `YYYY-MM-DDTHH:mm:ss.sssZ LEVEL tag - message`

#### Scenario: Each module uses its own tag
- **WHEN** `planner.ts` logs
- **THEN** the tag field reads `planner`
- **WHEN** `agent.ts` logs
- **THEN** the tag field reads `agent`

### Requirement: TransportLogEntry type is defined
The codebase SHALL define a `TransportLogEntry` type in `src/types.ts` describing the shape of a transport log record.

#### Scenario: Type shape is correct
- **WHEN** a `TransportLogEntry` is constructed
- **THEN** it contains fields: `model: string`, `stopReason: string | undefined`, `latencyMs: number`, `usage: { promptTokens: number | undefined, completionTokens: number | undefined }`, `request: { messages: Array<{role: string, content: string}>, tools: string[] }`, `response: { toolCalled: string, arguments: Record<string, unknown> }`
