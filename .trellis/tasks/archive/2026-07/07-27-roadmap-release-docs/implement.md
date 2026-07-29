# Implementation plan: roadmap and release documentation refresh

## 1. Establish authoritative facts

1. Read current root/CoreApp package metadata and release configuration without copying dependency versions into prose.
2. Inventory active AI claims against the historical 13/13 manifest and strict current-version verifier contract.
3. Locate exact beta.19 Gate E evidence and separate each signed-asset/manifest/Nexus fact from OTA lifecycle evidence.
4. Record the concurrent bilingual task's owned paths and keep them out of the change set.

## 2. Converge evidence and roadmap

1. Update AI active summaries to say historical 13/13 and current recapture open where applicable.
2. Update the R1 release matrix with exact beta.19 Gate E results and explicit residual OTA status.
3. Align related roadmap/evidence summaries with the same terminology.
4. Qualify active R6 labels by owning program without renumbering local requirements or history.

## 3. Refresh CHANGES and root READMEs

1. Add concise CHANGES entries for Everything, app-icon self-healing, release integrity, and OTA status.
2. Align English and Chinese root README stable `2.4.13` claims and support boundaries.
3. Remove stale hand-maintained dependency version numbers; point readers to authoritative manifests or commands.
4. Confirm no What's Changed or stable release-note prose was copied or edited.

## 4. Focused validation

```bash
mise run ai-docs:dev

changed_markdown=$(git diff --name-only --diff-filter=ACMR "$(git merge-base HEAD master)"..HEAD -- '*.md' '*.mdc')
if test -n "$changed_markdown"; then
  pnpm exec markdownlint-cli $changed_markdown --ignore node_modules
fi

git diff --check
git diff --name-only "$(git merge-base HEAD master)"..HEAD
```

Run the focused relative-link audit over changed owned documents and verify every version/evidence claim against its cited source. Do not run formatters, project-wide lint, product tests, release publication, or production mutation.

## 5. Review gates

- Search the final diff for unqualified historical/current "passed" language.
- Confirm Gate E and OTA statuses are represented independently.
- Confirm README dependency versions were removed rather than refreshed to another soon-stale snapshot.
- Confirm only Batch B owned paths changed and all concurrent exclusions are clean.

## 6. Delivery

1. Commit only Batch B files.
2. Push the dedicated branch and open a PR against the planning branch if stacked, otherwise `master`.
3. Include the planning PR dependency, exact evidence sources, validation output, owned files, and excluded bilingual/OTA paths.
4. Do not merge the PR.
