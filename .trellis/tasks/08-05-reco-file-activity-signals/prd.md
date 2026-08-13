# File activity signal pack

## Goal

R3c: recent downloads/new screenshots (reuse file watcher event stream), active project dirs by mtime clustering, clipboard pattern detection (consecutive same-type copies). After R3a; can parallel R3b.

## Requirements

- R1: Recent downloads and new screenshots. A new file in Downloads points at open /
  move / share; a screenshot on the Desktop points at annotation.
- R2: Active project directories, clustered by mtime, point at the matching IDE or
  terminal.
- R3: Clipboard pattern detection. Consecutive copies of the same type point at batch
  tools and at pinning clipboard history.
- R4: All three reuse the existing file-index watcher event stream rather than adding
  a second watcher.
- R5: Each registers through the R3a substrate with its own settings toggle. Content
  is stored as hash or category only, never raw, per the privacy tiering precondition.

## Acceptance Criteria

- [ ] Every signal in this pack has a settings toggle and enters the
      `unavailableSignals` system.
- [ ] Unit tests cover three states per signal: available, unavailable, toggle off.
- [ ] hit-rate@k (the R2 metric) shows no significant regression.
- [ ] No second filesystem watcher is introduced; the existing event stream is the
      only source.
- [ ] `research/reco-signals-audit.md` and the digest are updated.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
