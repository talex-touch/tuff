# Search sort reaches UI

## Goal

Make backend ranking actually reach the rendered list: score writeback + renderer re-sort with pinned priority, per-source quota for deferred file results, cache stores accumulated results, drop double sort/push (audit engine H1-H4, M6).

## Requirements

- R1: An item's visible position reflects the backend rank score for the current
  query, regardless of which batch (fast/deferred) delivered it.
- R2: Pinned items always render on top; usage frequency (frecency) influences
  visible order.
- R3: File results are never structurally starved: they can outrank apps on score,
  and short queries keep a per-source floor of slots under the 80-item cap.
- R4: Repeating a query within the cache TTL returns the same result set the first
  run ended with (deferred results included).
- R5: Per batch, the backend publishes once (no base-then-full double push).
- R6: Selection follows the item (by id), not the row index, across re-ranks.
- R7: No protocol change (MessagePort streaming, snapshot/update event shapes stay).

## Acceptance Criteria

- [ ] New unit tests cover: deferred high-score item ranks above fast low-score item;
      pinned tops; per-source floor at >80 items; selection preserved; completion
      cache contains deferred items; single publish per batch.
- [ ] Existing search-engine, gather, sorter, renderer suites green; typecheck
      node+web green for touched files (concurrent-session ai/* errors excluded).
- [ ] Design decisions D1-D7 in design.md implemented as written.

## Notes

Complex task: design.md (locked decisions) + implement.md (ordered steps) are
authoritative; do not re-litigate decisions during implementation.
