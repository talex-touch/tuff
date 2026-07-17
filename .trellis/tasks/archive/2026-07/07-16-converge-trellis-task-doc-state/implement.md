# Implementation Plan: Trellis task and documentation convergence

1. Parse every active task's status, parent/children links, assignee, metadata, and PRD acceptance counts.
2. Split tasks into confirmed-complete archive candidates and genuinely open retained work.
3. Present the exact move set and obtain confirmation for filesystem archiving.
4. Archive child tasks first, then parents, always with `task.py archive --no-commit`.
5. Recompute the active tree and add next-action/blocker/evidence metadata only to retained tasks.
6. Update `TODO.md`, navigation, roadmap, stability, and change-log facts so global ordering has one owner and no live repository-state claims.
7. Validate task JSON, parent/child display, active-count invariants, Markdown links/whitespace, and AI docs contracts.
