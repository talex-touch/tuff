# Design: project documentation convergence

## 1. Task graph

```text
planning PR
   |
   +-- A: docs-sot-convergence --------+
   +-- B: roadmap-release-docs --------+--> D: documentation-quality-gates
   +-- C: peripheral-docs-cleanup -----+          ^
                                                  |
                                  bilingual What's Changed PR
```

The parent is a coordination container. A, B, and C own disjoint document sets. D consumes their converged state and the concurrent bilingual contract; it does not re-own their prose.

## 2. Ownership boundaries

| Child | Owned surfaces | Explicit exclusions |
| --- | --- | --- |
| A | `docs/plan-prd/TODO.md`, root `todo.md` migration, completed-task archive moves, retained task metadata | concurrent bilingual task, OTA parent `task.json`, production source |
| B | Roadmap/evidence/CHANGES, `README.md`, `README.zh-CN.md` | What's Changed and stable release-note files, OTA parent `task.json` |
| C | Tracked product-doc links, CoreApp/Search/Nexus/DivisionBox/TuffEx documentation | both root READMEs, agent/Trellis/runtime/generated/raw evidence |
| D | Documentation verifier, focused fixtures, local command, CI invocation | prose rewrites owned by A/B/C or the bilingual task |

A changed path must have one owner. Cross-batch findings are reported to the owner instead of being fixed opportunistically.

## 3. Source-of-truth hierarchy

- Global execution order: `docs/plan-prd/TODO.md`.
- Task-local scope and completion: active Trellis `task.json` plus its PRD acceptance criteria.
- Current application version: repository package metadata at execution time.
- Historical evidence: immutable dated reports and their manifests.
- Packaged evidence: exact-version packaged artifacts and verifier output.
- Production evidence: observed GitHub/Nexus/deployed endpoints, never local simulation.
- Stable release wording: release contract and existing published evidence; the concurrent bilingual task owns user-facing What's Changed content.

When two sources disagree, the lower-authority document is corrected or explicitly labeled historical. Evidence files are not rewritten merely to make an active summary pass.

## 4. Branch and PR model

1. This planning branch targets `master` and contains only Trellis artifacts.
2. A, B, and C branch from the planning commit or its merged `master` equivalent. Their PRs remain independent and declare any temporary stacked base.
3. D creates an integration branch containing A, B, C, and the bilingual contract. Its PR stays draft while prerequisites are unmerged.
4. After prerequisites merge, D is rebased or rebuilt on current `master`, reruns the full gate, and becomes reviewable.

This preserves parallelism without pretending parent/child links are dependency edges. Dependency order is written in D's PRD and implementation plan.

## 5. Gate contract

Batch D provides one read-only command used identically by developers and CI. It must:

- enumerate deterministic, Git-tracked scopes;
- sort diagnostics and cap verbose output while retaining total counts;
- avoid network access and filesystem mutation;
- exclude `.pen`, dependencies, generated output, runtime state, and raw evidence from product-doc parsing;
- validate active Trellis and release/evidence contracts in their dedicated scopes;
- return non-zero for every contract violation.

Focused fixtures prove each failure mode and a valid repository-shaped case. CI invokes the same command rather than duplicating rule logic in YAML.

## 6. Compatibility and rollback

All implementation PRs are documentation or validation-only and can be reverted independently.

- A records exact archive moves so rollback restores directories and parent links without losing history.
- B and C revert as normal document patches.
- D is introduced after the repository passes; if a false positive blocks unrelated work, revert the D PR rather than weakening evidence or link rules silently.
- Existing changed-only Markdown CI remains until the replacement command is proven, then is removed in the same D PR to avoid two drifting gate definitions.

## 7. Integration review

The parent closes only after reviewing all four implementation PRs together for path ownership, evidence-class consistency, prerequisite links, and passing final gate output. The coordinator records PR URLs and final disposition in parent metadata; no child merge is performed by this plan.
