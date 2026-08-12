# Behavior learning signals

## Goal

R3e: prev_app co-occurrence table (schema context format already reserved), exposure-CTR negative feedback (uses R2 metric data), session rhythm boost, hashed window-title (default off), wifi place buckets. Depends on R1 identity fix + R2 exposure metrics. Geolocation stays parked (only non-local-ish signal).

## Requirements

- R1: `prev_app` co-occurrence table. `usage_logs.context` already reserves the
  prev_app format (`schema.ts:209`), but `recordExecute` writes only `{scoring}`.
- R2: Exposure-CTR negative feedback — decay for items shown and not clicked. The
  `cancelCount` skeleton exists; exposure recording is what is missing. Consumes the
  metric data R2 produces.
- R3: Session rhythm. Consecutive queries in the same category temporarily raise that
  category's weight for the rest of the session.
- R4: Window title, hashed or whitelisted, **default off**. The schema already
  reserves prev_app and window_title; this is the highest-privacy-cost item in the
  batch, which is why it ships disabled.
- R5: Wi-Fi place buckets (SSID / gateway MAC) as the compromise for location. Real
  geolocation stays parked — it is the only candidate signal that would leave the
  on-device rule, and needs its own task if it is ever revived.
- R6: Depends on R1's sourceId identity fix and on R2's exposure metrics; neither
  substitute is acceptable, because without them the learned weights train on the
  broken identity.

## Acceptance Criteria

- [ ] Every signal in this pack has a settings toggle and enters the
      `unavailableSignals` system; window title is off by default.
- [ ] Unit tests cover three states per signal: available, unavailable, toggle off.
- [ ] hit-rate@k (the R2 metric) shows no significant regression, and the exposure
      side of that metric is populated rather than assumed.
- [ ] No raw window title or SSID is persisted — only hashes or bucket ids.
- [ ] `research/reco-signals-audit.md` and the digest are updated.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
