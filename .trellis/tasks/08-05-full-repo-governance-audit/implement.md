# Implement — Full-repo governance audit → GitHub issues

## Ordered execution

1. **Infra** ✅ create `audit` + domain labels; create Trellis task; write prd/design.
2. **Filing script**: `scripts/audit-file-issues.mjs` with `--dry-run`, throttle,
   backoff, resumable ledger (`research/filed.jsonl`).
3. **Fan out audit agents** (batches) → each writes `research/<domain>.jsonl`.
   Prompt each with: scope, the finding schema, and the bar
   ("confirmed only, evidence + failure scenario required, no padding").
4. **Consolidate**: merge → `research/findings.jsonl`; drop schema-incomplete and
   low-confidence entries; dedup; cross-check open issues.
5. **Dry-run** the filing script; sanity-check titles/labels/count.
6. **File** for real; watch for rate-limit backoff; resume if interrupted.
7. **Report** true count + per-domain breakdown; update spec/journal; commit task artifacts.

## Validation commands

```bash
# count consolidated findings
wc -l research/findings.jsonl
# schema sanity (every line parses + has required keys)
node -e "require('fs').readFileSync('research/findings.jsonl','utf8').trim().split('\n').forEach(l=>{const o=JSON.parse(l);['file','title','evidence','failure_scenario'].forEach(k=>{if(!o[k])throw new Error('missing '+k+': '+l)})})"
# dry run
node scripts/audit-file-issues.mjs --dry-run | head -40
# verify filed count matches
wc -l research/filed.jsonl
gh issue list --label audit --state open --limit 400 | wc -l
```

## Review gates

- Before real filing: manual eyeball of first ~20 dry-run issue bodies.
- Bar check: any finding without a real code quote in `evidence` is dropped, not softened.

## Rollback points

- Pre-filing: nothing external created; delete task-local artifacts only.
- Mid/post-filing: `gh issue list --label audit ... | gh issue close` bulk-closes the sweep.
