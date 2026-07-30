# Design: Validate and publish debug Issues

## 1. Inputs and outputs

Inputs:

- CoreBox `research/report.md` and `research/candidates.md`.
- Nexus `research/report.md` and `research/candidates.md`.
- Parent baseline and evidence policy.
- Current GitHub open/closed Issues and repository labels.

Outputs:

- `research/deduplication.md`.
- `drafts/<product>-<short-slug>.md` for each proposed new Issue.
- A user-approved publication manifest with title, labels, body path, and evidence
  source.
- Verified GitHub Issue URLs.

## 2. Deduplication algorithm

For each confirmed candidate:

1. Normalize the affected user flow, root cause, required outcome, and acceptance
   criteria.
2. Search titles and bodies using the owner module, event/API name, error code, and
   expected outcome.
3. Compare against open and closed Issues, tracker children, and Trellis tasks.
4. Mark `existing` when the acceptance boundary already owns it; mark `new` only when
   it can close independently without changing an existing Issue's completion.
5. Group only candidates with the same root cause and release/verification boundary.

Keyword similarity alone does not decide duplication.

## 3. Issue contract

Suggested body shape:

```markdown
## Priority
## Summary
## Environment and baseline
## Reproduction
## Expected behavior
## Actual behavior
## Evidence
## Impact
## Required outcome
## Acceptance criteria
## Verification
## Non-goals
```

Sections with no useful content may be combined, but evidence, impact, and acceptance
criteria are mandatory. Source links are pinned to the audited commit. Runtime evidence
is summarized without local-only attachment claims.

## 4. Approval boundary

Generate and validate drafts locally, then present the entire proposed publication
manifest. No GitHub mutation occurs before an explicit approval message referring to
that final list. If the user removes or changes a draft, regenerate and present the
updated list before publishing.

## 5. Publication transaction

Create Issues sequentially through `gh issue create --body-file`. After each create,
read it back with `gh issue view --json` and compare title, body, and label names to the
manifest. On mismatch or command failure, stop; retain created URLs and request a
correction decision. Never auto-delete or auto-edit remote content.

## 6. Privacy

Scan drafts for credential/token/cookie terms, signed URL parameters, absolute home
paths, localhost profile paths, raw queries/prompts, and account content. False-positive
technical words may be reviewed manually, but no sensitive value is waived.
