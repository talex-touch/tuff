# Audit baseline research

## Selected baseline

- Repository: `talex-touch/tuff`
- Default branch: `master`
- Local HEAD at planning: `8e8af260f10b42a13e024f9f973ee78e2bf7491d`
- Fetched origin/master: `6b33964cd83720c82cd072150998b41411d057c8`
- Product-path diff: empty for `apps/core-app`, `apps/nexus`, `packages/utils`,
  `package.json`, and `pnpm-lock.yaml`
- Host: macOS 27.0 arm64
- Node: 24.18.0
- pnpm: 10.34.4
- CoreApp/Nexus planning date: 2026-07-28

The six remote-only commits archive documentation tasks and do not change the product
paths under audit. Re-fetch and repeat this comparison before publishing findings.

## Execution and publication update

- CoreBox runtime baseline: `38860855b9a59acfd9abdf18182fa3b0d6a64310`.
- Final fetched `origin/master`: `784377c499899529145c0dac7f1d0000329e0794`.
- CoreBox/transport owner files are unchanged between those commits.
- Nexus ran in a frozen detached worktree at the final default-branch commit.
- Approved and verified Issues: #477, #478, and #479.
- Existing #323/#324/#327/#329/#332 boundaries were reused without remote comments or edits.

## Access boundary

Authorized:

- Local synthetic CoreApp profile and fixture paths.
- Complete CoreApp runtime only after the user manually replaces the macOS system
  clipboard with non-sensitive synthetic text and explicitly confirms readiness.
  Automation does not inspect, back up, clear, restore, or persist clipboard content.
- Local Nexus modes with synthetic bindings/data.
- Deployed public read-only GET/HEAD probes without credentials against
  `https://tuff.tagzxia.com`.

Not authorized:

- Personal CoreApp profile/data.
- OAuth login or reusable browser storage state.
- Authenticated Dashboard/API calls.
- D1/R2/Cloudflare/production writes.
- Creating Issues before the final draft list is explicitly approved.

## Existing canonical Issues

| Issue | Existing acceptance boundary                                   |
| ----- | -------------------------------------------------------------- |
| #308  | Packaged Windows CoreBox Everything acceptance                 |
| #323  | Full CoreApp Vitest regression baseline                        |
| #324  | Deployed Nexus preview, OAuth, Dashboard, and bfcache evidence |
| #327  | Full Nexus Vitest regression baseline                          |
| #329  | Nexus Auth.js/NextAuth runtime vulnerabilities                 |
| #332  | Nexus Volar/Vue Router plugin resolution noise                 |
| #334  | Search provider lifecycle and executable registry              |
| #337  | Current-version CoreApp AI visible evidence                    |
| #340  | Search/cross-platform audit revalidation                       |
| #346  | Search query-cache measurement                                 |
| #348  | Revisioned semantic reorder of rendered results                |

## High-value planning leads, not confirmed defects

1. `apps/core-app/src/main/modules/box-tool/core-box/ipc.ts` registers many typed
   events twice against the same transport instance. Real `main-transport.ts` stores
   local and invoke handlers in Sets, while the current CoreBox unit mock stores only
   one handler in a Map. Confirm registration counts and observable double execution
   before classifying.
2. `apps/core-app/src/main/modules/box-tool/core-box/window.ts` sends
   `CoreBoxEvents.ui.shortcutTriggered` before and after showing the window. The
   renderer flag assignment is idempotent, so this is not publishable without proof
   of a user-visible or operational effect.
3. Nexus runtime evidence guards intentionally distinguish local Wrangler evidence
   from deployed evidence. The deployed collector must be invoked with explicit
   `--dry-run` after unsetting all `NEXUS_DEPLOYED_*` inputs; missing strict deployed
   evidence is owned by #324, not a new defect.

## Tooling notes

- Three initial background subagents completed without tool calls or output and were
  discarded as evidence.
- A foreground independent Plan review read the repository and confirmed the scope,
  command matrix, deduplication policy, and the CoreBox handler-registration lead.
- `trellis mem` is unavailable because the local mise shim has no installed Trellis
  runtime. Existing task artifacts, Git history, Issues, and current code are the
  authoritative history sources for this pass.
