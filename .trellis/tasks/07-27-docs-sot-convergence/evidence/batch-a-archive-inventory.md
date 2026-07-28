# Batch A archive inventory

Reviewed before archive. Each candidate has `task.json.status = completed`, all PRD acceptance criteria checked, and task-local concrete evidence. No task is selected by age, merge state, or owner activity.

| Source task | Evidence basis | Destination |
| --- | --- | --- |
| `.trellis/tasks/07-09-scope-search-sessions-and-streams` | 11/11 PRD checks; task evidence | `.trellis/tasks/archive/2026-07/07-09-scope-search-sessions-and-streams` |
| `.trellis/tasks/07-17-configuration-sqlite-sot` | 9/9 PRD checks; task evidence | `.trellis/tasks/archive/2026-07/07-17-configuration-sqlite-sot` |
| `.trellis/tasks/07-17-transport-messageport-lanes` | 6/6 PRD checks; task evidence | `.trellis/tasks/archive/2026-07/07-17-transport-messageport-lanes` |
| `.trellis/tasks/07-17-transport-typed-event-hard-cut` | 6/6 PRD checks; task evidence | `.trellis/tasks/archive/2026-07/07-17-transport-typed-event-hard-cut` |
| `.trellis/tasks/07-17-transport-legacy-cutover-evidence` | 6/6 PRD checks; task evidence | `.trellis/tasks/archive/2026-07/07-17-transport-legacy-cutover-evidence` |
| `.trellis/tasks/07-17-transport-wave-a` | 8/8 PRD checks; task evidence; archived after its three children | `.trellis/tasks/archive/2026-07/07-17-transport-wave-a` |
| `.trellis/tasks/07-18-plugin-package-policy` | 7/7 PRD checks; task evidence | `.trellis/tasks/archive/2026-07/07-18-plugin-package-policy` |
| `.trellis/tasks/07-18-plugin-tuffex-supply-chain` | 6/6 PRD checks; task evidence; archived after its child | `.trellis/tasks/archive/2026-07/07-18-plugin-tuffex-supply-chain` |

Hard exclusions: `.trellis/tasks/07-27-bilingual-whats-changed/` and `.trellis/tasks/07-17-unify-ota-update-flow/task.json` are concurrently owned and not changed by this batch.
