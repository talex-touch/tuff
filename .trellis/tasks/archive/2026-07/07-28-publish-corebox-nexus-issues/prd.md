# Validate and publish debug issues

## Goal

Integrate the completed CoreBox and Nexus debugging reports, retain only confirmed and
unique defects, present complete GitHub Issue drafts for explicit user approval, and
publish only the approved Issues to `talex-touch/tuff` with verified URLs and labels.

## Dependencies

This task must not start until both tasks are complete:

- `07-28-debug-corebox-end-to-end`
- `07-28-debug-nexus-end-to-end`

Both must provide `research/report.md` and `research/candidates.md` with every
observation classified.

## Requirements

### R1. Cross-product validation

- Recheck each confirmed candidate against its runtime/contract evidence and exact
  default-branch commit.
- Group multiple symptoms sharing one root cause and acceptance boundary into one
  Issue; split unrelated fixes even when they affect the same product.
- Exclude known/duplicate, environment-only, unsupported-platform, speculative,
  style-only, and non-repeatable observations.

### R2. Final deduplication

- Search open and closed GitHub Issues, active and archived Trellis tasks, living
  audits, recent commits, and current source for each candidate.
- Record why a finding is new or which existing Issue owns it in
  `research/deduplication.md`.
- Do not create a new Issue when an existing Issue's acceptance criteria necessarily
  resolve the finding. Do not comment on the existing Issue without separate approval.

### R3. Draft quality

- Store one body per proposed Issue under `drafts/`.
- Use an evidence-first structure: priority/summary, audited commit/environment,
  reproduction, expected/actual, evidence/source links, impact, required outcome,
  acceptance criteria, verification, and non-goals where useful.
- Use stable GitHub source links pinned to the audited commit, not local filesystem
  paths or mutable branch links.
- Use only existing labels: normally `bug`, with `javascript`, `documentation`, or
  `enhancement` only when the evidence and repository precedent justify them.
- Include no secrets, cookies, tokens, signed query values, personal paths, raw user
  content, or private evidence locations.

### R4. Approval and publication

- Present title, severity, labels, duplicate result, and full body for every draft.
- Wait for explicit user approval of the final list. Approval to debug or create this
  Trellis task is not publication approval.
- Publish one Issue at a time, verify its URL/title/body/labels, and stop on the first
  mismatch. Do not edit, close, or delete a published Issue automatically.

## Acceptance Criteria

- [x] Both child reports are complete and every candidate has evidence and a final
      classification.
- [x] `research/deduplication.md` maps every confirmed candidate to either one
      canonical existing Issue or one new draft.
- [x] Every draft has pinned source links, deterministic reproduction, impact,
      severity rationale, and testable acceptance criteria.
- [x] A secret/privacy scan of all drafts and summaries passes.
- [x] The user explicitly approves the exact final Issue publication list.
- [x] Every approved Issue is created with the expected title/body/labels and its URL
      is verified remotely.
- [x] The final summary lists new URLs, reused existing Issues, excluded observations,
      and remaining evidence gaps.

## Out of Scope

- Fixing defects, changing source/tests, closing or editing existing Issues, creating
  labels, assigning milestones/projects, or posting comments without separate
  approval.
