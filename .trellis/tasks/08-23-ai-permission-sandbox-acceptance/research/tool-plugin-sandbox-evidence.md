# Tool And Plugin Sandbox Evidence

## Scope

- Evidence date: 2026-08-25.
- Level: synthetic Provider, typed transport, process-local Pi runtime, and
  temporary SQLite databases.
- No production credential, user prompt/response, raw profile, native MCP
  process, real Provider request, or packaged Electron profile was used.

## R5: Tool And MCP Durability / Redaction

- Run metadata persists an explicit versioned allowlist. Raw request input is
  process-only; SQLite receives presence plus SHA-256 digest.
- Profile, allowed-tool, and automation authority are reconstructed from current
  definitions and must match persisted versions/digests before resume.
- Tool/call identity is stored as opaque namespace-separated references. Raw
  IDs, tool names, arguments, caller metadata, tool-derived paths/credentials,
  native errors, and stacks are absent from persisted tool metadata/events.
- Durable result load and durable start happen before tool execution. Load,
  mismatch, or prior-start failures block replay before the side effect.
- Tool output is sanitized before both worker/model delivery and persistence.
  Coverage includes Unix/Windows/file-URL paths, punctuation wrappers, JSON
  credential keys, repeated JSON encoding, throwing accessors, and bounded
  depth/parse/node/container budgets.
- Legacy raw call metadata migrates to opaque references. The metadata update
  and migration event are separate writes; durable metadata is authoritative,
  and event atomicity is not claimed.
- Existing run fields `objective`, `cwd`, and terminal `output` remain durable
  owner-visible user content. They are outside the raw `request.input` / tool
  payload guarantee. The current store has no typed per-run Privacy delete or
  automatic retention path; the inventory records this residual gap.

## R6: Channel Identity

- Raw PLUGIN requests always stay in the PLUGIN lane.
- Registered raw MAIN plugin senders stay in the PLUGIN lane; only a current,
  matching activation receives branded identity.
- An unregistered raw MAIN sender presenting a current plugin key receives the
  fixed `__unverified_plugin_caller__` scope, not a real plugin name or identity.
- Stale, mismatched, and destroyed registrations remain unverified plugin actors
  and never fall back to MAIN.
- Residual platform assumption: an unregistered raw MAIN sender with no current
  key remains MAIN. Plugin preload must not expose raw MAIN, and plugin
  WebContents must be registered before first load/IPC.

## R7: Plugin Intelligence And Typed Transport

- The explicit manifest contains all 14 Intelligence events reachable through
  the plugin facade's indirect domain SDK.
- Every plugin route requires runtime-branded identity, authoritative SDK API,
  and a fresh `intelligence.basic` decision. Unavailable, deny, revoke, forged
  identity, stale identity, and mismatch fail before Provider/dependency work.
- Provider/quota/admin/usage/environment and low-level Agent/workflow control
  surfaces remain excluded from the plugin facade.
- Synthetic typed transport covers permission, invoke/stream, Provider success,
  fallback, terminal failure, cancellation, audit, usage, and quota.
- Generic MessagePort errors retain `error.code = "stream_error"`; stable
  uppercase business codes travel independently in `payload.code` and reach a
  newly allocated consumer `Error`. Sync/rejected handlers, throwing accessors,
  send failures, and throwing callbacks still clean up terminal stream state.

## Stream Owner And Activation Teardown

- Server stream identity is `(host-owned owner key, stream id)`, not a global
  caller-supplied stream id. MAIN, unverified PLUGIN, and every authoritative
  plugin activation receive distinct owners for each concrete `WebContents`.
- Duplicate ids are rejected only within one live owner. Foreign sender objects,
  lanes, activations, and forged cancel metadata cannot cancel the target stream.
- Activation revoke/rotation, sender destruction, and handler unregister abort the
  exact owned signals and remove both forward and reverse indexes. Late callbacks
  are silent and cannot recreate state or publish data.
- Plugin MessagePorts bind the concrete sender object plus complete activation
  provenance. Invalidation physically closes only exact-key plugin ports and clears
  confirm timers, the global registry, and the sender index.
- Identity invalidation snapshots are frozen and listener failures are isolated.
  Registry mutations reject synchronous listener reentry so the replacement key
  returned by an outer rotation cannot be invalidated before the call returns.
- Independent final review found no P0, P1, or P2 issue after the reentry and stale
  port cleanup fixes.

## Verification

| Gate                               | Result                            |
| ---------------------------------- | --------------------------------- |
| Core AI focused suite              | 12 files, 235 tests passed        |
| Core AI governance / quota suite   | 8 files, 61 tests passed          |
| Typed transport integration        | 1 file, 5 tests passed            |
| Tool gateway suite                 | 8 files, 112 tests passed         |
| Plugin-host Intelligence suite     | 10 files, 161 tests passed        |
| Utils complete suite               | 188 files, 1402 passed, 1 skipped |
| Utils preview benchmark            | 22/22; 31.321 ms max under 40 ms  |
| Pi extension suite                 | 1 file, 18 tests passed           |
| CoreApp Node/Web typecheck         | passed                            |
| Utils ESM and DTS build            | passed                            |
| CoreApp / Utils / Pi scoped ESLint | passed with zero warnings         |
| Privacy inventory verifier         | 14 entries / 35 references passed |
| Main-process DB scheduler scan     | no forbidden match                |
| Task/spec secret canary scan       | no match                          |
| Workspace `git diff --check`       | passed                            |

The privacy verifier used structural TypeScript AST evidence. The scheduler
scan found no production `schedule(...withSqliteRetry...)` call site. The Utils
benchmark also passed inside the full package run (11.184 ms max); the earlier
48.697 ms failure was not reproducible without unrelated parallel load.

## Packaged Follow-Up And Remaining Blocker

- Real Ollama Provider text/stream, packaged permission and Tool confirmation
  UI, fixed failure paths, and secure-store save/relaunch/delete now pass on one
  physical package hash. See `research/packaged-ai-acceptance.md` for the
  hash-bound reports and limits.
- Real MCP opt-in smoke remains blocked because this environment has no explicit
  opt-in. Synthetic MCP and local Tool fixtures are not promoted as its
  replacement.
