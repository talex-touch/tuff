# PRD — Full-repo governance audit → GitHub issues

## Source request

User asked for a whole-repository governance pass: structure, code, framework,
architecture, docs, docs pages, Rust/native, "all compatibility problems",
best-practice deviations, and potential defects — with **every verified finding
raised as an individual GitHub issue**. Target: **at least 300** findings.

## Decisions (confirmed with user 2026-08-05)

1. **Delivery**: one **individual GitHub issue per finding** (not grouped umbrella issues).
2. **Verification bar**: **real problems only**. No padding, no fabricated issues.
   If genuine findings exceed 300, file them all; if a domain is thin, do not pad.
   Report the **true filed count**.
3. **Orchestration**: run as a Trellis task with parallel domain audit sub-agents.

## Scope (audit domains)

Whole monorepo: `apps/*` (core-app, nexus, reverse-proxy-design, tuff-analyse),
`packages/*` (~24, incl. utils, tuffex, tuff-native Rust, transport, plugin SDK),
`plugins/*` (~23), root tooling/scripts/CI, docs.

## Acceptance criteria

Reconciled against the ledgers and against live GitHub state on 2026-08-20 (#1752).
Method and per-criterion evidence: `research/audit-summary.md` § Reconciliation.

- [x] Every filed issue is **backed by a concrete code location (file:line) and a
  reproducible failure scenario or a cited best-practice/compat rule** — no vibes.
  All 454 findings carry non-empty `file`, `line`, `evidence` and `failure_scenario`.
- [x] Every filed issue carries the `audit` label (enables bulk filter/close) plus a
  domain label and a type label (`bug`/`documentation`/`enhancement`/…).
  475/475 carry `audit` + a domain label. Five carried no type label because the filer
  drops labels the repo does not define; repaired 2026-08-20.
- [ ] Issues are **deduplicated** across domains before filing.
  Not met as worded, and the reconciliation is what shows it. `findings.jsonl` carries no
  duplicate normalized title, but 20 near-duplicates still reached GitHub and were closed
  afterwards — that is post-filing cleanup, not pre-filing deduplication. The trail
  (`possible-dupes.jsonl`, `dup-issues.json`) records the cleanup, not a prevention.
  Closing this needs either a filer that cannot emit them or the criterion reworded to
  "deduplicated, with any survivors reconciled and closed".
- [x] Titles follow the repo's bracketed convention: `[audit/<domain>] <summary>`.
  475/475 match `^\[audit/<domain>\] `.
- [ ] A findings ledger (`research/findings.jsonl`) and a filed ledger
  (`research/filed.jsonl`) exist so filing is **resumable** and auditable.
  Both exist, and the original run was resumable. Scoped to today it is not: `consolidate.mjs`
  rewrote titles after filing began and the ledger key is derived from the title, so 97 findings
  no longer match a ledger entry and would be re-queued on a re-run. They would not become
  duplicates — the filer's live-title guard catches them — but each one costs a GitHub round
  trip and appends a `number: 0, url: "preexisting"` row that does not carry the issue number
  it matched. Auditable: yes. Resumable from the ledger alone: no.
- [x] Final report states the true count filed, per-domain breakdown, and any
  domains that under-delivered vs. an even split.
  Three counts, kept separate because collapsing them is how the earlier numbers drifted:
  **454 unique findings**, **455 issues** once the #838 tracking issue is included, and
  **475 total issue records** in `#484–#958` once the 20 closed near-duplicates are counted.
  The per-domain table is exact against `findings.jsonl`. Under-delivery is measured on the
  454 findings (30.3 per domain), not on the 475 records — nine domains, listed in the
  reconciliation.

## Explicit non-goals

- Not fixing the findings in this task (issues are the deliverable).
- Not filing duplicates of already-open issues (#474–#483 etc.).
- Not padding with invented or non-reproducible "problems" to reach 300.

## Risks

- **Public repo, hard to reverse**: 300 public issues. Mitigation: uniform `audit`
  label for one-command bulk management; resumable ledger; dry-run before firing.
- **GitHub secondary rate limits** on rapid issue creation. Mitigation: throttle +
  backoff + resumable ledger.
- **False positives** from breadth. Mitigation: evidence + failure-scenario required
  per finding; low-confidence findings get a second verification pass or are dropped.
