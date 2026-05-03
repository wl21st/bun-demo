## 1. Wire Log Parser

- [x] 1.1 Define local TypeScript type for the wire log line shape (`{ timestamp, type, request: { headers, body }, response: { headers, body } }`)
- [x] 1.2 Implement `parseWireLog(filePath: string)` that reads the file, splits on newlines, parses each line as JSON, skips blanks, warns and collects errors on malformed lines, and returns `{ entries, errors }`

## 2. ANSI Color Helpers

- [x] 2.1 Add a minimal color helper (no new dependency) using raw ANSI codes consistent with `src/logger.ts` — expose named functions: `bold`, `dim`, `cyan`, `green`, `yellow`, `magenta`, `gray`

## 3. Section Renderers

- [x] 3.1 Implement `renderHeaders(headers: Record<string, string>, blocklist: string[])` — renders each header as `key: value`, replacing blocklisted keys with `[REDACTED]`
- [x] 3.2 Implement `renderRequestSection(req: { headers, body })` — renders model, messages (role + content), tool definition names, and request headers
- [x] 3.3 Implement `renderResponseSection(res: { headers, body })` — renders finish reason, token usage, tool call (name + formatted arguments) or stop content, and response headers
- [x] 3.4 Implement `renderEntry(entry, index: number)` — renders a separator/header line with entry index and timestamp, then calls request and response section renderers

## 4. CLI Entry Point

- [x] 4.1 Parse `process.argv` to extract positional log file path and optional `--index <n>` and `--type <request|response>` flags
- [x] 4.2 Validate inputs: error if no file path provided, file does not exist, index is out of range, or type value is not `request`/`response`
- [x] 4.3 Wire up `parseWireLog` → filter by `--index` / `--type` → call `renderEntry` for each selected entry → exit with non-zero if any parse errors occurred

## 5. Tests

- [x] 5.1 Unit test `renderHeaders`: verify blocklisted headers show `[REDACTED]`, non-sensitive headers pass through, empty headers render as empty
- [x] 5.2 Unit test `renderRequestSection`: verify messages with roles appear, tool names appear without schema, `(none)` shown when tools absent
- [x] 5.3 Unit test `renderResponseSection`: verify tool_calls path shows name + args, stop path shows content, missing usage shows `(unavailable)`
- [x] 5.4 Integration test `parseWireLog`: verify malformed line emits warning and is skipped, valid lines are returned correctly
- [x] 5.5 CLI smoke test: run `bun run src/pretty-print.ts` against a fixture NDJSON file and assert stdout contains expected model name and tool call name
