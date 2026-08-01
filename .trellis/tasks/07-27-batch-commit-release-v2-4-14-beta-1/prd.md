# 分批提交并发布 v2.4.14-beta.1

## Goal

Coordinate the post-publication evidence review for v2.4.14-beta.1 after the release child has completed the authorized publication workflow.

## Requirements

- Keep this parent limited to post-publication evidence aggregation; publication authorization and execution belong to the release child.
- Use the repository release workflow as the publication mechanism: beta tags are pre-releases, and the workflow synchronizes release metadata for normal tag pushes or through `workflow_dispatch.sync_tag` when an existing tag needs recovery or resynchronization.

## Acceptance Criteria

- [ ] The child `07-27-release-v2-4-14-beta-1` completes its release, Nexus sync, and Cloudflare deployment acceptance criteria.
- [ ] The parent records the child's final GitHub Release, manifest, Nexus, Cloudflare, and online smoke evidence without acting as a circular publication prerequisite.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
