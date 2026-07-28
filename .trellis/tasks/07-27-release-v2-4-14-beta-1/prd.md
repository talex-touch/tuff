# 发布 v2.4.14-beta.1

## Goal

Prepare v2.4.14-beta.1 for publication only after the parent batch gate and release inputs have been satisfied.

## Requirements

- Validate the beta release through the repository release workflow, which publishes `v*-beta*` tags as pre-releases and emits the updater release manifest alongside platform artifacts.
- Do not publish while the parent batch has unresolved child acceptance, and do not treat historical or local artifacts as v2.4.14-beta.1 publication evidence.

## Acceptance Criteria

- [ ] Required release inputs and validation evidence are available for the exact v2.4.14-beta.1 candidate before a publication action is requested.
- [ ] The parent batch gate is satisfied before this child permits publication.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
