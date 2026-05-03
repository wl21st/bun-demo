## Context

The agent's planner (`src/planner.ts`) currently uses a text-based protocol: the system prompt instructs the model to return a specific JSON structure inside its `message.content`, and the code manually parses and strips markdown fences from that output. This approach is fragile — models sometimes wrap output in code fences, add commentary, or drift from the schema under adversarial inputs.

The OpenAI API provides a native `tools` parameter that accepts JSON Schema definitions. When tools are provided, the model returns structured `tool_calls` in the response rather than free-form content. This moves schema enforcement to the API layer and eliminates the need for manual JSON parsing or fence stripping.

A transport log is absent today; there is no record of what was sent to the LLM, what came back, or how long it took. This makes debugging agent failures opaque.

## Goals / Non-Goals

**Goals:**
- Replace the content-JSON protocol with OpenAI native `tools` + `tool_calls` API parameters
- Define all six agent tools (`listFiles`, `readFile`, `writeFile`, `shell`, `test`, `finish`) as OpenAI function tool schemas with full JSON Schema `parameters` blocks
- Parse agent steps from `tool_calls[0].function.arguments` instead of `message.content`
- Emit a structured transport log entry for each LLM call: request params (model, message count, tool count) and response metadata (tool called, argument length, token usage, latency ms)
- Remove `stripCodeFence` since it is no longer needed

**Non-Goals:**
- Parallel tool calls (agent uses exactly one tool per turn by design)
- Persistent log file storage (log to stdout/consola; file persistence is a future concern)
- Changing the agent's tool set or adding new tools
- Migrating to a different LLM provider or SDK

## Decisions

### 1. Use `tool_choice: "required"` instead of `"auto"`

**Decision**: Set `tool_choice: "required"` on every call.

**Rationale**: The agent must always call exactly one tool per turn. With `"auto"`, the model could return a text message instead of a tool call, which would require a fallback content-parse path — recreating the fragility we're eliminating. `"required"` forces a tool call every time.

**Alternative considered**: Keep `"auto"` and fall back to content parsing. Rejected — defeats the purpose of the migration.

### 2. Define tool schemas inline in `planner.ts`, not in a separate file

**Decision**: Declare the `tools` array as a constant inside `planner.ts`.

**Rationale**: The tool definitions are tightly coupled to the planner's prompt strategy. Keeping them co-located makes it obvious what the model can call. The definitions are static and unlikely to change independently of the planner logic.

**Alternative considered**: Extract to `src/tools-schema.ts`. Over-engineering for six static definitions.

### 3. Transport log emitted via `consola` to stdout, not to a file

**Decision**: Log each transport entry as a single structured `consola.debug` call (or `consola.info` if debug isn't surfaced by default).

**Rationale**: The project already uses `consola` for all agent output. Adding a file-write dependency (path config, rotation, permissions) is disproportionate for an observability feature at this scale. Structured stdout output is sufficient for debugging and can be piped/redirected by the caller.

**Alternative considered**: Write JSON lines to a log file only. Rejected — terminal visibility during dev is essential.

### 4. Dual transport output: pretty terminal + raw NDJSON wire log

**Decision**: Emit two outputs per LLM call:
1. **Terminal** — `plannerLog.debug(entry)` via the log4j-style consola reporter. Long string fields (`messages[n].content`, `arguments.content`) are abbreviated at 1024 chars as `"<first 512>...<last 512>"`. Always emitted.
2. **Wire log** — a raw NDJSON line appended to `logs/agent-wire.log`. Each line contains:
   - `timestamp`: ISO-8601
   - `type`: `"chat.completions"` (mirrors the API endpoint)
   - `request`: `{ headers, body }` — headers are all request headers minus the blocklist; body is the exact params passed to `create()`
   - `response`: `{ headers, body }` — headers are all response headers minus the blocklist; body is the full API response object (`id`, `created`, `model`, `usage`, `system_fingerprint`, `choices`)
   - No truncation. Always emitted alongside the terminal entry.

**`logs/` directory**: Already in `.gitignore`. Wire log path is `logs/agent-wire.log`, created on first write. No config knob needed.

**Abbreviation format**: Fields exceeding 1024 chars are shown as `${str.slice(0, 512)}...[${str.length} chars]...${str.slice(-512)}` — preserves beginning and end context.

**Header filtering**: A blocklist approach — strip `authorization` and `content-type` from both request and response headers, log everything else as-is. This captures rate-limit headers (`x-ratelimit-*`), tracing headers (`x-request-id`, `openai-processing-ms`), and any unexpected headers automatically, without maintaining an allowlist. `Authorization` is always stripped to prevent API key leakage into the log file.

### 4. Shared `src/logger.ts` module for all logging

**Decision**: Create `src/logger.ts` that configures a consola instance with a custom log4j-style reporter and exports it. All modules (`agent.ts`, `planner.ts`) import from this instead of using the global `consola` directly.

**Rationale**: A single format everywhere is simpler than mixing consola's default pretty output with a custom transport format. One reporter, one format, one place to change it. The logger module is also the natural home for `.withTag("planner")` / `.withTag("agent")` tagged sub-loggers.

**Format**: `<ISO timestamp> <LEVEL> <logger> - <message>`
Example: `2026-05-03T04:07:25.615Z DEBUG planner - {"model":"gpt-4o","toolCalled":"listFiles","latencyMs":843}`

**Reporter implementation**: An inline `{ log(logObj) {...} }` object — no class needed. `logObj.date` carries the timestamp, `logObj.type` is the level, `logObj.tag` is the logger name.

**Alternative considered**: Keep default consola format for agent output, custom format only for transport log. Rejected — two formats in one CLI is confusing and harder to grep/pipe.

### 5. `TransportLogEntry` type in `types.ts`

**Decision**: Add a `TransportLogEntry` type to `src/types.ts`.

**Rationale**: The type captures: `model`, `inputMessages` count, `toolsCount`, `toolCalled` (name from response), `argumentsLength`, `promptTokens`, `completionTokens`, `latencyMs`. Typing it makes the shape explicit and testable.

## Risks / Trade-offs

- **Model doesn't populate `tool_calls`**: With `tool_choice: "required"` this should be impossible for compliant OpenAI-compatible endpoints, but the code should throw a clear error if `tool_calls` is empty rather than silently failing. → Mitigation: add an explicit guard with a descriptive error message.
- **Non-OpenAI base URLs**: `params.config.baseURL` allows pointing to local models (e.g., Ollama). Some local endpoints don't fully implement the `tools` parameter. → Mitigation: document this in code; out of scope to add a fallback.
- **Token usage unavailable**: Some proxy endpoints omit `usage` from responses. → Mitigation: make token fields optional in `TransportLogEntry`; log `undefined` gracefully.

## Migration Plan

1. Add `TransportLogEntry` to `types.ts`
2. Update `planner.ts`: define tools array, update `chat.completions.create` call, parse from `tool_calls`, emit transport log, remove `stripCodeFence`
3. Update system prompt in `planner.ts` to remove the JSON-format instructions (they are now redundant; the tools parameter handles schema)
4. Run existing tests — no behavioral changes expected for callers
5. Manual smoke test: `bun run agent "list files"` and verify tool call is parsed correctly and transport log appears

No rollback complexity — the change is confined to `planner.ts` and `types.ts`.
