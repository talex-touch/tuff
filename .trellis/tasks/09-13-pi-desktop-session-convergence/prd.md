# PI Desktop session convergence and migration audit

## Goal

Complete the two deferred PI-Desktop-inspired session capabilities, then reassess the remaining transferable PI-Desktop product and safety contracts against the current Tuff implementation.

## Deliverables

1. `09-13-external-native-session-adoption`: explicitly discover and adopt provider-owned Pi, OMP, Claude Code, and Codex sessions for one existing canonical Tuff Project without importing transcripts.
2. `09-13-pi-native-session-authority`: make Home conversations routed to the local Pi provider continue a native Pi session rather than replaying the complete Home transcript on every turn.
3. `09-13-pi-desktop-migration-audit`: update the evidence-based gap map after both implementations and identify the next migration candidates by value, cost, overlap, and trust risk.

## Cross-Child Requirements

- Provider transcripts remain authoritative and are never copied into Local AI pointer rows.
- Renderer and sync boundaries never expose native session ids, session paths, expected heads, or transcript content.
- One project remains one canonical existing directory; discovery cannot create arbitrary projects or accept renderer paths.
- Existing Home conversations and cross-device sync remain readable. Legacy or remote Home conversations may seed a fresh local Pi session once; normal continuation sends only the newest user turn.
- All provider continuation remains fail-closed on mismatched identity, missing storage, conflict, or an active lease.
- PI-Desktop LGPL source is used only as behavioral evidence. Tuff implementation is independently written.

## Acceptance Criteria

- [x] Each child has its own requirements and observable verification evidence.
- [x] The two implementation children pass focused tests, typechecks, privacy checks, and isolated runtime acceptance.
- [x] The audit distinguishes implemented, overlapping, worthwhile, deferred, and rejected PI-Desktop capabilities with repository and upstream source evidence.
- [x] Directly affected engineering documentation no longer claims that Home Pi always uses `--no-session` or that external session adoption is wholly absent.
