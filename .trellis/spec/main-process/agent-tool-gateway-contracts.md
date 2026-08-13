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
