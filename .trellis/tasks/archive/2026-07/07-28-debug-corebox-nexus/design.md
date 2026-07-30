# Design: CoreBox and Nexus debugging program

## 1. Baseline

Fetch `origin/master` before each debugging child and again before publication. The
current local product tree is byte-equivalent to `origin/master=6b33964cd` in the
owned paths, so existing dependencies can be reused without updating or resetting the
user's worktree. If a later fetch changes product files, affected findings must be
reproduced again on the new baseline.

## 2. Evidence architecture

```text
exact baseline + environment
  -> automated/build matrices
  -> isolated runtime probes
  -> raw temporary evidence
  -> redacted task-local report
  -> candidate ledger
  -> deduplication against canonical trackers
  -> user-reviewed Issue body
  -> GitHub Issue URL
```

Durable artifacts:

- Parent baseline: `research/audit-baseline.md`.
- Child reports: each child's `research/report.md` and `research/candidates.md`.
- Final drafts: publication child's `drafts/*.md` and `research/deduplication.md`.

Raw process logs, profiles, HAR, screenshots, and browser storage remain outside
tracked source under `/tmp` or ignored `output/playwright`. Reports may include hashes,
counts, timings, status codes, bounded error tails, and source anchors, but not user
content or credentials.

## 3. Product data-flow boundaries

CoreBox:

```text
shortcut/window lifecycle
  -> typed main transport
  -> renderer visibility/input state
  -> request-scoped search stream
  -> provider/session/cancellation
  -> renderer merge/focus/selection
  -> typed item/action execution
  -> activation/plugin view/window state
```

Nexus:

```text
browser route
  -> Nuxt SSR/prerender/client hydration
  -> public or auth-gated server API
  -> normalized service/binding adapter
  -> local synthetic D1/R2 or public read-only response
  -> UI/error/recovery state
```

Each child tests boundaries and round trips, not every internal helper or every Nexus
admin page. Authenticated/deployed write lanes stay out of scope.

## 4. Candidate state machine

```text
observed -> reproduced -> root-caused -> confirmed
                                  -> known/duplicate
                                  -> environment-only
                                  -> inconclusive
confirmed + unique -> drafted -> user-approved -> published
```

No candidate skips reproduction and root-cause review. Static suspicious code is a
lead, not a finding. For example, duplicate CoreBox transport registrations and the
second shortcut notification need handler-count and observable-behavior proof before
publication.

## 5. Deduplication policy

Compare acceptance criteria, not title keywords. A failure belongs to an existing
Issue when fixing that Issue would necessarily make the new reproduction pass.
Failures from the full CoreApp/Nexus suites default to #323/#327 unless a narrower,
independent runtime defect is proven. Windows package, deployed Nexus, Volar, AI
recapture, and search architecture boundaries remain with their current owners.

## 6. Publication and rollback

Publication uses `gh issue create` only after a final user confirmation. Create Issues
one at a time, verify the returned URL/body/labels, and stop on the first mismatch.
Rollback before publication is deletion of local drafts only. After publication, do
not edit, close, or delete an Issue automatically; report any mismatch and request a
separate correction decision.

## 7. Operational cleanup

Every runtime command records child PIDs, uses bounded ports and disposable profiles,
and terminates supervised processes in `finally`/shell cleanup. Remove temporary
profiles and raw auth/browser state after summaries are generated. Do not run multiple
Electron or Nuxt build/runtime jobs concurrently on this host.
