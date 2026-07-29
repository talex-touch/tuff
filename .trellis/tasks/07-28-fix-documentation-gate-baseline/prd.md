# Fix documentation gate baseline

## Goal

Repair the genuine documentation-gate prerequisite diagnostics from PR #359 without changing verifier or production code.

## Requirements

- Replace only the prerequisite diagnostics identified by PR #359: unresolved active-PRD placeholders and directory links that lack a tracked canonical file or documented directory entry.
- Keep verifier and production code unchanged; preserve the separately owned A/B/C documentation content, bilingual release material, OTA metadata, and task statuses.
- Validate the repaired documentation against the focused link and placeholder checks, Trellis task validation, Markdown linting, and whitespace diff checks.

## Acceptance Criteria

- [ ] Each of the eight active-PRD placeholders is replaced with a factual goal, requirement, or acceptance criterion grounded in its task metadata and repository context.
- [ ] Each repaired directory link resolves to a tracked canonical file or tracked README/index entry without weakening its source document's ownership or status.
- [ ] The focused documentation checks and `git diff --check` pass, and a dedicated PR targets `TalexDreamSoul/docs-remediation-integration`.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
