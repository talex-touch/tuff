# Design — Full-repo governance audit → GitHub issues

## Approach

Parallel **domain audit agents** (Explore/general-purpose) each sweep one slice of
the repo and emit a JSONL of verified findings. A consolidation step dedupes and
normalizes them. A **resumable filing script** turns each surviving finding into one
GitHub issue via `gh`, recording results to a ledger.

## Audit domains (one agent each)

| # | Domain label | Coverage |
|---|--------------|----------|
| 1 | `main-process` | core-app `src/main/**` incl. box-tool/search-engine, modules, core, db |
| 2 | `renderer` | core-app `src/renderer/**` Vue views/components/composables |
| 3 | `rust` | `packages/tuff-native/**` all crates + build.rs + napi bindings |
| 4 | `security` | IPC, path traversal, Electron sandbox/contextIsolation, secrets, injection, plugin isolation |
| 5 | `compat` | Node 24 / Electron 41 / Vue 3.5 / Nuxt 4 / Vite 7 engine + dep version mismatches, overrides, Dependabot 51 |
| 6 | `packages/utils` + transport + plugin SDK | shared types/contracts |
| 7 | `tuffex` | component library |
| 8 | `nexus` | Nuxt docs/ecosystem site: SSR, routes, content, config |
| 9 | `plugins` | ~23 plugins: manifest/prelude correctness, common pitfalls |
| 10 | `build-ci` | root scripts, `.github/workflows`, eslint/tsconfig/build config |
| 11 | `documentation` | README/ROADMAP/CLAUDE.md/AGENTS.md, apps/docs, docs pages |
| 12 | `test-coverage` | missing/weak tests across packages |
| 13 | architecture/`tech-debt` | cross-module coupling, lifecycle, dead code, duplication |
| 14 | `a11y` + `i18n` | renderer + nexus accessibility & localization gaps |

Agents run in batches to respect the concurrency envelope. Each agent is told the
verification bar and the exact output schema, and to **only report confirmed findings
with evidence**.

## Finding schema (`research/<domain>.jsonl`, one object per line)

```json
{
  "domain": "main-process",
  "title": "concise imperative summary (no bracket prefix; script adds it)",
  "severity": "high | medium | low",
  "type_label": "bug | documentation | enhancement",
  "extra_labels": ["performance"],
  "file": "apps/core-app/src/main/....ts",
  "line": 123,
  "category": "correctness | security | compat | perf | a11y | ...",
  "evidence": "exact code quote or config line proving the defect",
  "failure_scenario": "concrete inputs/state -> wrong output/crash/violation",
  "recommendation": "what to change",
  "confidence": "confirmed | plausible"
}
```

## Consolidation & dedup

- Merge all `research/*.jsonl` into `research/findings.jsonl`.
- Drop entries missing `file`, `evidence`, or `failure_scenario`.
- Drop `confidence: plausible` unless it survives a spot re-check; prefer dropping over guessing.
- Dedup key: normalized `(file, lowercased title minus stopwords)`; keep highest severity.
- Cross-check titles against currently-open issues (#474–#483 + any others) to avoid dupes.

## Issue shape

- **Title**: `[audit/<domain>] <title>` (mirrors repo `[Bug]` / `[tuffex]` convention).
- **Labels**: `audit` + domain label + `type_label` + any `extra_labels`.
- **Body**: severity, `file:line`, evidence block, failure scenario, recommendation,
  and a footer noting it came from the automated governance audit sweep (traceable/bulk-manageable).

## Filing (resumable)

`scripts/audit-file-issues.mjs` (task-local, not committed to product):
1. Read `research/findings.jsonl` + existing `research/filed.jsonl`.
2. Skip any finding whose dedup key is already in `filed.jsonl`.
3. `gh issue create --title --body --label ...`; append `{key, number, url}` to `filed.jsonl`.
4. Sleep ~2s between creates; on HTTP 403/429 exponential backoff; `--dry-run` mode prints without creating.

## Rollback

All issues share the `audit` label →
`gh issue list --label audit --json number | ... | gh issue close` reverses the sweep.
