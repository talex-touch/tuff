# Agent Tool Gateway Contracts

How model-callable tools reach the `pi` agent process, and what every new tool
must satisfy. Established by tasks 08-05-home-tool-loop (B) and
08-05-skills-mcp-config (C); commits 4594c3200 / 787e2c554.

## 1. Scope / Trigger

Any change that adds a model-callable tool, alters confirmation semantics, or
bridges a main-process capability (search, MCP, skills, plugins) to the home
conversation.

## 2. Topology (fixed)

```
pi (agent process)                     app main process
  packages/pi-extension-tuff  ──HTTP──▶ tool-gateway (loopback 127.0.0.1 + bearer)
    static TOOLS[]                        gateway-server: confirm gate → registry
    execute(toolCallId, params)           tool-registry: ToolDefinition map
                                          capabilities (coreBox search, MCP registry, store)
```

- Capability code runs **only** in main. The agent process holds a forwarder,
  never the capability. Absent `TUFF_TOOL_GATEWAY_URL/TOKEN` env, the extension
  registers nothing.
- pi executor signature is `(toolCallId, params)` — **id first**. Pinned by
  `packages/pi-extension-tuff/index.test.ts`; assuming `(args)` silently hands
  the call id to the tool as its arguments.

## 3. Signatures

```ts
// tool-registry.ts
interface ToolDefinition {
  name: string
  risk: 'read' | 'write' | 'execute'
  summarize: (args) => string
  classify?: (args) => Promise<ToolCallPlan>   // per-call override for proxies
  execute: (args) => Promise<ToolResult>       // ToolResult = { output, isError }
}
interface ToolCallPlan { risk: ToolRisk; summary: string; rememberKey: string }
```

## 4. Contracts

- **Confirmation gate**: every call reaches the gate. `read` decisions may be
  remembered for the session under `plan.rememberKey`; `write`/`execute`
  re-ask every time regardless of the checkbox.
- **Permission mode widens the gate, never bypasses it** (task
  08-06-composer-permission-selector): `AgentToolEvents.setEnabled` carries
  `{ enabled, mode?: 'review' | 'full' }`. Under `full` the module's confirm
  callback auto-approves at entry — audit log line, `remember: false`, no
  renderer broadcast. Omitted or unknown mode reads as `review` (a stale
  sender must not inherit the wider grant). Mode is read per call: requests
  already pending are never settled retroactively by a switch. Only the host
  may drive `setEnabled` (`assertHostOwned`), so a plugin can never widen the
  gate.
- **Proxy tools narrow their remember scope**: `tuff_mcp_call` keys remembering
  by `tuff_mcp_call:<server>/<tool>` via `classify`, so a remembered yes for one
  read-only tool never waves through a different one. A proxy that cannot reach
  its backend to classify must fall back to `execute` risk ("a server that
  cannot be reached cannot vouch for its tool").
- **MCP risk mapping** (`mcpRiskToToolRisk`): only server-declared
  `readOnlyHint` (`low`) earns `read`; medium/high/critical → `execute`;
  `critical` (destructiveHint) prefixes the confirm summary with `⚠ `.
- **Model-facing text is truncated** at 64 KiB (`truncateForModel`) with an
  explicit truncation notice.
- **Partial backend failure degrades, never aborts the batch**:
  `tuff_mcp_list_tools` lists an unreachable server as `unavailable: <reason>`
  and keeps the rest of the catalogue; zero enabled servers returns a friendly
  prompt, `isError: false`.
- **Skill reads accept only an id**: `tuff_skill_read` resolves an imported skill
  through the item's `contentRef`; caller-supplied paths are rejected. Home has
  no workspace, so the orchestrator's workspace-escape clause is replaced by
  this stricter invariant — availability is "the user activated the item".
- **A `local:` id reads a linked file instead** (`skill-local-sources`): the id
  is `local:<12 hex of sha1(realpath)>`, so it resolves only against directories
  the user registered, and the manifest is re-`realpath`ed to prove it stays
  inside the entry — a symlinked entry is followed once and its target becomes
  the boundary. Still id-only: no path the model invents is addressable, and a
  switched-off skill is unreadable, not merely unlisted. Nothing is copied into
  the content store, so an edit on disk lands on the next read.

## 5. Home injection contract

- `buildHomeInjection` lists imported skills and enabled linked local skills in
  one `Available skills` catalogue — the model sees one list and one tool, and
  `local:` ids simply route elsewhere on read.
- `applyHomeConversationInjection(payload, options, isPluginCaller)` prepends
  one system message (active skills metadata + rules) when and only when
  `options.metadata.surface === INTELLIGENCE_HOME_SURFACE` **and**
  `metadata.autoContext === true` **and** the caller is not a plugin.
  The surface marker is host-set; honouring a forged one would leak the user's
  skill inventory to plugins.
- Applied on **both** the invoke and stream paths in `intelligence-module` —
  the home conversation falls back to plain invoke when the stream fails to
  start, and a fallback turn must not silently lose the user's skills.
- Injection is re-read per turn (no cache): enabling a skill takes effect on
  the next send.

## 6. Validation & Error Matrix

| Condition | Behaviour |
|---|---|
| Missing/invalid bearer token | 401, timing-safe compare |
| Unknown tool name | error result, no confirm prompt |
| User denies confirmation | `isError` text result to the model (not a transport error) |
| MCP server unreachable in `classify` | fallback plan: `execute` risk, re-ask |
| Skill id not active / no contentRef | `isError` message |
| `local:` id outside the registry, switched off, or escaping its directory | `isError` message; the file is never opened |
| Result over 64 KiB | truncated with notice |

## 7. Tests Required

- Contract test pinning the pi executor arg order (`pi-extension-tuff`).
- Permission-mode suite (`tool-gateway/index.test.ts`): full auto-approves
  without broadcast and logs the `⚠ ` marker; back-to-review resumes asking;
  a pending request survives a mode switch unanswered; omitted mode = review;
  a plugin cannot widen the gate.
- Risk-mapping table test (`tool-registry.mcp.test.ts`).
- One-server-down-doesn't-hide-the-rest test for list.
- contentRef-only rejection test for skill read.
- Local-directory scan tests against real directories and real symlinks
  (`skill-local-sources.test.ts`): a stubbed fs would only test the stub.
- Live-transport smoke: `TUFF_MCP_SMOKE=1 npx vitest run
  src/main/modules/ai/intelligence-mcp-registry.smoke.test.ts` (real npx
  server; opt-in because it spawns processes and may touch the network).

## 8. Wrong vs Correct

### Wrong

```ts
// Registering an MCP tool per server tool name — the pi allowlist now churns
// with settings changes, and remembering approvals is per-invented-name.
for (const tool of await listAll()) registry.set(`mcp_${tool.name}`, ...)
```

### Correct

```ts
// Two static names; discovery is a call the model makes (deferred tools).
registry.set('tuff_mcp_list_tools', ...)
registry.set('tuff_mcp_call', { classify: perCallPlan, ... })
```

## Scenario: Tuff As An MCP Server For Other Agents

Established by the local-MCP-host change (`apps/core-app/src/main/modules/mcp-host`,
PR #1938). Same gate, opposite direction: §2's topology is a local agent calling
*in* through the pi extension; this is an external agent calling *in* over the
MCP wire format.

### 1. Scope / Trigger

Any change to what Tuff publishes to external MCP clients, to how such a call
reaches the confirmation gate, or to the settings surface that turns the listener
on. `mcp-servers` (Tuff as a client) is the neighbouring domain and is *not* this.

### 2. Contracts

- **One gate, not two.** `toolGatewayModule.requestConfirmation` is the only way
  in, and it reaches the same pending map, the same broadcast and the same
  standing `full` grant. A second prompt would be indistinguishable from a call
  that skipped the first.
- **Mounting is not visibility.** The card is drawn by `useAgentTools`, which
  lives in the home conversation and survives route changes. Callers from outside
  the app must fail closed when it cannot be answered:
  `AgentToolEvents.setConfirmationSurface` is reported by the renderer per route
  (`HomePage.vue` watches `route.path === '/home'`) and retracted on scope
  dispose; `requestConfirmation` refuses with
  `ToolConfirmationUnavailableError` while the surface is down, and a refusal is
  never reported to the model as "the user said no".
- **Remembered approvals are narrower here, never wider.** The card's "remember"
  is honoured keyed by tool + sha256 of the arguments (`stableStringify`, so key
  order cannot split one call into two), and only for `read`. The gateway keys
  `tuff_read_file` by resolved path; a caller that resolves nothing must not fall
  back to a blanket per-tool key.
- **The catalogue is hand-written, not derived.** A spec with no registry entry
  and no host implementation is dropped rather than advertised. UI-only tools
  (chart / form / widget) and the MCP-client proxies are absent by construction:
  an external client has no Tuff surface to draw into and brings its own servers.
- **Off means off.** Nothing binds until the user enables it; `write`/`execute`
  tools start disabled; the token is minted on first enable; the listener binds
  loopback only and compares the token in constant time.
- **Settings are read after storage is ready.** `onInit` runs while storage is
  still `pending` — reading there throws, falls back to defaults, and the next
  write persists those defaults over the user's file. Use
  `waitForMainStorageReady()` + `saveMainConfigDurable`.
- **The port is the user's.** A stable, persisted default; a port that cannot be
  bound is reported in state rather than silently swapped for an ephemeral one,
  which would break a client config pasted elsewhere.
- **The credential is masked wherever it is rendered**, snippet included, and the
  reveal is a gesture for one token: rotating re-arms the mask.

### 3. Validation & Error Matrix

| Condition | Behaviour |
|---|---|
| Missing/wrong bearer token | 401, no detail |
| Neighbouring path, wrong method | 404 / 405 (`-32000`, not `-32600` — not the client's malformed request) |
| Body over 256 KiB | 413, and the declared length is checked *before* the body is consumed: destroying the socket first races the reply away |
| Endpoint with query parameters | served (`pathname` match, not `request.url`) |
| Notification (no `id`) | 202, empty body — never a JSON reply |
| Unknown tool name | `-32602` |
| Tool ran and failed / user denied / user could not be asked | `isError: true` content result, never a transport error |
| Host itself throws inside the tool layer | `-32603`, never a successful empty answer |
| Tool switched off after start | absent from `tools/list` on the next call; refused if called anyway |
| Settings file malformed | per-field fallback; a token that is not 64 hex (either case) is dropped and re-minted |

### 4. Tests Required

- Real listener + real socket for the HTTP layer (`mcp-host-server.test.ts`):
  auth, path, method, body cap (both honest and chunked uploads), and a follow-up
  request on a keep-alive socket — the hang-up after a refused upload is
  load-bearing and invisible to `fetch`.
- Protocol suite (`mcp-host-protocol.test.ts`) covering the matrix above.
- Settings normalizer (`mcp-host-settings.test.ts`), including the uppercase-hex
  case and the port boundaries.
- Renderer section (`SettingSkillsMcp.host.test.ts`): masked token page-wide
  (row *and* pasted-config block), copy path still handing over the real
  document, rotation re-arming the mask, and the failure reason for a listener
  that is on but not bound.

### 5. Wrong vs Correct

#### Wrong

```ts
// A second prompt for external callers, or a remembered set keyed by tool name:
// an approval the user gave for one read now covers every later read.
if (this.remembered.has(name)) return await tool.execute(args)
```

#### Correct

```ts
const rememberKey = `${name}:${sha256(stableStringify(args))}`
if (tool.risk === 'read' && this.remembered.has(rememberKey)) return await this.runTool(name, tool, args)
const decision = await toolGatewayModule.requestConfirmation({ tool: name, risk: tool.risk, summary: tool.summarize(args), input: JSON.stringify(args, null, 2) }, signal)
```

## Scenario: Durable Pi Tool Result Replay Without Raw Inputs

### 1. Scope / Trigger

- Trigger: a Pi-backed orchestrator run can pause for approval, resume in the
  same process, recover after restart, or observe a tool call whose side effect
  may already have happened.
- This contract covers run metadata, authority reconstruction, tool-call
  replay, model-facing output, and durable audit projections. It does not make
  arbitrary interactive input restart-durable.

### 2. Signatures

```ts
loadToolCallResult(
  runId: string,
  toolCallId: string,
  toolId: string,
): Promise<PiRuntimeToolCallOutcome | undefined>

beginToolCall(
  runId: string,
  toolCallId: string,
  toolId: string,
  input: unknown,
): Promise<'execute' | 'interrupted'>

persistToolCallResult(
  runId: string,
  toolCallId: string,
  result: PiRuntimeToolCallOutcome,
): Promise<void>
```

Persisted run metadata is an allowlisted versioned projection. It contains
`schemaVersion`, execution budgets, `allowedToolRefs`, input
presence/digest, profile and automation authority versions/digests, bounded
approval state, and opaque `toolCallStates` / `completedToolCallResults`.

### 3. Contracts

- Raw request input stays in `volatileRunInputs`. SQLite receives only
  `requestInputPresent` and a SHA-256 `requestInputDigest`. A non-automation
  run that loses volatile input after restart settles with
  `AI_RUN_INPUT_UNAVAILABLE`; it never resumes with invented or persisted raw
  input.
- Reconstruct allowed tools and automation policy from the current enabled
  profile/definition, then require the persisted version and digest to match.
  Any drift settles with `AI_RUN_AUTHORITY_CHANGED` before runtime execution.
- Persist tool and call identity only as namespace-separated opaque SHA-256
  references. Raw tool names, raw call IDs, caller metadata, tool inputs,
  tool-derived paths/credentials, native errors, and stacks are not durable
  metadata or event payloads.
- `objective`, `cwd`, and terminal `output` remain separate, owner-visible
  durable run fields. They are user-content state, not proof that raw
  `request.input` or tool payloads may be copied into metadata; inventory and
  retention claims must distinguish the two.
- Load durable call state before permission lookup or tool execution. A load
  failure, mismatched tool reference, or prior `started` state blocks replay;
  it must not reach the tool side effect.
- Commit `started` before executing the tool. Persist a sanitized terminal
  outcome before returning it to the worker/model. If terminal persistence
  fails, return only the stable `TOOL_EXECUTION_FAILED` projection.
- Sanitize tool output at both the worker/model and persistence boundaries.
  Credential/path keys and values, including nested or repeatedly JSON-encoded
  strings, become `[redacted]`; container/depth/parse budgets fail closed.
- Legacy raw tool-call keys may be rewritten to opaque references on read. The
  metadata row is authoritative; the following migration event is telemetry,
  not a transactional source of truth.

### 4. Validation & Error Matrix

| Condition                                                     | Required result                                             |
| ------------------------------------------------------------- | ----------------------------------------------------------- |
| Interactive raw input missing after restart                   | `AI_RUN_INPUT_UNAVAILABLE`; no runtime/tool execution       |
| Profile, allowed tools, automation version, or digest changed | `AI_RUN_AUTHORITY_CHANGED`; no runtime/tool execution       |
| Durable result load throws                                    | Fail closed before permission lookup and tool side effect   |
| Durable state is `started`                                    | `AI_RUN_INTERRUPTED`; do not replay the tool                |
| Stored call points at another tool reference                  | Stable replay rejection; do not execute either tool         |
| Tool result persistence fails after execution                 | Stable error to worker/model; no raw output or native error |
| Credential/path canary is nested or JSON-encoded              | `[redacted]` before model and SQLite                        |
| JSON inspection exceeds a configured budget                   | Fail closed as sensitive                                    |

### 5. Good / Base / Bad Cases

- Good: a tool result is saved under opaque call/tool references; retry loads
  the sanitized result and never repeats the side effect.
- Base: a run without input stores `requestInputPresent: false` and no digest.
- Bad: persist `request.input`, `allowedToolIds`, `toolCallId`, tool name, raw
  output, or an exception message so approval can survive a restart.

### 6. Tests Required

- Run metadata tests assert the exact allowlist, input digest-only storage,
  profile/automation drift rejection, same-process approval resume, and
  restart input-unavailable behavior.
- Tool replay tests assert load-before-execute ordering, durable-start failure,
  started/completed replay, mismatched identity, legacy opaque migration, and
  persistence-failure containment.
- Output tests cover credential and Unix/Windows/file-URL paths, punctuation
  wrappers, JSON credential keys, multi-encoded JSON, throwing accessors, and
  every inspection budget boundary.
- Serialized run rows and events must reject secret/path/raw-id canaries. The
  focused suite, Node typecheck, scoped ESLint, privacy inventory verifier, and
  `git diff --check` must pass.

### 7. Wrong vs Correct

#### Wrong

```ts
run.metadata.requestInput = request.input
run.metadata.completedToolCallResults[toolCallId] = result
await executeTool(toolId, request.input)
```

#### Correct

```ts
run.metadata.requestInputDigest = digestStructuredValue(request.input)
const prior = await loadToolCallResult(run.id, toolCallId, toolId)
if (prior) return prior
if ((await beginToolCall(run.id, toolCallId, toolId, request.input)) !== 'execute') {
  throw createInterruptedToolCallError(toolCallId)
}
const result = sanitizeToolOutputForRuntime(await executeTool(toolId, request.input))
await persistToolCallResult(run.id, toolCallId, result)
```
