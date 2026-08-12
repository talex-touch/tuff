# System state signal pack

## Goal

R3b: display/dock state, wake/boot/idle-return, charging transitions, external volume mount, IME/input-source — all via Electron powerMonitor/screen + light native cmds, each settings-gated, on-device only. Mic/camera-in-use as stretch. After R3a.

## Requirements

- R1: External display / dock state. Connected reads as desk mode (weight IDE and
  design apps); disconnected reads as mobile mode.
- R2: Wake, boot, and return-from-long-idle. Distinguishes a morning routine from a
  late-night session.
- R3: Charging transition edge. Battery level is already collected; the missing part
  is the transition itself — just-plugged-in together with an external display reads
  as sitting down to work.
- R4: External volume mount. A USB drive appearing points at file management and
  backup actions, plus recent files on that volume.
- R5: IME / input-source switch. A Chinese IME in the foreground slightly favours
  Chinese-content applications.
- R6 (stretch): Microphone or camera in use — in a meeting, so do-not-disturb actions
  and screen-recording tools. The API boundary is explored before this is committed
  to, per the audit's note.
- R7: All of the above come from Electron `powerMonitor` / `screen` plus light native
  commands, register through the R3a substrate, are individually settings-gated, and
  compute on-device only.

## Acceptance Criteria

- [ ] Every signal in this pack has a settings toggle and enters the
      `unavailableSignals` system.
- [ ] Unit tests cover three states per signal: available, unavailable, toggle off.
- [ ] hit-rate@k (the R2 metric) shows no significant regression.
- [ ] No signal here requires a permission the permission registry does not already
      carry; anything that would is deferred rather than added quietly.
- [ ] `research/reco-signals-audit.md` and the digest are updated.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
