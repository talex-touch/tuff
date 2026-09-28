# Upstream overlap and publication research

## Snapshot and scope

- Checked **2026-09-28, through 01:50:45 UTC / 09:50:45 Asia/Shanghai** using read-only GitHub REST API calls through `gh api`.
- Repository: `talex-touch/tuff`; default branch: `master`; observed upstream HEAD: `98a2d6c0d971b05b11e2d8ef645066b270e9ea65` (commit dated `2026-09-28T01:40:29Z`). [S1]
- Task/local baseline: `13903cb9b56fbb0acd30323616164c62150a0559`, confirmed by the supplied PRD and `git rev-parse HEAD`. Upstream is two commits ahead; the comparison changes only the native-addon preservation script and its test, through PR #1998. **Do not describe the local baseline as current upstream HEAD.** [S2]
- Planning only. Read repository instructions, relevant Trellis planning rules, and task `prd.md`. No production implementation, app/private-data inspection, experiment execution, task activation, commit, branch creation, publication, or upstream writes were performed. Only this research file is authored by this helper.
- Evidence labels: **confirmed upstream** means API metadata or documented upstream statements; issue authors' diagnoses and PR authors' test results remain attributed claims, not independently reproduced facts. The local probe below is **supplied by the main agent**, not rerun here.

## Recommendation: related, potentially distinct follow-up

**Recommended planning classification: a focused, potentially distinct watcher-startup follow-up within the existing indexing/performance problem family—not a demonstrated regression.** This is an inference from the different reported mechanisms and the available local probe, not an upstream maintainer decision.

- A generic report of macOS background CPU, stalls, or expensive home-directory scanning substantially overlaps **#1980** and partly **#1964**. Do not publish that as a newly discovered, unrelated problem. [S3][S4]
- A report specifically isolating **initial Chokidar/FSEvents watcher enumeration**, separately from scheduled index scans, connection handling, diagnostics, and clipboard activity, has a narrower mechanism not established by those reports. The bounded search found no dedicated report for that exact startup-enumeration mechanism. This is a search result, not proof that no duplicate exists.
- **Do not call it a regression** unless a comparable earlier build/commit is shown to behave correctly and a later one incorrectly. Persistence after earlier fixes can be a residual problem rather than a newly introduced regression.
- If full-app comparison cannot separate watcher work from existing causes, prefer a linked evidence update to #1980 over a separate broad CPU issue. If it does separate them, a new narrowly scoped issue can explicitly relate to #1964, #1980, #1986, and the now-open #1999 without claiming to resolve them all.
- Suggested eventual title, after causal verification: `[Bug] macOS deep file-watch startup enumerates unchanged trees despite scan scheduling`. Until then, retain “suspected watcher startup traversal” in the description rather than presenting app-level attribution as settled.

## Confirmed upstream issue overlap

| Reference | State at check | What upstream actually reports | Boundary for this task |
| --- | --- | --- | --- |
| **#1964**, opened `2026-09-26T01:03:42Z` | Open; no comments; no close timestamp | macOS 15.7.5 / Apple Silicon, beta.41; author reports delayed V8 OOM/SIGABRT, per-file icon/Base64 growth, a large search DB, and indexing/write backlog. | Related full-home workload, but not an isolated watcher-startup CPU report. Do not repeat its pre-fix icon architecture as current behavior. [S3] |
| **#1980**, opened `2026-09-27T05:23:54Z` | Open; no comments; no close timestamp | beta.41 through beta.45; author attributes FD/native-memory growth to libSQL transaction connections and also describes clipboard processing, diagnostic SQL, long scans, 6–10% background CPU, and multi-second stalls. | Closest symptom overlap. The issue itself does not isolate Chokidar's initial traversal. Its causal claims do not prove the cause of beta.50 observations. [S4] |
| **#318** | Open | Large-directory memory-bound investigation across scan, acknowledgement, persistence, reconciliation, and cancellation. | Adjacent memory/performance work, not equivalent to watcher registration CPU. PR #1105 explicitly leaves #318 open because its benchmark covers traversal/cancellation rather than the entire pipeline. [S5] |
| **#343** | Open | Provider ownership/architecture simplification after correctness and memory gates. | Do not turn the focused macOS fix into a provider-wide refactor or introduce competing ownership merely to solve startup cost. [S6] |

### FSEvents search hits are not evidence of a missing native build

Issues **#603** and **#761** are closed as `not_planned`. #761 was explicitly closed as a duplicate of #603. The closing explanation on #603 says the old allowlist inventory was stale and adding `fsevents@2.3.3` to `onlyBuiltDependencies` would have no effect because that package ships its native artifact without an install hook. **Do not resurrect these as an established startup cause or a proposed allowlist fix.** This records the upstream disposition; this helper did not audit the installed native module. [S7]

## Related fixes and exact history

All dates in this table are UTC. Scope descriptions summarize PR/commit statements, not fresh implementation analysis.

| PR / event | Exact refs and date | Relevant disposition |
| --- | --- | --- |
| **#1965** | Closed `2026-09-27T11:31:24Z`; `merged=false`, `merged_at=null`, `merge_commit_sha=null`; last head `ff1b4a31eace6b0dc215404c9a6ed3da206aed68` | **Closed as superseded, not merged.** Its body says `Closes #1964`, but #1964 is still open. The human closing comment identifies the replacement commits below. PR scope included icon storage, indexing bounds, app search, exclusions/resume; it explicitly left native allocator growth unattributed. [S8] |
| Replacement search/indexing commit | `b3edffef16baf1329712aa3a4b283925cfe09c04`, `2026-09-26T10:33:50Z` | Indexing memory/backpressure, icon storage, filter exclusions. The API comparison confirms this commit is an ancestor of the checked `master`. [S9] |
| Replacement app-search commit | `043405928d258e9754a74237daa5caaafd68716d`, `2026-09-26T10:34:01Z` | App-search fast lane and refresh protection; also confirmed an ancestor of checked `master`. [S9] |
| **#1966** | Merged `2026-09-26T11:10:47Z`; merge `6c8176b920a2ce415b8101c7bce214e7c3cd6e6a` | Batch integration describes the replacement search and CoreBox work. Cite this history rather than claiming #1965 was merged. [S10] |
| **#1984** | Merged `2026-09-27T11:50:23Z`; merge `947cc37a2a8b670c7403d8b7216feae0eb8af3de`; fix `33782d0acefe9e9c5fd3ff9287a9cc3b8e71baef` | Invalid/stale mutation-lease recovery instead of indefinite retries. Preserve this behavior; not a watcher-registration fix. [S11] |
| **#1986** | Merged `2026-09-27T12:24:12Z`; merge `a5ffe90266984dd6ca13ba0fe1d94a25c811eb2f`; startup fix `c4e658bfdf0494b0e0d702654ba8c09c835cd2b2` | Startup scan eligibility replaces forcing a full scan. Its changed paths include `file-provider-watch-service.ts` and its test. **This is close scheduling overlap; the PR description is not evidence that watcher initial enumeration was removed.** [S12] |
| **#1988** / beta.47 | Merged `2026-09-27T13:48:28Z`; merge `7b86dbdab53cb73308ab9f32561b8c4582032c81`; fixes `9ed43e307ab4c001b6246cef3ebcc7232ff6a355` and `bcac8459112a1c6ea17a6c87085276f79465475e` | libSQL upgrade/manual transaction migration and connection leak/busy-reconnect changes. beta.47 notes explicitly claim transaction-connection accumulation and stale-lease fixes. Do not imply #1980's beta.41–45 database state is unchanged in beta.50. [S13] |
| **#1991** | Merged `2026-09-27T19:53:51Z`; merge `9a5edf0b959f0c854fc77580b6fc1d628218ae9f` | Further persistence/teardown/database work, libSQL 0.18.0, and startup telemetry. Relevant commits: shutdown watch-routing guard `c63797968602aa9fe9b3d403915d0c2053d81740`; busy reconnect `a9220a911391d0ffd67f0dcbdcfd7f4ca3ca4311`; startup attribution `582e0f2837131c8b7acf4846f1cb7bc99c9fd181`. Preserve shutdown and cancellation contracts; do not bundle these already-landed fixes. [S14] |
| **#1105** / #318 partial | Merged `2026-08-07T15:32:00Z`; merge `26db01c46e3da93fb75a987601e984837a4a0635` | Existing synthetic scan-memory benchmark. Its explicit partial-coverage caveat is a useful precedent: a small isolated experiment must not be presented as full-pipeline validation. [S5] |

### Release identity matters

At the check, the first returned published release was **`v2.4.14-beta.50`**, a prerelease published `2026-09-27T23:42:24Z` (**2026-09-28 07:42:24 Asia/Shanghai**). Its tag resolves to **`54cba055b0c86467278ee6bae3cd4cd8b1749b0c`**. The API comparisons confirm ancestry of the replacement indexing fix, #1986 startup fix, #1988 connection fix, and #1991 busy-reconnect fix in that tag (`behind_by=0`, merge base equals each fix SHA). This proves source ancestry, not a new runtime validation of the installed app. [S15]

The checked `master` manifests both still say **`2.4.14-beta.46`**, whereas the release tag is beta.50. The beta.47 and beta.50 notes are available at their tags but returned 404 at the checked master SHA. **Record both exact source SHA and installed/reproduced release version; do not infer current published version from master manifests, and do not “repair” this release-line difference in the watcher PR.** [S16]

## Active upstream conflicts: refresh immediately before implementation/publication

Two PRs opened while this research was running; an earlier empty open-PR result is therefore obsolete.

- **#1999 — `perf(core-app): bound indexing diagnostics work`**, open, created `2026-09-28T01:48:19Z`; head **`2cc46c6fd09f2016fba92dc958292c361516e9e8`**, base **`98a2d6c0d971b05b11e2d8ef645066b270e9ea65`**. It bounds diagnostic sampling/aggregation and scopes diagnostic IPC by source. Changed files include `file-provider.ts`, `file-provider-startup.test.ts`, `indexing-runtime.ts`/test, `search-core.ts`, common IPC, and indexing write-side effects. **Potential integration and measurement conflict:** this addresses one CPU/stall contributor already described in #1980. Track whether it lands; keep the watcher-only experiment distinct and repeat the app comparison against an explicitly recorded baseline. A textual conflict cannot be assessed until this task has a patch. [S17]
- **#2000 — `fix(core-app): bound auth network requests`**, open, created `2026-09-28T01:48:34Z`; head **`a78cb7a37d589e53de76a21959ea81a6780a6cd3`**, same base. Its two changed paths concern main-process auth and renderer credits summary, not watcher implementation. No direct file overlap is evident from its file list, but full-app startup attribution should not absorb its effects into the watcher claim. [S18]
- Already-landed #1986 and #1991 both touch `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-watch-service.ts` and its tests. #1984/#1988/#1991 also touch the provider. The main agent owns the actual contract/diff review; this helper only checked upstream file inventories. [S11][S12][S13][S14]
- PR #1965's closing status is not a successful merge, and #1964/#1980 remaining open does not mean all their original mechanisms remain unfixed. Avoid either shortcut in the report.

## Supplied local probe: use narrowly

The main agent supplied this update during research; it was **not independently inspected or rerun** here:

- Pinned Chokidar **3.6.0** / FSEvents **2.3.3**; three repeats each at 2,000 and 20,000 fixture files.
- At 20,000 files, Chokidar made **20,450 instrumented stat/lstat/readdir calls** and used **410–493 ms CPU**; raw FSEvents registration recorded **zero such instrumented calls / about 2 ms CPU**, and delivered a newly created file event.
- Raw native registration is a **lower-bound feasibility comparison**, not equivalent application behavior or complete event parity. Zero instrumented calls does not mean zero kernel/native filesystem work. The small fixture did not reproduce seconds-long stalls.
- Preferred candidate scope supplied by the main agent: macOS depth-24 file roots only, preserving home search scope; leave shallow application watches and Windows/Linux unchanged.

**Publication consequence:** these results support investigating avoidable enumeration cost. They do not yet prove the cause of the installed app's sustained high CPU or multi-second stalls, nor establish compatible startup-race, subtree, rename/removal, error, or shutdown behavior. Do not advertise the raw-registration CPU ratio as the final application speedup. Attach the main agent's reproducible commands/results only after its evidence review; do not copy private profile data into the report.

**Additional local design constraint supplied by the main agent, not independently inspected here:** at the current baseline, `fileProvider.reconcileIndexedSource` ignores `request.roots` and invokes whole-provider `startIndexing`. Therefore a raw-native replacement cannot claim inexpensive subtree recovery through that existing API. The plan must gate a native backend on preserving moved/deleted-directory semantics **without a whole-home rescan**, and explicitly account for the necessary bounded-subtree bridge. This is an unresolved planning/compatibility gate, not evidence that such a bridge is already implemented or validated. Root cause is not fully confirmed and the full application is not fixed.

## Templates and contribution requirements

### Issue

The current bug template requests a `[Bug]` title, type, OS/app/channel information, reproducible description, checklist, and contact. Use **Performance Error**. It rejects dev-version-only bug reports and asks for a PR in that case. An observed official beta can anchor the report, with an isolated source experiment clearly labeled as supplemental. [S19]

**Template conflict:** its checklist asks the reporter to assert that no similar issues were seen. That is false here. Leave that literal assertion unchecked with an explanation, or replace it with an honest search/related-issues statement linking #1964/#1980/#1986/#1999. Do not tick a false assertion merely to fit the form. This is a recommended truthful adaptation, not a verified maintainer exception.

### Pull request and branch

- Both English and Chinese PR templates request summary/type, conventions, existing and new tests, local validation, documentation updates where needed, and build/release validation if affected. A user-facing release sentence is optional in the PR body; link the narrow issue with a closing keyword only when its acceptance criteria are actually satisfied. Use non-closing references for broader #1964/#1980. [S20]
- The contribution guides recommend discussing an issue before development, a fork based on `master`, validation, and conventional commit subjects. This research does **not** authorize creating the issue now; the task's approval/publication gates still apply. [S21]
- The more specific branch policy requires lowercase `task/<type>/<slug>` and PRs into `master`; for a future approved branch, `task/fix/macos-watcher-startup-cpu` fits that shape. The older contribution guide's unrestricted naming advice and the PR template's example `main` are not the enforced branch contract. [S22]
- `commitlint.config.cts` enforces lowercase allowed types and a nonempty subject. A future focused commit can use `fix(core-app): ...` or `perf(core-app): ...`; this helper must not create it during planning. [S23]
- The verified root script `quality:pr` runs `pnpm release:notes verify`, `pnpm lint:changed`, `pnpm test:targeted`, and `pnpm -C "apps/core-app" run typecheck`. These are documented future checks, **not checks run by this research helper**. Match additional real-filesystem tests to the eventual implementation and describe platform limits. [S16]

### Release notes: fix PR versus release work

The release guide is stricter than the optional PR release-note field: an actual Release/Beta requires `notes/update_<version>.zh.md` and `.en.md`, with matching versioned H1s, 3–6 summary bullets, at least one change bullet, corresponding bilingual counts/meaning, and no placeholders. Optional sections must correspond too. PR metadata is an appendix, not a substitute for authored release notes. Snapshot builds are exempt. [S24]

For this **focused fix**, provide an accurate user-facing sentence in the PR, request inclusion in the next release, and coordinate its target with maintainers. **Do not bump versions, generate a new release, tag, or edit old released notes solely to satisfy an optional PR field.** If release authoring is later explicitly assigned, the documented checks are:

```sh
pnpm release:notes prepare --version <version> --target-ref HEAD
pnpm release:notes verify --version <version> --tag v<version>
```

Both PR templates point to `docs/github-automation.zh-CN.md`, but that path is absent from the pinned recursive tree and its Contents API returned **404**. Treat it as a stale pointer; use the actual templates, release guide, manifest scripts, and branch policy rather than inventing instructions from the missing document. [S20][S25]

## Publication checklist — all pending, not authorization to publish

- [ ] Obtain planning/implementation review before starting the task. Main-agent integration note: the user already explicitly requested an issue and corresponding PR, including the necessary fork publication; that authorization is retained. It does not authorize merging, releases or deployment, and the upstream implementation/commit-review gates still apply.
- [ ] Refresh upstream `master`, release identity, #1964/#1980, and especially open #1999/#2000; record timestamp, baseline SHA, candidate SHA, and whether competing fixes are included.
- [ ] Decide issue routing using the app-level evidence: a distinct watcher mechanism merits a linked narrow report; symptom-only evidence belongs as a related update. Claim a regression only with an earlier-good/later-bad comparison.
- [ ] Include released beta/OS/architecture, redacted reproduction, expected versus observed behavior, exact fixture sizes/repeats/commands, CPU versus wall time, event-loop measurements, and attribution limits. Do not imply the small probe reproduced multi-second stalls.
- [ ] Explicitly disclose #1964/#1980 and the landed scan/database fixes; describe #1999's competing diagnostic-cost work. Do not falsely check “no similar issues.”
- [ ] Keep the candidate boundary macOS deep file roots, home scope preserved, shallow app watches and other OS behavior unchanged; attach the main agent's actual event/lifecycle compatibility evidence rather than extrapolating from one delivered create event.
- [ ] Before claiming native-backend compatibility, verify moved/deleted-directory recovery through an explicitly bounded subtree bridge; do not label the current whole-provider reconcile API a cheap subtree operation.
- [ ] Supply applicable regression tests, type/lint checks, isolated real-macOS validation, rollback/cleanup evidence, and a list of unexecuted Windows/Linux checks. Populate PR checkboxes from results, not intent.
- [ ] Keep the diff focused and based on an explicitly approved up-to-date base; preserve adjacent scan-eligibility, shutdown, connection, and diagnostics work. Reassess file conflicts when #1999 lands.
- [ ] Use the correct PR template/branch/commit conventions. Link issue and PR mutually after authorization; avoid closing broad unresolved issues with this narrower fix.
- [ ] Provide a restrained release-note sentence after success is measured; let authorized release work own version bumps, bilingual release files, tags, publishing, and deployment.
- [ ] Redact personal filesystem paths, profile contents, database rows, private logs, credentials, and raw diagnostic artifacts from every publication.

## Search coverage and limitations

Search endpoint: `GET /search/issues`; all queries prefixed `repo:talex-touch/tuff`; `per_page=100`; no state restriction. All listed responses had `incomplete_results=false`, and totals were below one page. Searches covered issue/PR **titles and bodies**, not every historical review comment, deleted discussion, or unpushed branch.

| Query suffix | Results | Relevant outcome |
| --- | ---: | --- |
| `chokidar in:title,body` | 5 | Includes #603/#761; no dedicated startup-enumeration report found. |
| `fsevents in:title,body` | 2 | #603/#761, disposed as described above. |
| `watcher in:title,body` | 43 | Many renderer watchers and unrelated watches; no exact startup CPU duplicate identified. |
| `CPU in:title,body` | 9 | #1980 is the closest performance report. |
| `libsql in:title,body` | 19 | #1980 and newer database/release PRs. |
| `indexing in:title,body updated:>=2026-09-20` | 8 | Includes #1965/#1966/#1984/#1986/#1991/#1993 and #1980; search preceded #1999 creation. |
| `traversal in:title,body` | 18 | #318/#1105 distinguish scan-memory evidence from watcher registration. |
| `"file watcher" in:title,body` | 4 | No exact CPU duplicate identified. |
| `startup scan in:title,body` | 12 | #1986 and adjacent provider architecture/lifecycle history. |
| `启动 扫描 in:title,body` | 1 | #1980. |

Also read #1964/#1980 comments and timelines, #1965 closure/comment history, related PR metadata/commits/file inventories, and refreshed the complete open-PR endpoint. Searching literal issue numbers was insufficient: `"1980" in:body` returned an unrelated historical match rather than the actual newer database fixes. The related fixes were traced through PR scope, commits, and release notes instead.

The final open-PR API snapshot supersedes earlier search counts for newly created PRs. No guarantee is made about upstream changes after `2026-09-28T01:50:45Z`. No local watcher implementation or private application data was independently analyzed, and no app tests were run. The failed documentation reads are recorded above rather than silently replaced with assumptions.

## Primary-source reference register

References below are primary GitHub repository/API sources. Pinned documentation uses the checked `master` SHA; issue/PR metadata is mutable and must be refreshed before publication.

- **S1:** [Repository metadata](https://api.github.com/repos/talex-touch/tuff); [pinned master commit](https://github.com/talex-touch/tuff/commit/98a2d6c0d971b05b11e2d8ef645066b270e9ea65).
- **S2:** [Baseline-to-HEAD comparison](https://api.github.com/repos/talex-touch/tuff/compare/13903cb9b56fbb0acd30323616164c62150a0559...98a2d6c0d971b05b11e2d8ef645066b270e9ea65); [PR #1998](https://github.com/talex-touch/tuff/pull/1998).
- **S3:** [Issue #1964](https://github.com/talex-touch/tuff/issues/1964); [metadata](https://api.github.com/repos/talex-touch/tuff/issues/1964); [timeline](https://api.github.com/repos/talex-touch/tuff/issues/1964/timeline).
- **S4:** [Issue #1980](https://github.com/talex-touch/tuff/issues/1980); [metadata](https://api.github.com/repos/talex-touch/tuff/issues/1980).
- **S5:** [Issue #318](https://github.com/talex-touch/tuff/issues/318); [PR #1105](https://github.com/talex-touch/tuff/pull/1105).
- **S6:** [Issue #343](https://github.com/talex-touch/tuff/issues/343).
- **S7:** [#603 closing explanation](https://github.com/talex-touch/tuff/issues/603#issuecomment-5234540166); [#761 duplicate disposition](https://github.com/talex-touch/tuff/issues/761#issuecomment-5201806444).
- **S8:** [PR #1965 API metadata](https://api.github.com/repos/talex-touch/tuff/pulls/1965); [superseded/landed-elsewhere comment](https://github.com/talex-touch/tuff/pull/1965#issuecomment-5855439798); [commit list](https://api.github.com/repos/talex-touch/tuff/pulls/1965/commits).
- **S9:** [Indexing replacement commit](https://github.com/talex-touch/tuff/commit/b3edffef16baf1329712aa3a4b283925cfe09c04); [app-search replacement commit](https://github.com/talex-touch/tuff/commit/043405928d258e9754a74237daa5caaafd68716d). Ancestry checked with `GET /repos/talex-touch/tuff/compare/<commit>...98a2d6c0d971b05b11e2d8ef645066b270e9ea65`.
- **S10:** [PR #1966](https://github.com/talex-touch/tuff/pull/1966).
- **S11:** [PR #1984](https://github.com/talex-touch/tuff/pull/1984); [changed files](https://api.github.com/repos/talex-touch/tuff/pulls/1984/files).
- **S12:** [PR #1986](https://github.com/talex-touch/tuff/pull/1986); [commits](https://api.github.com/repos/talex-touch/tuff/pulls/1986/commits); [changed files](https://api.github.com/repos/talex-touch/tuff/pulls/1986/files).
- **S13:** [PR #1988](https://github.com/talex-touch/tuff/pull/1988); [commits](https://api.github.com/repos/talex-touch/tuff/pulls/1988/commits); [beta.47 release notes at tag](https://github.com/talex-touch/tuff/blob/v2.4.14-beta.47/notes/update_2.4.14-beta.47.en.md).
- **S14:** [PR #1991](https://github.com/talex-touch/tuff/pull/1991); [watch-shutdown commit](https://github.com/talex-touch/tuff/commit/c63797968602aa9fe9b3d403915d0c2053d81740); [busy-reconnect commit](https://github.com/talex-touch/tuff/commit/a9220a911391d0ffd67f0dcbdcfd7f4ca3ca4311); [startup telemetry commit](https://github.com/talex-touch/tuff/commit/582e0f2837131c8b7acf4846f1cb7bc99c9fd181).
- **S15:** [Release list](https://api.github.com/repos/talex-touch/tuff/releases?per_page=6); [beta.50 tag commit](https://api.github.com/repos/talex-touch/tuff/commits/v2.4.14-beta.50); [beta.50 release notes](https://github.com/talex-touch/tuff/blob/v2.4.14-beta.50/notes/update_2.4.14-beta.50.en.md). Ancestry checked with `GET /repos/talex-touch/tuff/compare/<fix-sha>...54cba055b0c86467278ee6bae3cd4cd8b1749b0c` for the four fixes named in the release-identity section.
- **S16:** [Root manifest](https://github.com/talex-touch/tuff/blob/98a2d6c0d971b05b11e2d8ef645066b270e9ea65/package.json); [CoreApp manifest](https://github.com/talex-touch/tuff/blob/98a2d6c0d971b05b11e2d8ef645066b270e9ea65/apps/core-app/package.json).
- **S17:** [PR #1999](https://github.com/talex-touch/tuff/pull/1999); [metadata](https://api.github.com/repos/talex-touch/tuff/pulls/1999); [changed files](https://api.github.com/repos/talex-touch/tuff/pulls/1999/files).
- **S18:** [PR #2000](https://github.com/talex-touch/tuff/pull/2000); [changed files](https://api.github.com/repos/talex-touch/tuff/pulls/2000/files).
- **S19:** [Bug template](https://github.com/talex-touch/tuff/blob/98a2d6c0d971b05b11e2d8ef645066b270e9ea65/.github/ISSUE_TEMPLATE/bug_report.md).
- **S20:** [English PR template](https://github.com/talex-touch/tuff/blob/98a2d6c0d971b05b11e2d8ef645066b270e9ea65/.github/PULL_REQUEST_TEMPLATE/en.md); [Chinese PR template](https://github.com/talex-touch/tuff/blob/98a2d6c0d971b05b11e2d8ef645066b270e9ea65/.github/PULL_REQUEST_TEMPLATE/zh-CN.md).
- **S21:** [Contribution guide](https://github.com/talex-touch/tuff/blob/98a2d6c0d971b05b11e2d8ef645066b270e9ea65/.github/docs/contribution/CONTRIBUTING.md); [Chinese guide](https://github.com/talex-touch/tuff/blob/98a2d6c0d971b05b11e2d8ef645066b270e9ea65/.github/docs/contribution/CONTRIBUTING_zh.md).
- **S22:** [Branch and release policy](https://github.com/talex-touch/tuff/blob/98a2d6c0d971b05b11e2d8ef645066b270e9ea65/.trellis/spec/guides/branch-and-release.md).
- **S23:** [Commitlint configuration](https://github.com/talex-touch/tuff/blob/98a2d6c0d971b05b11e2d8ef645066b270e9ea65/commitlint.config.cts).
- **S24:** [Release-note authoring guide](https://github.com/talex-touch/tuff/blob/98a2d6c0d971b05b11e2d8ef645066b270e9ea65/notes/RELEASE_NOTES_GUIDE.md); [legacy thresholds](https://github.com/talex-touch/tuff/blob/98a2d6c0d971b05b11e2d8ef645066b270e9ea65/notes/release-notes.config.json).
- **S25:** [Pinned recursive tree](https://api.github.com/repos/talex-touch/tuff/git/trees/98a2d6c0d971b05b11e2d8ef645066b270e9ea65?recursive=1) (`truncated=false`); missing-pointer check: `GET /repos/talex-touch/tuff/contents/docs/github-automation.zh-CN.md?ref=98a2d6c0d971b05b11e2d8ef645066b270e9ea65` returned 404.
