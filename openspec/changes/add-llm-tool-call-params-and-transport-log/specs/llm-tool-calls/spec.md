## ADDED Requirements

### Requirement: Planner uses OpenAI native tool calling
The planner SHALL define all agent tools (`listFiles`, `readFile`, `writeFile`, `shell`, `test`, `finish`) as OpenAI function tool schemas and pass them via the `tools` API parameter on every LLM call. The planner SHALL set `tool_choice: "required"` to guarantee the model returns a tool call each turn.

#### Scenario: Model returns a tool call
- **WHEN** the planner sends a request to the LLM with the `tools` array and `tool_choice: "required"`
- **THEN** the response contains `choices[0].message.tool_calls` with at least one entry, and the planner parses the agent step from `tool_calls[0].function.arguments`

#### Scenario: Tool call arguments are valid JSON
- **WHEN** the LLM returns a tool call response
- **THEN** `tool_calls[0].function.arguments` is a valid JSON string that parses into an `AgentStep`-compatible object without requiring fence stripping

#### Scenario: No tool calls returned
- **WHEN** the LLM response contains no `tool_calls` (non-compliant endpoint)
- **THEN** the planner SHALL throw an error with a descriptive message indicating that no tool call was returned

### Requirement: Tool schemas cover all AgentStep variants
The planner SHALL define a JSON Schema `parameters` block for each of the six tools that matches the corresponding `AgentStep` input shape.

#### Scenario: listFiles schema
- **WHEN** the `listFiles` tool schema is submitted
- **THEN** it declares a required `dir` string parameter

#### Scenario: readFile schema
- **WHEN** the `readFile` tool schema is submitted
- **THEN** it declares a required `path` string parameter

#### Scenario: writeFile schema
- **WHEN** the `writeFile` tool schema is submitted
- **THEN** it declares required `path` and `content` string parameters

#### Scenario: shell schema
- **WHEN** the `shell` tool schema is submitted
- **THEN** it declares a required `command` string parameter

#### Scenario: test schema
- **WHEN** the `test` tool schema is submitted
- **THEN** it declares an empty `parameters` object (no required fields)

#### Scenario: finish schema
- **WHEN** the `finish` tool schema is submitted
- **THEN** it declares a required `message` string parameter

### Requirement: System prompt does not duplicate tool schemas
The system prompt in `planner.ts` SHALL NOT contain JSON format instructions for tool calls, as the `tools` parameter makes them redundant.

#### Scenario: System prompt is simplified
- **WHEN** the planner is updated to use native tool calling
- **THEN** the system prompt contains agent behavior rules but no JSON output format examples
