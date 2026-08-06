# Full-repo governance audit — outcome

**Date:** 2026-08-06 · **Repo:** talex-touch/tuff (public)

## Result

- **455 open GitHub issues** filed under the `audit` label = **454 unique verified findings**
  (one individual issue each) **+ 1 exploit-chain tracking issue (#838)**.
- **20 near-duplicate issues closed** (same file:line + near-identical title, filed twice across
  consolidation snapshots) — closed as "not planned" with a pointer to the kept issue.
- Issue number range: **#484 – #958**.
- Target was "at least 300" real problems — delivered **454**, no padding.

## Verification bar (met)

Every filed finding carries a concrete `file:line`, a quoted code **evidence** block, and a concrete
**failure scenario**. Findings were produced by domain audit agents under strict "confirmed-only, no
padding" instructions and spot-verified against source across 7 different agents (all matched).
**10 low-confidence findings** are labeled `question` with an explicit "needs repro" banner (incl.
peer-a2's F20 single-instance-guard timing finding).

## Breakdown (454 unique findings, by primary domain label)

| Domain | # | | Domain | # |
|---|--:|---|---|--:|
| main-process | 100 | | tech-debt (architecture) | 26 |
| build-ci | 56 | | i18n | 24 |
| compat | 40 | | rust | 20 |
| security | 35 | | a11y | 15 |
| documentation | 34 | | plugins | 15 |
| sdk | 33 | | renderer | 13 |
| tuffex | 27 | | nexus / test-coverage | 8 / 8 |

Severity: **104 high · 246 medium · 104 low**. (Issues also carry a type label bug/documentation/
enhancement + extra labels, so per-label GitHub counts overlap and exceed these primaries.)

## Bulk management

```bash
gh issue list --label audit --state open --limit 900          # all findings
gh issue list --label audit --label security --state open      # by domain
gh issue list --label audit --label question --state open      # low-confidence (verify first)
# bulk close everything from this sweep if desired:
gh issue list --label audit --state open --json number --jq '.[].number' | xargs -I{} gh issue close {}
```

## Method / tooling (task-local, in scripts/)

- `consolidate.mjs` — merge research/audit/*.jsonl → findings.jsonl; ledger-aware dedup by
  (file, normalized-title) + merge same (file:line) when titles overlap; flags possible dupes vs open issues.
- `audit-file-issues.mjs` — resumable filer: throttled `gh issue create`, rate-limit + transient-network
  retry, `filed.jsonl` ledger, `question` label + banner for low-confidence, exact-title guard against
  created-but-unledgered orphans.
- `reconcile.mjs` — (superseded by the filer's exact-title guard) ledger↔GitHub title reconciliation.
- Findings source of truth: `research/audit/*.jsonl` (per-domain) + `research/findings.jsonl` (consolidated).

## Notable findings

- **#838 exploit chain** (tracking): renderer CSP disabled (#689) → preload bridges raw ipcRenderer
  (#693) → transport handlers on the plugin channel with no default-deny (#688) → shell sink (#687),
  compounded by arbitrary file write (#690) = write-then-execute from renderer XSS or a plugin view.
  (The window/isolation layer itself is well-built; the gap is the capability surface behind it.)
- Privacy disclosure uses AND where 3 sibling copies use OR → misclassifies a provider's data
  destination in the user-facing disclosure.
- Aux-DB migration copies hot tables positionally → column shift / silent row loss.
- `@talex-touch/utils` publishes `main:"index.ts"` (raw TS) → Node 24 can't load the published package.
- tuffex ships CommonJS `dist/lib` inside a `type:"module"` package → `require()` fails.
- 20+ i18n keys referenced by code but absent from both locale files; nav items are non-focusable divs.
