# Implementation and delivery plan

Status: **implementation complete; acceptance partial**. The bounded watcher fix and scoped subtree bridge are implemented and locally verified. Full packaged-candidate startup and app-level idle-energy acceptance remain incomplete because the local Electron download/runtime path could not produce a valid candidate bundle; publication must describe the result as a draft/partial fix.

## 1. Confirm the bounded fix and baseline

- [x] Obtain approval for `prd.md` and `design.md`, including the explicit optional `fsevents@2.3.3` dependency and the necessary subtree correctness bridge.
- [x] Recheck upstream watcher-related changes/PRs before branching, especially #1999; record an up-to-date baseline. Use `task/fix/macos-watcher-startup-cpu` targeting `master`, as required by the enforced branch policy, and never modify an unrelated user's worktree.
- [x] Start this task using the existing session identity only after approval.
- [x] Install the repository's locked dependencies with the required Node/pnpm versions; review native install needs rather than running arbitrary lifecycle scripts.
- [x] Build a red-capable regression through the actual production watcher factory: excessive startup filesystem work must fail before the implementation, not merely a test that asserts a constructor was called.
- [x] Establish baseline event-delivery behavior for files, moved/deleted populated directories, atomic saves, root aliases and admitted symlinks. Stop for a design revision if semantic parity requires a broader subsystem rewrite.

## 2. Implement and test the focused slice

- [x] Add the macOS deep-file-root backend and explicit optional dependency without changing shallow app watches or Windows/Linux selection.
- [x] Wire scoped typed changes and bounded metadata/write-settle handling through current indexed-source mutation ownership.
- [x] Implement only the minimum directory/event-loss subtree bridge; prove it does not call provider-wide indexing for an ordinary scoped event.
- [x] Cover pending permissions, unsupported native loading, repeated registration, revocation, cancellation, queue overflow, late callbacks and awaited shutdown.
- [x] Keep backend/interface and consumer/test write scopes distinct if using the upstream implement/check helpers; the main agent owns integration decisions and final evidence.
- [x] Add a fixed 100 ms cooperative full-scan pause while retaining the existing proportional slow-chunk backoff and ordered publication contract.
- [x] Extend the shared unconditional generated-directory filter with `uvcache`, `__pycache__`, and `site-packages`; verify read-time exclusion and the ordinary `Documents/build` carve-out.

## 3. Focused checks and actual macOS evidence

Commands to begin with (add the final backend/subtree test names once created):

```sh
pnpm -C apps/core-app exec vitest run \
  src/main/modules/box-tool/file-system-watcher/file-system-watcher.test.ts \
  src/main/modules/box-tool/addon/files/services/file-provider-watch-service.test.ts \
  src/main/modules/box-tool/search-engine/indexed-source-event-router.test.ts \
  src/main/modules/box-tool/search-engine/file-indexed-source.test.ts
pnpm -C packages/utils exec vitest run \
  __tests__/search/indexing-watch-path-policy.test.ts \
  __tests__/file-filter-project-context.test.ts \
  __tests__/file-filter-traversal-anchor.test.ts
pnpm -C apps/core-app run typecheck:node
pnpm lint:changed
pnpm quality:pr
git diff --check
```

- [x] Run the new focused regression before and after the patch; record the actual failure and success.
- [x] Run real macOS native filesystem integration tests; mocked events alone do not establish event parity.
- [x] Run at least three baseline/candidate benchmark pairs using 2k/20k and a larger admitted synthetic tree, alternating order and measuring process CPU, operation counts, event-loop delay and freshness.
- [x] Use an isolated generated user-data profile for the actual app; verify the effective data path before any benchmark reset or cleanup. Test warm-index startup separately from intentional cold indexing.
- [x] Do not reuse `startup-benchmark-dev.mjs` unchanged as a sustained-CPU check: its default once-mode exits roughly one second after readiness. Extend or compose a bounded observation harness that lasts long enough to see the reported post-startup load.
- [x] Validate packaging/native dependency availability on this macOS host and run broader core type/build gates proportional to the final patch.
- [x] Stop all owned test processes/watchers and verify no changes to the installed application or ordinary user configuration/database were made by this task.
- [x] Record unrelated failing checks, skipped platforms and incomplete evidence explicitly. A lower-bound research improvement is not an application fix verdict.
- [x] Run an isolated 3,000-file cold-index A/B against current `master` and the integrated candidate, starting the sampler before Electron so startup and the complete 0→3,000 transition are captured.

## 4. Review and authorized upstream publication

- [x] Perform the upstream full-scope check and update the precise main-process spec with any newly proven watcher contract.
- [x] Add a user-facing sentence in the PR for the next release. Do not bump versions, tag, publish a release, or edit old versioned release notes; an actual release's bilingual note pair belongs to separately authorized release work. Run the existing `quality:pr` gate and distinguish pre-existing release-note failures if any.
- [ ] Prepare a redacted bug report using `.github/ISSUE_TEMPLATE/bug_report.md`, with beta.50 environment, actual measurements and a clear relation to earlier issues. Do not falsely tick “no similar issues”.
- [ ] Prepare the matching PR with `.github/PULL_REQUEST_TEMPLATE/en.md`: implementation summary, linked issue, exact test commands/results, this-host-only evidence, directory/symlink/event-loss risks and rollback.
- [x] Follow the upstream Phase 3.4 grouped commit-plan confirmation gate; create Conventional Commit work changes only after that review. No amend, merge or release.
- [x] Run `pnpm check branch-policy` before the first push. Publish through the user's fork and open the issue/PR as already requested by the user. Use a draft PR if full local acceptance is still incomplete; do not mark unchecked boxes as passed or present a draft as a verified fix.
- [x] Keep issue/PR links in task metadata and final handoff; use the prescribed archive/journal flow once the work actually completes.

## Checkpoints and rollback

- Planning checkpoint: only this task's planning/research artifacts and developer initialization metadata exist; no source implementation has started.
- Implementation checkpoint: stop if event parity, subtree scope, native packaging or privacy isolation cannot be proven with the proposed bounded change.
- Publication checkpoint: user authorized issue/PR creation, but not merging, publishing releases or deployment. Do not upload raw local logs/profiles/samples containing personal information.
