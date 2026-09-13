# Audit remaining PI Desktop migration candidates

## Goal

Reassess current PI-Desktop capabilities against Tuff after folder projects, native Local AI continuation, external discovery, and Home Pi native session authority land.

## Requirements

- Use current PI-Desktop main source/spec/ADR evidence and current Tuff source; do not rely on the dated report where code can decide.
- Correct stale claims in `docs/engineering/reports/pi-desktop-competitive-analysis-2026-09-12.md`, including capabilities Tuff already owns and features completed by the two implementation children.
- Classify remaining features as implemented/overlapping, recommended next, later, or rejected.
- For each recommended feature, identify exact Tuff ownership boundaries, observable user value, migration cost, trust/privacy/license risk, dependencies, and acceptance evidence.
- Prefer contract/safety adoption over wholesale IDE-style product cloning. Never copy LGPL source files.

## Acceptance Criteria

- [x] The report no longer describes session discovery or Home Pi native continuation as wholly absent.
- [x] Existing Tuff context hygiene, delegation, permissions, scheduling, tools, and panel capabilities are verified before naming gaps.
- [x] Recommended candidates are ordered and specific enough to become separate Trellis tasks.
- [x] Rejected/deferred candidates state why they conflict with Tuff's trust model or lightweight desktop interaction model.
