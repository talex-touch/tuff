# Implementation Plan: Validate and publish debug Issues

## 1. Dependency gate

- [x] Confirm both debugging child tasks are complete and their reports/candidate
      ledgers exist.
- [x] Re-fetch `origin/master`; revalidate or discard findings affected by later
      product changes.
- [x] Record the final audited commit and repository label inventory.

## 2. Revalidate confirmed candidates

- [x] Read the reproduction, complementary evidence, source history, impact, and
      severity for every confirmed candidate.
- [x] Reject any candidate lacking current reachability, deterministic proof, an
      actionable owner, or one testable acceptance boundary.
- [x] Group same-root-cause symptoms and split independent outcomes.

## 3. Deduplicate

Use bounded searches for every candidate:

```bash
gh issue list --repo talex-touch/tuff --state open --search '<terms>' \
  --limit 100 --json number,title,body,labels,url
gh issue list --repo talex-touch/tuff --state closed --search '<terms>' \
  --limit 100 --json number,title,body,labels,url
rg -n '<owner|event|error-code>' .trellis/tasks docs/plan-prd apps packages
```

- [x] Write `research/deduplication.md` with one decision and reason per candidate.
- [x] Link duplicates in the final summary only; do not create or comment remotely.

## 4. Draft and validate

- [x] Create one `drafts/*.md` per unique candidate using pinned source links.
- [x] Check title/label precedent against recent evidence-first Issues.
- [x] Validate Markdown, source links, command accuracy, acceptance criteria, and
      non-goals.
- [x] Scan drafts for secrets, cookies, tokens, signed queries, personal/temporary
      paths, raw queries/prompts, and private content.
- [x] Produce the final publication manifest.

## 5. User approval gate

- [x] Present every exact title, severity, labels, deduplication result, and full body.
- [x] Pause and wait for explicit approval of that exact manifest.
- [x] Apply requested edits locally and repeat the gate if the list changes.

## 6. Publish sequentially

For each approved manifest entry:

```bash
gh issue create --repo talex-touch/tuff \
  --title '<approved title>' \
  --label '<approved labels>' \
  --body-file '<approved draft path>'
gh issue view '<returned number>' --repo talex-touch/tuff \
  --json number,title,body,labels,state,url
```

- [x] Compare remote title/body/labels byte-for-byte or semantically where GitHub
      normalizes line endings.
- [x] Stop on the first error or mismatch; do not auto-edit/delete/close.
- [x] Record every verified URL in the publication manifest.

## 7. Final validation

```bash
git diff --check -- .trellis/tasks/07-28-publish-corebox-nexus-issues
python3 ./.trellis/scripts/task.py validate 07-28-publish-corebox-nexus-issues
git status --short
```

Summarize published URLs, canonical existing Issues, excluded observations, evidence
gaps, and confirmation that no unapproved remote mutation occurred.
