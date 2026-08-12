# File index data safety

## Goal

Reconcile empty-scan protection, search-time wrongful deletion fix, NFC normalization single entry + duplicate-row migration, mtime precision mismatch (audit file high-1/2, mid, engine H8).

## Requirements

- R1: A scan that fails to read directories (TCC revocation, unplugged volume,
  renamed root) must never be interpreted as "directory is empty"; reconcile must not
  delete index rows for a root whose scan reported errors or returned zero entries
  while the DB holds rows for it.
- R2: The search hot path must never delete index rows. Rows excluded by search-time
  filters are display-filtered only; cleanup happens off-path and only after the file
  is stat-confirmed missing (ENOENT).
- R3: All filesystem paths entering the file index (scan output, watcher events,
  configured extra paths) are NFC-normalized at a single shared helper; DB lookups
  and reconcile comparisons therefore compare like with like. A one-time gated
  maintenance migration merges existing NFC/NFD duplicate rows and removes stale
  index entries keyed by non-NFC ids.
- R4: Reconcile change detection compares mtimes at equal precision (disk ms
  quantized to DB's stored seconds); a reconcile round over an unchanged tree
  produces zero spurious updates.
- R5: All DB writes obey .trellis/spec/main-process/database-write-contracts.md
  (single writer per file; scheduleDbWrite/scheduleAuxWrite; search home via worker;
  boot-time maintenance writers gated).

## Acceptance Criteria

- [ ] Unit tests: zero-scan-with-db-rows aborts deletions (and logs); scan-error-count
      aborts deletions; filter-excluded row survives a search; missing file is deleted
      only after stat check; NFD path from scan and NFC query-side lookup meet in one
      row; unchanged-tree reconcile plans zero updates (mtime quantization).
- [ ] Migration test: NFC/NFD twin rows merge keeping the newer; old-id index entries
      removed via existing removal APIs.
- [ ] Existing addon/files suites + packages/utils scan/write-plan suites green;
      typecheck:node green for touched files.

## Notes

Complex task: see design.md (locked decisions D1-D5) and implement.md.
