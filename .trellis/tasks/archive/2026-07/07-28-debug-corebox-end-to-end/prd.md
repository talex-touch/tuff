# Debug CoreBox end to end

## Goal

Debug the complete supported CoreBox flow on the current default-branch product code,
produce a redacted evidence report, and classify each observation as confirmed-new,
known/duplicate, environment-only, or inconclusive without fixing product code.

## Background

- The host is macOS arm64. Windows Everything packaged acceptance remains owned by
  #308; Windows and Linux behavior receive static/test coverage only.
- Full CoreApp suite restoration is owned by #323. Failures matching its listed
  packaging, idle, actor-boundary, or watcher groups are evidence for #323, not new
  Issues.
- Search provider lifecycle, audit refresh, cache measurement, semantic reorder, AI
  recapture, and App Icon release evidence remain owned by #334/#340/#346/#348,
  #337, and #310.
- Historical transport hard-cut commit `a0c6282898` replaced legacy CoreBox handler
  registrations with canonical registrations while retaining the original canonical
  handlers. Current `ipc.ts` therefore contains many same-event pairs. Real main
  transport keeps handlers in Sets, but the current unit mock keeps only one handler
  per event in a Map. This is a high-value candidate requiring executable proof.
- Shortcut ordering commit `bfa18626b` intentionally moved the shortcut-intent event
  before window show. A later merge restored a second post-show canonical event. This
  is a design-regression candidate only if observable duplicate behavior is proven.

## Requirements

### R1. Static and automated coverage

- Map CoreBox window/module lifecycle, typed transport, renderer visibility/input,
  search sessions, cancellation, result merging, item/action execution, activation,
  plugin view, and teardown ownership.
- Run focused main/renderer tests, both CoreApp typechecks, build gates, and the full
  CoreApp suite. Classify known full-suite failures against #323.
- Inspect TODO/FIXME/skip, broad catches, duplicate subscriptions, stale event paths,
  and lifecycle resources only inside the mapped CoreBox flow.

### R2. Isolated runtime coverage

- Build or launch a local packaged/preview runtime using a disposable userData root,
  synthetic HOME/search fixtures, bounded CDP port, and supervised process cleanup.
- Pause before every complete runtime launch until the user explicitly confirms that
  the macOS system clipboard currently contains only non-sensitive synthetic text.
  Do not inspect, back up, clear, restore, or persist clipboard content in automation.
- Exercise onboarding blocked/recovery, open/close/toggle, blur/pin/focus, resize,
  keyboard/pointer navigation, ordinary and scoped search, loading/result/empty/
  degraded states, cancellation and rapid query replacement, item execution, and
  available plugin/context activation.
- Do not use personal clipboard contents, personal indexed roots, real provider keys,
  or real account state.

### R3. Candidate confirmation

- For duplicate transport registrations, prove real handler cardinality and one
  canonical request's side-effect count using the actual transport semantics; the Map
  mock alone is insufficient.
- For duplicate shortcut notification, prove event order/count and any AutoPaste,
  search, focus, or clipboard side effect. If effects remain idempotent, record it as
  cleanup only and do not publish a bug.
- For every other candidate, reproduce twice or pair runtime evidence with an
  executable focused contract; preserve exact source/commit anchors.

### R4. Deliverables

- Write `research/report.md` with environment, command matrix, runtime flow outcomes,
  blockers, and redacted evidence references.
- Write `research/candidates.md` with expected/actual behavior, reproduction, impact,
  root cause, severity, duplicate search, and classification for every candidate.

## Acceptance Criteria

- [ ] The exact default-branch baseline, scoped pre-run worktree status/diff, and
  disposable runtime profile are recorded.
- [ ] Focused tests, full suite, node/web typechecks, build, and supported runtime
  flows have recorded commands and outcomes.
- [ ] CoreBox main -> transport -> renderer -> search -> execute -> lifecycle data
  flow is traced with no unclassified boundary.
- [ ] Known #308/#310/#323/#334/#337/#340/#346/#348 boundaries are linked rather
  than republished.
- [ ] Every new-defect candidate has repeatable evidence, source anchors, severity,
  impact, acceptance criteria, and a completed duplicate search.
- [ ] Personal data, raw clipboard/query content, tokens, and real profile paths do
  not appear in durable evidence.
- [ ] Product source remains unchanged; only task research/evidence artifacts are
  added.

## Out of Scope

- Fixing CoreBox or changing tests to make failures pass.
- Real Windows/Linux or signed/notarized release acceptance.
- Broad search/indexing architecture audit beyond a directly reached CoreBox defect.
