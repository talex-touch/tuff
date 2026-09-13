# Implementation: Folder projects and native CLI sessions

## Ordered implementation

1. Register the handwritten next migration/journal entry and mirror projects, conversation ownership, and local native-session pointers in Drizzle schema.
2. Implement canonical project and pointer stores through `scheduleDbWrite`; update the sensitive-data inventory.
3. Add/export typed Project transport/SDK, register guarded ProjectModule in startup order, and extend conversation DTOs/history/store with required nullable ownership.
4. Project conversation sync through a project-free snapshot and preserve local ownership on remote apply.
5. Replace renderer-native Local AI ids with opaque project/session refs, add list/forget/change events, split task/terminal resume capabilities, and extend OmniPanel opaque context.
6. Resolve canonical cwd in the main owner, add tuple leases, serialize protocol processing, and make every teardown release exactly once.
7. Implement Pi RPC/head/file append verification; implement OMP `session/resume`, Codex `thread/resume`, Claude SDK `resume`, and safe terminal resume composition.
8. Add the Project Pinia mirror, project/session sidebar projection and actions, Home ownership propagation, and resumable OmniPanel/New Task state.
9. Delegate permanent regression-test authoring to the Tester agent against the exact contracts/fake-provider hooks; integrate without parallel mid-flight validation.
10. Run focused suites, builds/typechecks/privacy/smoke, then isolated Electron/CDP and SQLite/privacy verification. Remove throwaway fixtures and finish Trellis records.

## Focused verification commands

```bash
pnpm -C packages/utils exec vitest run __tests__/transport-domain-sdks.test.ts
pnpm -C apps/core-app exec vitest run src/main/modules/database/project-native-sessions-schema.test.ts src/main/modules/conversation/conversation-store.transaction.test.ts src/main/modules/local-ai-cli/session-store.test.ts src/main/modules/local-ai-cli/native-session-lease.test.ts src/main/modules/local-ai-cli/index.test.ts
pnpm -C apps/core-app exec vitest run src/renderer/src/modules/conversation/conversation-project-groups.test.ts src/renderer/src/modules/conversation/useConversationHistory.test.ts src/renderer/src/components/shell/ShellConversationList.test.ts src/renderer/src/views/omni-panel/LocalAiCliPanel.session.test.ts src/main/modules/omni-panel/index.test.ts
pnpm -C packages/utils run build
pnpm -C apps/core-app run typecheck:node
pnpm -C apps/core-app run typecheck:web
pnpm privacy:inventory:verify
pnpm -C apps/core-app run smoke:local-ai-cli-runtime
```

## Regression contracts

- Full migration preserves legacy null ownership, canonicalizes symlink paths, enforces native triple uniqueness, and archives without cascade.
- Conversation mutation and sync preserve local project assignment and omit project/native metadata from wire snapshots.
- Task/terminal resume fails before spawn for mismatch, disabled pointer state, unsupported capability, or a second lease; teardown releases on every terminal path.
- Fake Pi RPC/session JSONL proves single-child expected-head update and same-parent sibling conflict without leaking raw native identity/path.
- Renderer grouping/order, directory-picker cancellation, pending project ownership, and LocalAiCliPanel stale-state clearing/continuation are observable.

## Isolated runtime acceptance

1. Create `/tmp/tuff-native-session-e2e/{profile,project,bin}` and a throwaway Pi RPC stub that implements version/state/entries/prompt, persists append-only JSONL, can pause, and can inject a sibling.
2. Launch the owned dev instance with the isolated profile, PATH stub, Local AI enabled, and CDP 9333. Enable Pi in Settings; use OS automation only for the native directory dialog.
3. At desktop and narrow widths create the project, save a project Home conversation, run once, close/reopen native session, run again, restart, and prove one native id/cwd/linear chain plus recoverable archive/Home access.
4. Hold a run and assert second task/terminal gets `NATIVE_SESSION_BUSY`; inject sibling and assert conflict state, active failure, and disabled later resume.
5. Run a throwaway SQLite/event/log verifier using first-line title `Project smoke title`, prompt-body/output canaries. Prove canonical root, bounded title, local-only native/head fields, no prompt/output/transcript path copy, no conversation-message task copy, and pointer-only Forget.

## Review and rollback gates

- Do not proceed from a layer until its focused contract/type check passes.
- Never regenerate Drizzle snapshots or add a second SQLite writer.
- Never replay history or drop safety flags as provider fallback.
- On runtime incompatibility, retain pointer and return `PROVIDER_RESUME_UNSUPPORTED`.
- Keep all throwaway provider/profile/verifier fixtures outside the repository and remove them after acceptance.

## Verification results (2026-09-13)

- Shared transport SDK: 46 focused tests passed. Main persistence/runtime: 71 focused tests passed. Renderer/OmniPanel/settings: 71 focused tests passed.
- `packages/utils` build, CoreApp Node/Web type checks, changed-file lint, privacy inventory verification, whitespace check, and Local AI PTY smoke passed.
- Isolated Electron used a throwaway Pi RPC provider. The selected folder canonicalized to `/private/tmp/tuff-native-session-e2e/project`; the same opaque pointer resumed one native id for three linear turns, including one turn after app restart.
- A resumed terminal held the tuple lease while a second task visibly failed with `NATIVE_SESSION_BUSY`; no second task process spawned. A same-parent sibling append visibly failed with `NATIVE_SESSION_CONFLICT`, persisted `state=conflict` without advancing the expected head, and disabled later continuation.
- A 640 px CDP viewport had no horizontal overflow. Archived project rows started collapsed, exposed only Unarchive, and restored without detaching their conversation.
- The throwaway SQLite/DTO/event/log verifier passed before and after Forget Pointer. The pointer title remained exactly `Project smoke title`; task prompt/output were absent from Tuff SQLite/logs and `conversation_messages`; DTO/events contained only approved opaque metadata; Forget removed the pointer while the provider transcript remained.
- Runtime acceptance exposed an unresolved `<SettingLocalAiCli>` custom element. Importing it in `SettingIntelligencePage.vue` restored the actual Settings controls; a focused component-resolution regression now guards the integration.
- The Electron process was stopped and `/tmp/tuff-native-session-e2e` was removed after verification.
