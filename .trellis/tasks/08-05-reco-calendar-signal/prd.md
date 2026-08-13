# Calendar signal

## Goal

R3d: EventKit native binding (tuff-native) + calendar permission registry id + imminent-event join-link candidates (Zoom/Meet/Tencent) + post-meeting tools + CN holiday/workday calendar correcting isWorkingHours. After R3a.

## Requirements

- R1: EventKit binding in `tuff-native` for calendar access.
- R2: A calendar permission id in the permission registry. The registry carries 27
  ids today and none of them covers calendar.
- R3: Imminent event -> a "join meeting" candidate N minutes before it starts,
  parsing Zoom / Google Meet / Tencent Meeting links out of the event itself.
- R4: Post-meeting -> notes and minutes tools.
- R5: Chinese holiday and make-up-workday calendar corrects `isWorkingHours`. The
  make-up workday schedule needs built-in data; it cannot be derived from the date.
- R6: Registers through the R3a substrate with its own settings toggle. Event content
  is handled on-device and stored as hash or category, never raw event text.

## Acceptance Criteria

- [ ] The calendar signal has a settings toggle and enters the `unavailableSignals`
      system, including the case where calendar permission is denied.
- [ ] Unit tests cover three states: available, unavailable (permission denied or no
      EventKit), toggle off.
- [ ] hit-rate@k (the R2 metric) shows no significant regression.
- [ ] The new permission id appears in the permission registry, and denying it leaves
      the rest of the recommendation path working.
- [ ] `research/reco-signals-audit.md` and the digest are updated.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
