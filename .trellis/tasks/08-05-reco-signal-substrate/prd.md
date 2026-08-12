# Recommendation signal substrate

## Goal

R3a: unified signal collector registry (descriptor: id/settingKey/ttl/collect, event-driven + snapshot, unavailable tracking) so 20+ signals stay maintainable; migrate existing 8 signals onto it; replace dead bluetooth with audio-route signal (headphones -> music/meeting). After R2.

## Requirements

- R1: A collector registry with one descriptor per signal — `id`, `settingKey`,
  `ttl`, `collect` — supporting both event-driven and snapshot collection, so that
  20+ signals stay maintainable.
- R2: Availability tracking is part of the descriptor: every signal reports into the
  existing `unavailableSignals` set rather than silently returning nothing.
- R3: The 8 existing signals migrate onto the registry.
  `ContextProvider.getCurrentContext` (`context-provider.ts:54`) becomes a consumer
  of the registry instead of the place collection is written.
- R4: An audio-route signal (headphones/AirPods connected -> music / podcast /
  meeting apps) replaces the dead bluetooth signal, which is removed together with
  its settings toggle.
- R5: Each signal carries its own settings toggle, per the first of the three
  preconditions in `reco-signals-audit.md` (privacy tiering: on-device only, content
  stored as hash or category).

## Acceptance Criteria

- [ ] Every signal reached through the substrate has a settings toggle and reports
      into `unavailableSignals`.
- [ ] Unit tests cover three states per signal: available, unavailable, toggle off.
- [ ] hit-rate@k (the R2 metric) shows no significant regression after the 8 signals
      are migrated.
- [ ] The bluetooth signal and its settings toggle are both gone — no dead toggle is
      left in the settings UI.
- [ ] `research/reco-signals-audit.md` and the digest are updated.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
