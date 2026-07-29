# Implementation plan: peripheral product documentation repair

## 1. Inventory

1. Enumerate Git-tracked Markdown/MDC documents with explicit product scope and exclusions.
2. Parse inline links/images and resolve relative targets using the design contract.
3. Save a sorted source/line/URL/resolved-target inventory and group findings by owning surface.
4. Route root README findings to Batch B and concurrent-owned findings to their owners without editing them.

## 2. Repair named surfaces

1. Fix CoreApp README links and current package guidance.
2. Fix Search Engine README architecture/navigation while preserving unfinished search-split boundaries.
3. Fix Nexus release/download indexes and bilingual download API navigation.
4. Fix DivisionBox example setup/source/asset references.
5. Fix TuffEx contribution commands and canonical package paths.
6. Repair remaining in-scope tracked product-doc links using canonical targets or remove false promises.

## 3. Focused validation

Rerun the exact read-only tracked-link audit used in inventory and require zero in-scope missing or repository-escape targets. Preserve the command or script invocation and summarized output in PR evidence so Batch D can reproduce it.

```bash
changed_docs=$(git diff --name-only --diff-filter=ACMR "$(git merge-base HEAD master)"..HEAD -- '*.md' '*.mdc')
if test -n "$changed_docs"; then
  npx markdownlint-cli $changed_docs --ignore node_modules
fi

git diff --check
git diff --name-only "$(git merge-base HEAD master)"..HEAD
```

Also verify every new relative target with `git ls-files --error-unmatch -- <target>`. Do not run external-link network checks, formatters, project-wide lint, typecheck, build, or product suites.

## 4. Review gates

- Inspect each new destination for semantic fit, not only existence.
- Confirm no placeholder/redirect-only document was added.
- Confirm root READMEs and all concurrent exclusions are absent from the diff.
- Confirm no product source changed to accommodate stale documentation.
- Hand the final scope and false-positive cases to Batch D.

## 5. Delivery

1. Commit only Batch C owned documents.
2. Push the dedicated branch and open a PR against the planning branch if stacked, otherwise `master`.
3. Include the planning PR dependency, before/after link counts, parser/scope rules, validation output, and deferred owner findings.
4. Do not merge the PR.
