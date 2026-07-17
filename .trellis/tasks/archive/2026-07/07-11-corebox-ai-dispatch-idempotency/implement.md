# CoreBox AI Dispatch Idempotency Implementation

## Order

1. Merge pushed widget state over the canonical activation feature while preserving interaction and accepted-input metadata.
2. Preserve active activation when a widget host action returns no activation transition.
3. Verify send-mode suppression after pushed widget updates and host actions.
4. Rebuild CoreApp/plugin and run an isolated packaged request-count scenario.

## Focused Validation

```bash
pnpm exec vitest run apps/core-app/src/renderer/src/modules/box/adapter/hooks/useSearch.core.test.ts
pnpm exec vitest run apps/core-app/src/main/modules/plugin/adapters/plugin-features-adapter.test.ts packages/test/src/plugins/intelligence.test.ts
pnpm --filter @talex-touch/core-app run typecheck:web
```

## Packaged Evidence

- Start from an isolated profile with one controlled local provider.
- Activate AI Ask once and wait for ready state.
- Record request count without prompt/response bodies.
- Select a context mode, edit the draft, and prove request count is unchanged.
- Explicitly send once and prove request count increases by exactly one.
- Verify the provider payload contains one final current user message and the widget remains in send mode.

## Review Gates

- Do not suppress all active-feature input forwarding globally.
- Do not treat a missing action response as an explicit provider exit.
- Do not add timing-only debounces as the correctness mechanism.
- Do not log model input/output while collecting request-count evidence.

## 2026-07-12 Completion Evidence

- Current focused regression run: 4 files / 70 tests passed across CoreBox activation, plugin adapter, custom widget interaction, and official AI plugin behavior.
- Packaged macOS arm64 Electron kept `stateless` selected while editing the draft and returned one controlled response after one explicit Send.
- The controlled Provider retained exactly one metadata-only capture: `/api/chat`, 2 messages, roles `system`, `user`; no prompt or response content was stored.
- The mounted widget remained in send mode and displayed `stateless / retrieval`, 1 context item, and 9 / 1200 context tokens.
