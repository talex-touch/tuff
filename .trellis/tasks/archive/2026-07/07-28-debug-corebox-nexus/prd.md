# Detailed CoreBox and Nexus debugging

## Goal

Perform an evidence-driven end-to-end debugging pass over CoreBox and Nexus on the
latest default-branch product code, then publish one GitHub issue per confirmed,
independently actionable defect after explicit user review of the final issue list.

## Background

- CoreBox is the CoreApp search and action surface in `apps/core-app`; Nexus is the
  Nuxt web application in `apps/nexus`.
- Local `HEAD=8e8af260f` is six documentation-task commits behind
  `origin/master=6b33964cd`, but the two revisions have no differences under
  `apps/core-app`, `apps/nexus`, `packages/utils`, `package.json`, or
  `pnpm-lock.yaml`. Product evidence must still identify the fetched default-branch
  commit and be revalidated if it changes before publication.
- The user selected local synthetic data plus deployed public read-only endpoints.
  No OAuth account, authenticated Dashboard mutation, D1/R2 write, production
  credential, or personal CoreApp profile is authorized.
- Before every complete CoreApp runtime launch, the user will manually replace the
  system clipboard with non-sensitive synthetic text and explicitly confirm readiness.
  The debugging process will not inspect, back up, clear, restore, or persist clipboard
  content itself.
- Existing Issues already own broad acceptance boundaries: CoreApp full suite #323,
  Nexus full suite #327, packaged Windows CoreBox #308, deployed Nexus/OAuth/
  Dashboard/bfcache #324, Nexus Volar #332, current AI visible evidence #337, and
  search architecture follow-ups #334/#340/#346/#348.

## Requirements

### R1. Independently verifiable child tasks

| Child task                           | Deliverable                                                              | Dependency              |
| ------------------------------------ | ------------------------------------------------------------------------ | ----------------------- |
| `07-28-debug-corebox-end-to-end`     | CoreBox command matrix, runtime evidence, candidate ledger, and report   | None                    |
| `07-28-debug-nexus-end-to-end`       | Nexus command matrix, API/browser evidence, candidate ledger, and report | None                    |
| `07-28-publish-corebox-nexus-issues` | Cross-product deduplication, final drafts, approval, and Issue URLs      | Both debugging children |

The parent owns the source requirements, evidence policy, deduplication rules, and
final integration review. It is not an implementation target.

### R2. Reproducible and low-sensitive evidence

- Record exact commit, OS/architecture, Node, pnpm, product versions, environment
  mode, command, exit status, and timestamps.
- Use disposable CoreApp `userData`, synthetic fixture paths, local Nexus data, and
  fresh browser profiles. Never read or mutate the user's real profile.
- Raw logs, HAR, screenshots, browser state, and temporary packages stay in `/tmp`
  or ignored `output/playwright`; persist only bounded redacted summaries in tasks.
- Separate unsupported host, missing binding/secret, and historical evidence failures
  from product defects.

### R3. Defect confirmation, severity, and deduplication

- A publishable defect needs current-default-branch reachability, deterministic
  reproduction or executable contract proof, expected versus actual behavior,
  impact, exact source anchors, and testable acceptance criteria.
- Confirm each defect twice or with two complementary evidence paths. Observations
  that do not meet this bar remain unpublished investigation notes.
- Classify P0 as reachable security/data-loss/release-blocking failure, P1 as a main
  user-flow error or crash, and P2 as a bounded degraded/tooling/secondary-flow bug.
- Search open and closed Issues, active and archived Trellis tasks, living audits, and
  recent commits for each finding. Reuse the canonical acceptance boundary instead
  of publishing a duplicate.

### R4. GitHub Issue publication

- Draft in the repository's evidence-first style: priority/summary, audited commit
  and environment, reproduction, evidence, impact, required outcome, acceptance
  criteria, verification, and non-goals where useful.
- Use only existing repository labels unless the user separately approves label
  creation.
- Present every proposed title, severity, labels, duplicate check, and full body to
  the user. Create no Issue until the user explicitly approves the final list.
- Never include tokens, cookies, credentials, personal paths, raw queries/prompts, or
  account content in Issue bodies or attachments.

## Acceptance Criteria

- [x] The exact default-branch product-path and scoped worktree status/diff baselines
      are recorded before execution and compared after each child.
- [x] The CoreBox child produces a complete static, automated, build, and supported
      macOS runtime-flow report with a classified candidate ledger.
- [x] The Nexus child produces a complete static, automated, build, API, local
      browser, and approved public-read-only report with a classified candidate ledger.
- [x] Environmental blockers and already-owned Issue failures are reported without
      being republished.
- [x] Every proposed new defect satisfies R3 and has been checked against all
      canonical trackers.
- [x] The user explicitly approves the final Issue publication list.
- [x] Approved Issues are created in `talex-touch/tuff`; the final summary maps each
      URL to its evidence, severity, and affected flow.

## Out of Scope

- Fixing product code, closing Issues, or commenting on existing Issues without
  separate approval.
- Production writes, destructive tests, authenticated production flows, real user
  data, or credential handling.
- Claiming Windows/Linux, signed package, real OAuth, authenticated Dashboard,
  deployed Cloudflare, or bfcache acceptance from this macOS/local pass.
- Publishing style preferences, expected unauthenticated 401 responses, missing
  local bindings, unsupported-platform behavior, or unstable observations.
