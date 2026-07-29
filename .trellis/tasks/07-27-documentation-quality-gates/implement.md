# Implementation plan: documentation quality gates

## 0. Confirm prerequisites and baseline

1. Record the A, B, C, and bilingual PR URLs plus exact commits in the draft PR dependency ledger.
2. Build the integration branch from those exact commits and verify their owned-path sets do not overlap.
3. Confirm both root READMEs occur only in Batch B; confirm the bilingual task and OTA parent `task.json` are clean.
4. Run the existing Markdown CI command, `mise run ai-docs:dev`, focused Batch C link audit, Trellis validation, and release-note inventory to capture the pre-gate baseline.
5. Stop if any prerequisite is absent or still failing its own acceptance criteria.

## 1. RED - define fixture contracts

1. Create a minimal repository-shaped fixture harness with an injected sorted tracked-file set.
2. Add one passing aggregate fixture and poison files under every excluded scope.
3. Add failing fixtures for recursive Markdown/MDC lint, missing links, decoded links, repository escapes, and untracked targets.
4. Add failing fixtures for malformed/duplicate tasks, parent-child asymmetry, missing assignee/meta, active completed tasks, archived incomplete tasks, and TODO reference drift.
5. Add passing legacy `2.4.13` and failing post-baseline fixtures for missing/empty/wrong-version bilingual notes, invalid sections, and mismatched section/bullet shape.
6. Add failing fixtures for historical AI evidence promoted to current and current recapture claimed without exact-version evidence.
7. Add failing fixtures and controls for active PRD placeholders, intentional examples, backlog wording, and allowlist rationale.
8. Add output sorting/cap, repeat-run byte identity, and read-only repository-state assertions.
9. Run the focused tests and confirm the new cases fail for the intended stable rule IDs before implementation.

## 2. GREEN - build the shared verifier

1. Implement one `git ls-files` scope registry and explicit product/task/archive/PRD projections.
2. Implement the shared diagnostic/result model, stable sort, display cap, total counts, and exit aggregation.
3. Wire a declared fixed-version Markdown lint/parser toolchain; remove any runtime `npx` download dependency.
4. Implement AST inline link/image resolution with URL classification, decoding, query/fragment removal, repository-escape rejection, and tracked-target checks.
5. Implement structured Trellis JSON graph, metadata, completion, and Batch A TODO-reference rules.
6. Reuse `scripts/lib/release-notes-contract.mjs` to enforce only post-baseline current-version bilingual release-note coverage and guide checks.
7. Refactor or export existing AI checks into one shared implementation consumed by the canonical command and any retained `ai-docs:dev` compatibility wrapper.
8. Implement active PRD discovery, placeholder matchers, and structured rationale-bearing allowlist.
9. Make every focused fixture pass without broadening exclusions beyond the reviewed registry.

## 3. REFACTOR - expose one command and CI path

1. Add `mise run docs:verify` as the only public complete documentation command.
2. Make the command run focused verifier tests followed by the real repository verification.
3. Replace the changed-only root Markdown job with the canonical command after the normal frozen install.
4. Consolidate or retire the standalone AI docs workflow so CI contains no second AI or Markdown rule implementation.
5. Update `.github/workflows/README.md` only if needed to describe the new canonical gate and its read-only permissions.
6. Search for stale workflow/script invocations and ensure any compatibility alias delegates to the canonical implementation.

## 4. Full validation

```bash
mise run docs:verify
mise run docs:verify > /tmp/docs-verify-1.out 2> /tmp/docs-verify-1.err
mise run docs:verify > /tmp/docs-verify-2.out 2> /tmp/docs-verify-2.err
cmp /tmp/docs-verify-1.out /tmp/docs-verify-2.out
cmp /tmp/docs-verify-1.err /tmp/docs-verify-2.err

git diff --check
git status --porcelain --untracked-files=all
```

Also run the exact focused test command directly, lint only changed verifier sources, validate changed workflow YAML, and inspect the final diff for network calls, filesystem writes, dynamic downloads, absolute paths, timestamps, and duplicate AI/Markdown rule lists.

## 5. Review gates

- Verify every rule consumes the shared tracked scope or an explicit active/archive projection.
- Verify diagnostics retain total counts when display is capped and are stable across OS path separators.
- Verify excluded-scope poison fixtures pass while an equivalent product-doc fixture fails.
- Verify a failing prerequisite document is reported, not edited in Batch D.
- Verify root READMEs remain Batch B-owned and absent from the Batch D diff.
- Verify concurrent bilingual task metadata and OTA parent `task.json` remain untouched.
- Verify CI uses one canonical command and read-only permissions.

## 6. Delivery and rollback

1. Commit only Batch D verifier, fixtures, dependency metadata, mise task, and workflow surfaces.
2. Push the dedicated branch and open a draft stacked PR listing all four prerequisite PR URLs/commits and the planning PR.
3. Do not merge while any prerequisite is unmerged; after they land, rebuild or rebase onto current `master` and rerun the full command.
4. Include deterministic output, fixture coverage, scope/exclusion policy, files, and rollback notes in the PR.
5. Roll back by reverting the single Batch D enforcement commit; do not weaken evidence or task-state rules and do not reset unrelated worktrees.
