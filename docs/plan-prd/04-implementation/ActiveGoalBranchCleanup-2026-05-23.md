# Active Goal Branch Cleanup Snapshot

> Snapshot date: 2026-05-23
> Scope: current Nexus Data Governance objective, dirty worktree cleanup, and screenshot-identified branch cleanup.

## Current Goal Progress

Current goal remains **in progress**. The Nexus Data Governance implementation has broad local/API/UI coverage across the eight requested areas, but completion is not proven until live evidence is attached. The canonical progress matrix is `../01-project/NEXUS-DATA-GOVERNANCE-PROGRESS-2026-05-23.md`.

High-level state:

| Area | Current state |
| --- | --- |
| Data collection granularity | App/search/plugin/user-preference aggregates exist, including search journey/context/time/plugin preference buckets. Still needs real browser evidence and production sample validation. |
| Plugin owner analytics | Download/install/invocation/review/rating trend analytics exist in owner-facing surfaces. Still needs click-through browser evidence and owner-scope privacy review. |
| Upload reliability | Retry metadata, recovered retries, failure matrix, stable reason buckets, and problem attempt hashes exist. Still needs live failed upload calibration and object storage evidence. |
| Intelligence/adapt/assets | Scene/adapt config merge and asset-backed upload paths exist. Still needs real adapter execution and old provider-table retirement evidence. |
| Storage management | Policy configs, local/R2/S3/OSS-style channels, limits, alert queue, dry-run/write smoke, per-channel pressure, and selected-channel analytics exist. Still needs live local/S3/OSS smoke artifacts and production D1 migration/backfill. |
| Notification management | Browser, email provider templates, SMTP/HTTP relay, Feishu/Lark/webhook, and Web Push relay profiles exist. Still needs real credential/live-send evidence. |
| Reports/dashboard | Operations summary covers growth/search/install/upload/storage/notification/provider/token/model signals. Still needs large-screen/browser visual evidence and longer production samples. |
| Provider token/quota limits | Provider quota evaluation and dispatch-time fail-closed gates exist. Still needs real provider-call evidence with controlled low quota policies. |

## Dirty Worktree Snapshot

Observed branch:

- `codex/nexus-upload-object-retry`
- Tracks `origin/codex/nexus-upload-object-retry`
- Relative to `master`: `33` behind, `10` ahead at the time of this snapshot.
- Current worktree has many uncommitted Nexus/Data Governance files plus untracked tests/assets/docs. This must be handled before switching branches or merging.

Tracked/untracked themes currently present:

| Theme | Examples | Cleanup requirement |
| --- | --- | --- |
| Nexus Data Governance / storage / notification / provider quota | `apps/nexus/server/utils/platformGovernanceStore.ts`, storage channel APIs/tests, notification APIs/tests, provider quota APIs/tests | Review, test, and commit or stash as a related slice before branch switching. |
| Plugin private analytics | `PluginDetailDrawer.vue`, `pluginReviewStore.ts`, related tests/i18n/types | Keep with the Data Governance slice unless split into a separate analytics commit. |
| Upload/object storage reliability | `storageObjectStore.ts`, `syncStoreV1.ts`, release/sync upload APIs/tests, `updateAssetStorage.ts` | Keep with upload reliability slice or split before merge. |
| Public/docs UI polish | `GrainGradientHeroSection.vue`, `updates.vue`, `TuffexDocsHeroBackground.vue`, `layouts/docs.vue` | Confirm whether to keep in current merge batch or split from governance work. |
| Documentation status | `docs/INDEX.md`, `docs/plan-prd/README.md`, `TODO.md`, `CHANGES.md`, quality baseline, progress snapshot | Keep as the branch record and current progress evidence. |
| Local artifact candidate | `nexus-admin-bootstrap-blocker.png` | Needs explicit decision: keep as evidence, move under docs evidence, or delete. |

## Worktree Constraints

- `master` is currently checked out in `/private/tmp/talex-touch-quick-actions-payload-b12c7a4d8`, so the main checkout cannot safely switch to `master` until that worktree is removed, detached, or used as the integration worktree.
- Several cleanup-target branches are checked out in other worktrees and cannot be deleted until those worktrees are removed or moved:
  - `codex/plugin-prelude-engineering-refresh`
  - `codex/search-competitive-analysis-roadmap`
  - `fix/pr-268-linear`
- Other temporary worktrees exist under `/private/tmp/talex-touch-*`; cleanup should avoid deleting them before confirming they are no longer needed.

## Screenshot Branch Inventory

### Already merged into `master`

These local branches show `ahead_master = 0`; they are cleanup candidates after the worktree lock is handled. Remote deletion is needed only where a remote branch still exists.

| Branch | Remote branch | Worktree-bound | Action |
| --- | --- | --- | --- |
| `codex/nexus-smtp-relay-notifications` | no | no | Delete local branch. |
| `codex/nexus-storage-alert-notify` | no | no | Delete local branch. |
| `codex/nexus-storage-governance-telemetry` | no | no | Delete local branch. |
| `codex/nexus-storage-policy-health-ui` | no | no | Delete local branch. |
| `codex/nexus-storage-usage-analytics` | no | no | Delete local branch. |
| `codex/nexus-upload-governance-analytics` | yes | no | Delete local branch and `origin/codex/nexus-upload-governance-analytics`. |
| `codex/nexus-upload-problem-attempts` | no | no | Delete local branch. |
| `codex/nexus-upload-stuck-docs` | no | no | Delete local branch. |
| `codex/nexus-upload-stuck-threshold` | no | no | Delete local branch. |
| `codex/nexus-webpush-governance-docs` | yes | no | Delete local branch and `origin/codex/nexus-webpush-governance-docs`. |
| `codex/nexus-webpush-relay-notifications` | no | no | Delete local branch. |
| `codex/p1-shell-capability-hardening` | no | no | Delete local branch. |
| `codex/plugin-prelude-engineering-refresh` | no | yes | Remove/detach worktree first, then delete local branch. |
| `codex/prod-feature-crash-containment` | no | no | Delete local branch. |
| `codex/quick-actions-native-share` | no | no | Delete local branch. |
| `codex/quick-actions-share-targets` | no | no | Delete local branch. |
| `codex/recommendation-ai-scoring-tests` | no | no | Delete local branch. |
| `codex/recommendation-context-controls` | no | no | Delete local branch. |
| `codex/recommendation-context-test-hardening` | no | no | Delete local branch. |
| `codex/recommendation-semantic-controls` | no | no | Delete local branch. |
| `codex/recommendation-semantic-tests` | no | no | Delete local branch. |
| `codex/recommendation-usage-avoidance` | no | no | Delete local branch. |
| `codex/recommendation-usage-preference-tests` | no | no | Delete local branch. |
| `codex/recommendation-usage-preferences` | no | no | Delete local branch. |
| `codex/search-competitive-analysis-roadmap` | no | yes | Remove/detach worktree first, then delete local branch. |
| `codex/settings-update-app-index-polish` | no | no | Delete local branch. |
| `codex/touch-quick-actions-payload-docs` | no | no | Delete local branch. |
| `codex/touch-quick-actions-payload-safety` | no | no | Delete local branch. |
| `codex/touch-quick-actions-shell-capability` | no | no | Delete local branch. |
| `codex/tuffex-docs-components-polish` | no | no | Delete local branch. |
| `codex/wallpaper-style-personalization` | no | no | Delete local branch. |
| `fix/pr-268-linear` | no | yes | Remove/detach worktree first, then delete local branch. |
| `fix/pr-269-linear` | no | no | Delete local branch. |

### Needs merge or review before deletion

These branches still have commits not reachable from `master`; they must be merged, cherry-picked, or explicitly dropped before deletion.

| Branch | Ahead of `master` | Remote branch | Notes |
| --- | ---: | --- | --- |
| `codex/nexus-upload-object-retry` | 10 | yes | Current dirty branch. Must clean/commit/stash worktree first, then merge into `master`, push, and delete `origin/codex/nexus-upload-object-retry`. |
| `fix/pr-269-ci` | 1 | no | Contains `fix(plugin): satisfy touch-intelligence PR gates`. Needs merge or explicit drop. |
| `fix/pr-269-clean` | 1 | no | Contains `fix(plugin): harden touch-intelligence runtime client`. Needs merge or explicit drop. |
| `fix/pr-269-merge` | 1 | no | Contains another touch-intelligence runtime client hardening commit from `pull/269/head`. Needs de-duplication before merge. |
| `merge/pr-264-local` | 1 | no | Merge commit from `dev/2.5.0`; likely high-risk because it can pull broad history. Needs manual review before merge. |
| `merge/pr-268-269-test` | 4 | no | Contains PR 268 docs/model roadmap and PR 269 runtime client hardening. Needs de-duplication before merge. |
| `merge/pr-268-test` | 3 | no | Contains PR 268 docs/model roadmap merge. Needs review before merge. |

Adjacent local PR helper branches not in the screenshot but visible in the repo:

- `pr-268`: ahead of `master` with local AI roadmap docs commits.
- `pr-269`: currently has no commits ahead of `master`.
- `tmp-remote-268` and `tmp-remote-269`: helper refs matching fetched PR heads.

## Proposed Execution Order

1. Preserve the current dirty worktree by committing the related Nexus/Data Governance slice or stashing it under a named safety stash.
2. Resolve the `master` worktree lock by either using `/private/tmp/talex-touch-quick-actions-payload-b12c7a4d8` as the integration worktree or removing/detaching it after confirmation.
3. Merge `codex/nexus-upload-object-retry` into `master` after focused tests and `git diff --check`.
4. Review the non-merged PR/fix branches for duplicate commits, then merge only the unique required commits into `master`.
5. Push `master` after merge verification.
6. Delete local branches that are already merged.
7. Delete remote branches that still exist and are confirmed merged:
   - `origin/codex/nexus-upload-governance-analytics`
   - `origin/codex/nexus-webpush-governance-docs`
   - `origin/codex/nexus-upload-object-retry` after its current branch is merged and pushed.
8. Remove or detach worktrees that block branch deletion only after their status is clean or their untracked artifacts are confirmed disposable.
9. Re-run `git fetch --all --prune`, `git branch --merged master`, `git branch --no-merged master`, and `git status --short --branch` to prove cleanup.

## Confirmation Required Before Execution

The following are intentionally not executed by this document update:

- `git commit`
- `git merge`
- `git push`
- local branch deletion
- remote branch deletion
- worktree removal
- file/artifact deletion

All of the above require explicit confirmation before running.
