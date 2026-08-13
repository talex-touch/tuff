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

- [ ] Every filed issue is **backed by a concrete code location (file:line) and a
  reproducible failure scenario or a cited best-practice/compat rule** — no vibes.
- [ ] Every filed issue carries the `audit` label (enables bulk filter/close) plus a
  domain label and a type label (`bug`/`documentation`/`enhancement`/…).
- [ ] Issues are **deduplicated** across domains before filing.
- [ ] Titles follow the repo's bracketed convention: `[audit/<domain>] <summary>`.
- [ ] A findings ledger (`research/findings.jsonl`) and a filed ledger
  (`research/filed.jsonl`) exist so filing is **resumable** and auditable.
- [ ] Final report states the true count filed, per-domain breakdown, and any
  domains that under-delivered vs. an even split.

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
