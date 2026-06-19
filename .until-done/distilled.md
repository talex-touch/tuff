# Intelligence Boundary Convergence Distillation

## Problem
CoreApp and Nexus had multiple parallel implementations for intelligence capability normalization, prompt binding lookup, provider routing, direct invoke message construction, provider I/O, and Agent/Lab runtime orchestration. This made alias support, provider fallback, and runtime behavior difficult to verify consistently across products.

## Solution Shape
- Added a scope-specific intelligence automation surface in `mise.toml` and `.github/workflows/intelligence.yml`, with `mise run intelligence:verify` as the locked verification gate.
- Reused `@talex-touch/tuff-intelligence` resolver APIs in CoreApp `intelligence-config.ts` and `intelligence-sdk.ts` for runtime capability normalization and prompt resolution.
- Split Nexus direct-invoke capability message construction into `tuffIntelligenceCapabilityMessages.ts`, adding direct invoke support for `keywords.extract` and `intent.detect` while keeping unsupported image/audio/embedding shapes fail-closed.
- Extracted Nexus provider I/O behind `tuffIntelligenceProviderAdapters.ts` plus concrete LangChain adapters in `tuffIntelligenceLangChainProviderAdapters.ts`; `tuffIntelligenceLabService.ts` now resolves an adapter instead of constructing provider clients inline.
- Added `intelligenceAgentRuntimeBridge.ts` and an explicit `runtimePort` seam in `intelligenceAgentGraphRunner.ts` so shared-runtime-compatible AEP envelopes can flow into the existing Nexus Lab stream/session contract. Legacy LangGraph remains the default fallback.

## Key Learnings
- Bootstrap had to be added before RED: the repo did not previously have an intelligence-specific local/GitHub parity gate.
- CoreApp config resolver adoption was simpler than SDK adoption; splitting config GREEN and SDK RED/GREEN preserved TDD order.
- Nexus direct invoke can safely expand text-like abilities without pretending non-chat provider shapes are implemented.
- Provider adapter extraction is safest when orchestration keeps policy/audit/quota/fallback and the adapter owns concrete provider I/O.
- Runtime convergence can start with a bridge seam instead of a full Lab rewrite.

## Gotchas
- `tuffIntelligenceLangChainProviderAdapters.ts` is close to the 200 LOC guardrail; keep future provider-specific additions in separate adapter files.
- The CoreApp shared resolver contract test dynamically imports modules after mocks; keep that pattern to avoid Electron/bootstrap mock issues.
- Broad grep for `console.log`, `TODO`, or `eslint-disable` hits existing docs/generated files and `.until-done` plan text; use scoped touched-path checks for cleanup.
- Live GitHub Actions were not triggered; parity was verified locally by confirming the workflow runs `mise run intelligence:verify`.

## Useful Surfaces
- `mise run intelligence:dev`
- `mise run intelligence:changed`
- `mise run intelligence:release`
- `mise run intelligence:parity`
- `mise run intelligence:verify`
- `apps/core-app/src/main/modules/ai/intelligence-shared-resolver-contract.test.ts`
- `apps/nexus/server/utils/tuffIntelligenceAbilityAggregation.test.ts`
- `apps/nexus/server/utils/tuffIntelligenceProviderAdapters.test.ts`
- `apps/nexus/server/utils/__tests__/intelligence-agent-runtime-bridge.test.ts`

## Follow-Up Tasks
- Consider moving additional shared resolver and adapter concepts into `packages/tuff-intelligence` only after Nexus/CoreApp usage stabilizes.
- Add concrete non-chat adapters before enabling image/audio/embedding direct invoke success paths.
- Extend runtime bridge coverage beyond assistant delta/final when shared runtime starts emitting capability, approval, and error envelopes in production paths.
- If required for release evidence, explicitly ask before triggering the GitHub workflow and record the live Actions result.
