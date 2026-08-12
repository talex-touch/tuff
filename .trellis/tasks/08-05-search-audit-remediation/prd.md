# CoreBox search audit remediation

## Goal

Parent task for the 2026-08-06 three-way search audit remediation. Owns the audit
findings as requirement source and the batch A-C task map; children are independently
verifiable deliverables.

## Requirements

- Requirement source: [research/audit-findings-digest.md](research/audit-findings-digest.md)
  (durable digest of the three audit reports with file:line anchors and the full
  batch A/B/C task map). Child tasks reference finding IDs (E-*/A-*/F-*) from it.
- Batch A children (created, execution order): 08-05-semantic-catalog-token-boundary →
  08-05-search-sort-reaches-ui → 08-05-file-index-data-safety →
  08-05-keyword-charset-unification.
- Batches B/C are created as new children only when batch A lands (see digest task map).
- Ordering constraints: scoring-rebalance (batch C) must wait for
  search-sort-reaches-ui; ngram-cjk-infix (batch B) should follow
  index-sql-recall-fixes; charset unification runs after file-index-data-safety's
  reconcile protection is in place (index content changes ride on a safe reconcile).
- User priorities: Chinese + English quality first, macOS first, speed and precision;
  other languages later but groundwork must not block them.

## Acceptance Criteria

- [ ] Each child task lands with its own gates green (tests, typecheck:node, scoped lint).
- [ ] Cross-child integration check after batch A: file exact-title match visibly
      outranks weak app matches; pinned items pin; café/vs code/微信-on-EN-locale
      searchable; no index subtree loss on permission revocation.
- [ ] Findings digest updated (FIXED markers) as children land.

## Notes

- Parent holds no direct implementation; it owns the digest, the map, and final
  integration review.
