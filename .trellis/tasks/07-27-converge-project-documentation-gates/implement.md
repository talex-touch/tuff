# Implementation plan: project documentation convergence

## Phase 0 - Planning PR

1. Create the parent and four child task directories only.
2. Converge each PRD into goal, facts, requirements, acceptance criteria, and exclusions.
3. Add technical design, ordered implementation plan, and curated implementation/check manifests to every task.
4. Validate all manifests and parent/child metadata.
5. Confirm the diff contains no product documentation, existing task, bilingual task, or OTA parent changes.
6. Commit, push `TalexDreamSoul/docs-remediation-plan`, and open a PR to `master` without merging it.

## Phase 1 - Parallel documentation convergence

1. Start A in a dedicated worktree to converge TODO/Trellis state and preserve the search-index split warning.
2. Start B independently to refresh roadmap/release/evidence/CHANGES/root README claims.
3. Start C independently to repair tracked product-doc links and named peripheral surfaces.
4. Keep PR file ownership disjoint; route cross-batch findings to the owning child.
5. Each child runs only its focused documentation and Trellis checks, then opens a dedicated PR without merging.

## Phase 2 - Quality gate

1. Wait for A, B, C, and the bilingual What's Changed contract.
2. Build a stacked integration branch containing all prerequisites.
3. Implement one deterministic read-only documentation verifier and focused fixtures.
4. Invoke the same entrypoint locally and from CI.
5. Open D as a draft stacked PR with prerequisite links; do not merge.
6. Rebase on `master` after prerequisites land and rerun the complete gate before review.

## Phase 3 - Parent integration review

1. Verify each changed path has exactly one child owner.
2. Verify historical/current/packaged/production labels are consistent across active documents.
3. Verify the bilingual task and OTA parent metadata were never absorbed.
4. Record child PR URLs, commits, validation evidence, and remaining blockers in parent metadata.
5. Close the parent only when all program acceptance criteria are externally verifiable.

## Planning validation

```bash
for task in \
  .trellis/tasks/07-27-converge-project-documentation-gates \
  .trellis/tasks/07-27-docs-sot-convergence \
  .trellis/tasks/07-27-roadmap-release-docs \
  .trellis/tasks/07-27-peripheral-docs-cleanup \
  .trellis/tasks/07-27-documentation-quality-gates
do
  python3 ./.trellis/scripts/task.py validate "$task"
done

python3 ./.trellis/scripts/task.py list
git diff --check
git diff --name-only master...HEAD
```

The final path list must contain only the five new task directories. Run no formatter, product test suite, or documentation implementation command in the planning PR.

## Review and rollback points

- Stop before commit if any existing path appears in the diff.
- Stop before push if parent/child links are asymmetric or a manifest is seed-only.
- Stop D if any prerequisite PR or bilingual contract is missing.
- Roll back the planning change by reverting its single scoped commit; do not reset or clean unrelated worktrees.
