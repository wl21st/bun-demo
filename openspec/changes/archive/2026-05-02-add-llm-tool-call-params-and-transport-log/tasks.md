## 1. Logger Module

- [x] 1.1 Create `src/logger.ts` with a custom consola reporter that outputs `<ISO timestamp> <LEVEL> <tag> - <message>` lines to stdout
- [x] 1.2 Export a `createLogger(tag: string)` function (or pre-built tagged instances) from `src/logger.ts`
- [x] 1.3 Replace `import { consola } from "consola"` in `src/agent.ts` with the tagged `agent` logger from `src/logger.ts`
- [x] 1.4 Import the tagged `planner` logger in `src/planner.ts` from `src/logger.ts`

## 2. Types

- [x] 1.1 Add `TransportLogEntry` type to `src/types.ts` with fields: `model`, `inputMessagesCount`, `toolsCount`, `toolCalled`, `argumentsLength`, `promptTokens?`, `completionTokens?`, `latencyMs`

## 2. Tool Schemas

- [x] 2.1 Define `AGENT_TOOLS` constant in `src/planner.ts` as an `OpenAI.Chat.Completions.ChatCompletionTool[]` array covering all six tools (`listFiles`, `readFile`, `writeFile`, `shell`, `test`, `finish`) with JSON Schema `parameters` blocks matching each `AgentStep` input shape
- [x] 2.2 Verify each tool schema's required fields match the corresponding `AgentStep` union member

## 3. Planner Refactor

- [x] 3.1 Add `tools: AGENT_TOOLS` and `tool_choice: "required"` to the `client.chat.completions.create` call in `planNextStep`
- [x] 3.2 Wrap the `create` call with `Date.now()` timestamps to measure `latencyMs`
- [x] 3.3 Replace the `message.content` parse path with extraction from `response.choices[0].message.tool_calls[0]`
- [x] 3.4 Add a guard: if `tool_calls` is empty or undefined, throw `new Error("LLM returned no tool call")` with the raw response stringified
- [x] 3.5 Parse `JSON.parse(tool_calls[0].function.arguments)` to produce the `AgentStep` result
- [x] 3.6 Remove the `stripCodeFence` function and its call site

## 4. System Prompt

- [x] 4.1 Simplify the system prompt in `src/planner.ts`: remove the six JSON format examples and the "You may only return one of the following JSON objects" section, keeping only the agent goals and hard rules

## 5. Transport Log

- [x] 5.1 Add an `abbrev(str, limit = 1024)` helper in `src/logger.ts` that returns `"${str.slice(0, 512)}...[${str.length} chars]...${str.slice(-512)}"` when `str.length > limit`, otherwise `str`
- [x] 5.2 After each successful LLM call, construct a `TransportLogEntry` from the response and timestamps, applying `abbrev` to `messages[n].content` and `arguments.content`
- [x] 5.3 Emit the entry via `plannerLog.debug(entry)` using the tagged planner logger from `src/logger.ts`
- [x] 5.4 Add a `filterHeaders(headers)` helper that strips `authorization` and `content-type` keys, returning everything else
- [x] 5.5 Use the OpenAI SDK's `.withResponse()` to capture raw request and response headers alongside the API call
- [x] 5.6 After each LLM call, append a raw NDJSON line to `logs/agent-wire.log` with shape `{ timestamp, type: "chat.completions", request: { headers, body }, response: { headers, body } }` — no truncation
- [x] 5.7 Ensure `logs/` directory is created if it does not exist before the first write

## 6. Verification

- [x] 6.1 Run `bun test` and confirm all existing tests pass
- [x] 6.2 Smoke test: run `bun run agent "list files in the project"` and verify the tool call is parsed correctly and the transport log entry appears
- [x] 6.3 Confirm `stripCodeFence` no longer exists in the codebase
