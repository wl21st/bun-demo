## Context

The transport logging system (`src/planner.ts`) appends one NDJSON line per LLM call to `logs/agent-wire.log`. Each line contains the full request (headers + body) and response (headers + body) as plain JSON. During development and debugging, engineers need to inspect these entries quickly. Currently this requires piping through `jq` or similar tools, and even then the output lacks domain-aware formatting (e.g., rendering tool call arguments, collapsing headers, highlighting roles).

The wire log format is stable and specified in `openspec/specs/llm-transport-log/spec.md`. The pretty-printer is a pure read-side tool — it does not modify the write path.

## Goals / Non-Goals

**Goals:**
- CLI tool `src/pretty-print.ts` executable via `bun run src/pretty-print.ts <logfile>`
- Parse NDJSON wire log files and render each entry in color-coded, human-readable output
- Display request section: model, messages (role-labeled), tool definitions list
- Display response section: finish reason, token usage, tool call name + formatted arguments
- Display headers in a compact table with sensitive headers redacted (matching existing blocklist: `authorization`, `content-type`)
- Optional `--index <n>` flag to display only the nth entry (0-based)
- Optional `--type <request|response>` flag to show only request or response half

**Non-Goals:**
- Not a live log tailer (no `--follow` mode)
- Does not modify `src/planner.ts` or the write path
- Does not write output to files (stdout only)
- No interactive TUI

## Decisions

### 1. Standalone Bun script, not a library

**Decision**: `src/pretty-print.ts` is a standalone script run via `bun run`, not a function exported from a module.

**Rationale**: The tool is purely for developer ergonomics — it has no callers in production code. Keeping it standalone avoids polluting the module graph and makes it trivially invokable.

**Alternative considered**: Exporting a `prettyPrint(entry)` function from a shared module. Rejected because there are no other callers and it adds unnecessary coupling.

### 2. Use existing `TransportLogEntry` type + raw wire log structure

**Decision**: Parse each NDJSON line as the wire log shape (`{ timestamp, type, request: { headers, body }, response: { headers, body } }`), not as `TransportLogEntry` from `src/types.ts`.

**Rationale**: `TransportLogEntry` is the abbreviated terminal log shape (truncated strings, tool name only). The wire log contains the full untruncated request/response bodies in OpenAI API format. The pretty-printer benefits from the richer wire log structure (all messages, full arguments, actual API response fields like `id`, `system_fingerprint`).

**Alternative considered**: Re-using `TransportLogEntry`. Rejected because it lacks full message content and the full choices/tool_calls array.

### 3. Redact headers using the same blocklist as the write path

**Decision**: Apply the same header blocklist (`authorization`, `content-type` for request; `content-type` for response) when rendering headers.

**Rationale**: Consistency — an engineer reading pretty-printed output should see the same headers they'd see if they audited the blocklist logic. Avoids re-exposing headers the write path intentionally strips.

### 4. ANSI color via raw escape codes (no new dependency)

**Decision**: Use ANSI escape codes directly (or Bun's `chalk`-compatible approach if already present), with no new npm dependency.

**Rationale**: The project already uses ANSI codes in `src/logger.ts` for color-coded log levels. Staying consistent with that pattern avoids adding a dependency for a dev tool.

## Risks / Trade-offs

- **Wire log schema changes** → Mitigation: The wire log format is spec-controlled; any change goes through OpenSpec and the pretty-printer spec will need updating. Low risk for a stable MVP.
- **Large log files** → Mitigation: Read line-by-line using Bun's `file().text()` split on newlines. For very large files this is still synchronous, but acceptable for a dev tool. Add a note in help text.
- **Malformed NDJSON lines** → Mitigation: Skip and warn on lines that fail `JSON.parse`, continuing to display valid entries.
