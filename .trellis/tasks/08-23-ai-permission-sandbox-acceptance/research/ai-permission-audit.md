# AI Permission And Sandbox Audit

## Baseline

- Date: 2026-08-24 (America/Los_Angeles)
- Mode: read-only source inspection and focused local tests
- Result: 17 test files, 237 tests passed; end-to-end task remains partial

## Findings

### P1: Streaming Requests Do Not Reach The Audit Ledger

- Non-stream invoke writes success/fallback/failure audit at
  `apps/core-app/src/main/modules/ai/intelligence-sdk.ts:749`, `:792`, and `:820`.
- Stream implementation spans `intelligence-sdk.ts:842-1069` and contains no
  success or failure audit commit.
- Home conversation uses stream at
  `apps/core-app/src/renderer/src/modules/conversation/useHomeConversation.ts:535`;
  its non-stream fallback only handles failure before first content.
- Audit flush writes rows and usage stats in one transaction at
  `apps/core-app/src/main/modules/ai/intelligence-audit-logger.ts:448-504`.

Impact: normal streamed requests are absent from request/token/cost totals and
long-period quota decisions.

### Tool Audit And Redaction Gap

- Loopback bearer and per-call confirmation exist at
  `apps/core-app/src/main/modules/ai/tool-gateway/gateway-server.ts:68-138`.
- Review/full mode, timeout deny and host-only decisions exist at
  `apps/core-app/src/main/modules/ai/tool-gateway/index.ts:43-44`, `:147-183`,
  and `:205-239`.
- Raw exception text can cross logging/model boundaries at
  `gateway-server.ts:139-141` and
  `apps/core-app/src/main/modules/ai/tools/tool-registry.ts:543-545`,
  `:590-595`, and `:673-675`.

### Plugin Intelligence Boundary Drift

- Official plugin capability execution uses authoritative permission/revoke
  checks in
  `apps/core-app/src/main/modules/plugin/host/plugin-host-capabilities.ts:595-631`
  and activation identity at `:729-765`.
- Renderer plugin Intelligence creates a domain client indirectly at
  `packages/utils/plugin/sdk/intelligence.ts:202-205` and exposes its facade at
  `:217-255`.
- Plugin-facing allowlist tests inspect direct event references only at
  `packages/utils/__tests__/plugin-facing-events.test.ts:75-110`; this does not
  prove the indirect domain SDK events are reachable.
- Generic Intelligence registrars at
  `apps/core-app/src/main/modules/ai/intelligence-module.ts:1212-1236` do not
  opt into plugin fail-closed behavior. The current allowlist prevents a proven
  exploit, but the public facade and runtime route disagree.

### Existing Safe Baselines

- Provider credential secure-store, sanitized projection, serialization and
  rollback: `provider-credential-service.ts:164-193`, `:268-287`, `:507-570`.
- Plugin Intelligence permission binding:
  `plugin-intelligence-capabilities.ts:810-843`.
- Quota reads audit/usage facts in
  `intelligence-quota-manager.ts:201-269` and evaluates decisions from `:274`.
- Existing Nexus smoke mocks auth/network/response at
  `nexus-invoke-smoke.test.ts:19-35` and `:166-178`; it is controlled evidence,
  not a real Provider call.

## Evidence Boundary

- No production key, user prompt/response, raw log, real profile or remote
  mutation was used or retained.
- Static contracts and synthetic tests do not close the real Provider or
  packaged Electron acceptance gates.
