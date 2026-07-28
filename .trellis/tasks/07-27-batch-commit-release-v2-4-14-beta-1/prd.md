# 分批提交并发布 v2.4.14-beta.1

## Goal

Coordinate the ordered v2.4.14-beta.1 release batch after its child release work supplies the required inputs and acceptance evidence.

## Requirements

- Keep this parent limited to the batch order and child release gate; it does not authorize publishing while the release child has unresolved acceptance criteria.
- Use the repository release workflow as the publication mechanism: beta tags are pre-releases, and the workflow synchronizes release metadata for normal tag pushes or through `workflow_dispatch.sync_tag` when an existing tag needs recovery or resynchronization.

## Acceptance Criteria

- [ ] The child `07-27-release-v2-4-14-beta-1` has completed its release-input and validation acceptance criteria before the parent batch starts.
- [ ] The batch records release evidence from the task-local release artifacts and preserves the workflow's manifest and metadata gates.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
