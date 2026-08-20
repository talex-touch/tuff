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

## Reconciliation (2026-08-20, #1752)

Every number above was re-derived from the ledgers and checked against live GitHub state, because
"454 findings were filed" is a claim the ledgers alone cannot settle — they record what the filer
believed, not what exists.

**The counts hold.** All 15 domain rows match `findings.jsonl`'s `domain_label` exactly, with zero
delta on any row; severity matches at 104 high / 246 medium / 104 low. All 454 findings resolve to a
live `audit`-labelled issue by normalized title (454/454), and 475/475 issues in `#484–#958` match
the `[audit/<domain>]` title convention. The `475 = 454 + 1 tracking (#838) + 20 closed
near-duplicates` arithmetic reconciles against GitHub, so the "455 open" line above is the same
number counted before the near-duplicates were closed.

Three defects were found, one repaired and two recorded:

**Five issues carried no type label** — #786, #789, #801, #802, #806. Root cause is not an oversight
in the findings: their ledger `type_label` values are `build`, `refactor`, `chore` and
`compatibility`, none of which exist as labels in this repo, and `audit-file-issues.mjs` deliberately
"discover[s] which labels actually exist so `gh` never rejects an unknown one" — so it dropped them
silently. Repaired 2026-08-20 by mapping onto the existing vocabulary (`tech-debt` ×3, `bug`, `compat`).
The general lesson is that the filer should report labels it drops rather than swallow them.

**The ledgers no longer join.** `consolidate.mjs` rewrote titles after filing had begun, and `key`
is derived from `(file, normalized-title)`. Joining `findings.jsonl` to `filed.jsonl` by key today
matches only 357 of 454 — 97 findings appear unfiled and 117 filed entries appear orphaned, both
artefacts of that rewrite rather than real gaps (GitHub shows all 454 filed). The consequence is
narrow but real: the "resumable" property held for the original run and would **not** hold for a
re-run, which would refile the 117. Anything resuming this ledger must match on normalized title
against live issues, the way `reconcile.mjs` does, not on `key`.

**One ledger row has `number: 0`** — a filing failure recorded as success. Harmless here because the
finding was filed on a later pass, but it means `filed.jsonl` row count (474) is not a filed count.

**Under-delivery vs an even split** (475 ÷ 15 = 31.7 per domain): `test-coverage` 8, `nexus` 8,
`renderer` 13, `plugins` 15, `a11y` 15, `rust` 20, `i18n` 24, `tuffex` 27. Per the PRD's "if a domain
is thin, do not pad" rule these are reported, not corrected — but `renderer` at 13 against
`main-process` at 100 is a coverage asymmetry worth a second pass rather than a conclusion that the
renderer is eight times healthier.

One claim above is true on GitHub but unrecorded in the ledger: **10 issues carry the `question`
label** for low confidence, as stated, yet no finding has `question` in its `extra_labels`. The
label was applied at filing time only, so the ledger cannot tell you which ten they are —
`gh issue list --label audit --label question` can.

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
