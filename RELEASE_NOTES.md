# bun-ai-agent — Release Notes

---

## v0.3.0 (2026-05-03) — `86c6237`

### New Features

- **Wire log pretty-printer**: Inspect LLM traffic without leaving your terminal. Run `bun run src/pretty-print.ts logs/agent-wire.log` to render any wire log entry in color-coded, human-readable output — showing messages with role labels, tool call arguments, token usage, and response headers. Filter to a single entry with `--index <n>` or show only the request or response half with `--type request|response`.

- **Full NDJSON wire log**: Every LLM call is now recorded to `logs/agent-wire.log` as a complete, untruncated NDJSON entry. Each line captures the full request body (messages, tools, parameters), the complete API response (choices, usage, finish reason), and response headers — giving you a permanent audit trail of all agent LLM activity. Sensitive headers (e.g. `Authorization`) are automatically redacted.

### Improvements

- **Native LLM tool calling**: The agent now uses the OpenAI `tools` / `tool_calls` API directly instead of parsing JSON embedded in message content. This makes tool dispatch more reliable, eliminates brittle markdown-fence stripping, and works correctly with any OpenAI-compatible provider.

- **Structured terminal logging**: All agent output now uses a shared logger with consistent `log4j`-style formatting: `YYYY-MM-DDTHH:mm:ss.sssZ LEVEL tag - message`. Log levels are color-coded (cyan for INFO, dark gray for DEBUG, yellow for WARN, red for ERROR) and each LLM call emits a DEBUG summary showing model, latency, token usage, and which tool was called.

- **Clearer agent failure reporting**: The agent now reports exactly which step failed and why — instead of crashing with a raw stack trace — and exits with a non-zero code if it runs out of steps without finishing the task.

### Bug Fixes

- Fixed a bug where disk errors writing the wire log could abort the agent even when the LLM call itself succeeded. Wire log failures now produce a warning and the agent continues.
- Fixed an issue where the `logs/` directory could be created multiple times under concurrent calls due to a race condition in the initialization guard.
- Fixed `abbrev()` ignoring its `limit` parameter when truncating strings — it always used 512 characters regardless of the configured limit.
- Fixed error and fatal log messages being written to stdout instead of stderr.

### Breaking Changes

None. Existing `.env` configuration and `bun run agent "..."` invocation are unchanged.

---

## v0.2.0 (2026-05-02) — `0136c98`

### Improvements

- **Expanded test coverage**: The agent framework now has dedicated test coverage (`test/agent.test.ts`) covering the ReAct loop behavior. Math utility tests were expanded with additional edge cases — decimals, mixed signs, and nested describe blocks for better organization.

- **Improved code fence handling**: The planner's response parsing now correctly extracts content between fences using a proper capture group regex, fixing an edge case where nested or malformed fences could cause incorrect tool dispatch.

### Bug Fixes

- Fixed the `stripCodeFence` regex not correctly extracting content in all cases.
- Fixed missing trailing newlines in several source and test files.

---

## v0.1.0 (2026-05-02) — `4306acb`

### Improvements

- **Project structure cleanup**: Math utilities moved from `demo/math.ts` to `src/math.ts` and `test/math.test.ts`, following standard project layout conventions. Tests are now co-located with the rest of the test suite.

---

## v0.0.1 (2026-05-02) — `71e1ff8`

### New Features

- **Initial release**: `bun-ai-agent` — a ReAct-style AI agent built on Bun. Give it a task and it iteratively reasons and acts using an OpenAI-compatible LLM API.

- **Six built-in tools**: `listFiles`, `readFile`, `writeFile`, `shell`, `test`, and `finish` — covering the full range of local coding tasks.

- **Configurable via environment**: Set your LLM provider, model, API key, and max steps through `.env`. Works with any OpenAI-compatible API endpoint out of the box.
