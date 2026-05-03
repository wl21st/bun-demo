## Why

The agent currently uses a fragile text-based protocol where the LLM returns raw JSON in its message content to simulate tool calls. This breaks when the model wraps output in markdown fences, adds commentary, or drifts from the schema. Switching to the OpenAI API's native `tools` parameter enforces the schema at the API layer and eliminates manual JSON parsing. A transport log adds visibility into raw LLM request/response cycles, which is essential for debugging agent behavior.

## What Changes

- Replace the free-form JSON-in-content protocol in `planner.ts` with OpenAI native `tools` + `tool_calls` API parameters
- Define all agent tools (`listFiles`, `readFile`, `writeFile`, `shell`, `test`, `finish`) as OpenAI function tool schemas
- Parse the response from `tool_calls[0]` instead of `message.content`
- Add a transport log that records each LLM request and response (model, messages sent, tool_calls received, token usage, latency) to a structured log file or stdout stream
- Remove the now-unnecessary `stripCodeFence` helper

## Capabilities

### New Capabilities

- `llm-tool-calls`: Defines the agent's tools as OpenAI function schemas and uses the `tools` API parameter so the model returns structured `tool_calls` instead of free-form JSON content
- `llm-transport-log`: Captures each LLM request/response cycle with metadata (model, input messages, tool_calls output, token counts, latency ms) for debugging and observability

### Modified Capabilities

*(none — no existing spec-level requirements are changing)*

## Impact

- `src/planner.ts`: Core change — add `tools` array parameter, parse `tool_calls` instead of `message.content`, remove `stripCodeFence`
- `src/types.ts`: May need a `TransportLogEntry` type
- `src/agent.ts`: Optionally surfaces transport log entries via consola for per-step visibility
- No breaking changes to external API or CLI interface
