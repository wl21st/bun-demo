## Why

The transport logging system writes full LLM request/response data to NDJSON wire logs, but the raw JSON is difficult to read during development and debugging. A dedicated pretty-print tool would let developers quickly inspect a specific exchange without needing external JSON formatters or writing one-off scripts.

## What Changes

- New `src/pretty-print.ts` CLI tool that reads a wire log file (NDJSON) and renders LLM requests and responses in a human-readable, color-coded format
- Accepts a log file path as a CLI argument; optionally filters by entry index or type (`request`/`response`)
- Formats request bodies showing model, messages (with roles), tools, and parameters
- Formats response bodies showing choices, tool calls (name + arguments), usage tokens, and finish reason
- Formats headers in a compact key: value table (with sensitive headers redacted, matching existing blocklist)

## Capabilities

### New Capabilities
- `llm-pretty-print`: CLI tool that reads NDJSON wire log files and renders LLM request/response entries in formatted, color-coded output

### Modified Capabilities

## Impact

- New file: `src/pretty-print.ts`
- Reads from `logs/*.ndjson` wire log files produced by the transport logger
- No changes to existing `src/planner.ts`, `src/logger.ts`, or runtime agent behavior
- Depends on existing `TransportLogEntry` type in `src/types.ts`
- No new external dependencies — uses Bun's built-in file I/O and existing consola logger
