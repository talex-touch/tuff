Crosery

# FTS Replacement and Metadata-Scan Work Reduction

Research sidecar for `09-28-macos-watcher-startup-cpu`, checked September 30, 2026.

## Conclusion and Evidence Boundary

**The proposed writer-owned `search_index_rowids` table is a credible way to replace repeated FTS identity scans with indexed identity lookup and rowid-addressed mutations, including legacy duplicates. It is not safe to preserve a document hash across sessions merely because rowid and identity still match.**

**No-op FTS suppression and no-op metadata persistence are separate changes.** A document hash can suppress FTS replacement without preventing `files` updates, progress resets, keyword-priority updates, or commit notifications. Each needs its own observable contract.

- **Verified:** repository instructions, relevant Trellis research/database/search contracts, current source and installed dependency source, SQLite official documentation and first-party implementation, fd's pinned implementation, and actual fzf's public implementation.
- **Verified upstream identity:** `git rev-parse HEAD` and `git ls-remote --symref origin HEAD refs/heads/master refs/heads/stage` both identified project `HEAD`/remote default `master` as `226e8d2fb960c053b3d0dbd6204b1221c1ead217`. References below describe that pinned baseline, before concurrent main-agent candidate edits, not a verified packaged beta.54 binary. The baseline `SearchIndexService` remains available at [S12].
- **Main-agent context, not independently verified here:** the reported beta.54 index is approximately 1.19 million file rows, with an equal file-provider meta count and no content-progress rows. Equal counts do not prove identity-set equality, uniqueness, or absence of historical FTS body text. Runtime CPU attribution remains with the main agent; this note does not reproduce its samples or measurements.
- **Not executed:** app/browser launches, process sampling, private-profile inspection, SQL probes, migrations, production changes, or regression tests. Source inspection does not establish wattage, CPU reduction, or completion-time improvement.
- **Remaining risk:** the bundled libSQL/FTS behavior, initialization cost at this scale, complete mutation-path coverage, and proposed hash trust rules require main-agent tests.

Research used public HTTP text retrieval, not browser automation. No Context7 tool was exposed in this sidecar. No private paths, document contents, database rows, credentials, or raw process evidence were copied into this artifact. Absolute paths below refer only to the requested repository and its dependencies.

## Current Project Contracts

| Boundary               | Verified baseline behavior                                                                                                                                                                                                                                                  | Source              |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| FTS storage            | `search_index` is normal stored-content FTS5. `item_id`, `provider`, and `type` are UNINDEXED; title, compact title, keywords, tags, path, and content are indexed. It is not the separate external-content `file_fts` table.                                               | [L1], [L2], [L3]    |
| Identity metadata      | `search_index_meta` has PK `(provider_id,item_id)`, `keyword_hash`, and `updated_at`; no FTS rowid or document hash.                                                                                                                                                        | [L4], [L5]          |
| Cold inserts           | `applyDocument` skips identity DELETE only when provider meta coverage is complete and the item has no meta row. Existing items still DELETE by UNINDEXED identity, then INSERT. Matching `keyword_hash` skips keyword delta, not FTS replacement or meta timestamp update. | [L6], [L7], [L8]    |
| Coverage               | The cached check asks whether any FTS identity lacks meta. It does not prove one FTS row per identity, absence of orphan meta, or content equality.                                                                                                                         | [L9]                |
| Removal/replacement    | Retired IDs and `removeProviderItems` use identity DELETE per item. Provider clear/replacement deletes provider FTS rows and the corresponding meta/mappings. Replacement stages documents and commits the replacement atomically.                                          | [L10], [L11], [L12] |
| Full-scan publication  | Each disk batch is mapped to upsert records; the normal fused path maps accepted metadata records to index items before persistence. Worker metadata and FTS operations are serialized but remain separate domain transactions.                                             | [L13], [L14], [L15] |
| Metadata upsert        | `upsertFiles` unconditionally updates conflict rows, returns them, and marks existing non-pending progress rows pending. `updateFileMetadata` also marks the supplied existing file IDs pending. Neither implements a full-scan unchanged predicate.                        | [L16], [L17]        |
| Existing scan dedup    | Incremental planning already compares mtime/ctime with a 1,000 ms tolerance plus size/name/extension. Reconciliation uses strictly newer, second-quantized mtime, not the same predicate. Do not claim every scan path currently rewrites everything.                       | [L18], [L19]        |
| Out-of-band FTS writes | Disabling content updates FTS `content` directly; storage cleanup can delete the whole FTS table's contents; repair drops/recreates FTS. These paths would invalidate a derived map/hash unless integrated.                                                                 | [L20], [L21], [L22] |
| Commit semantics       | Writer publication uses positive `affectedItems`; zero suppresses the visibility barrier and commit. Current provider apply returns submitted document count, not an actual changed-document count.                                                                         | [L10], [L23]        |

## SQLite Facts That Constrain the Options

1. **UNINDEXED is not an identity index.** It excludes that column's tokens from MATCH. FTS5's current `xBestIndex` recognizes rowid equality/ranges and MATCH, not ordinary equality on these user columns. Without MATCH or rowid restriction, identity UPDATE/DELETE first scans the stored content to find rows. Changing DELETE to UPDATE with the same WHERE does not fix row discovery. [S1], [S2]
2. **Normal FTS5 UPDATE is still replacement work.** The current implementation deletes the old row's index contribution and inserts the new contribution even when only an UNINDEXED field is assigned. The content-only branch in current source belongs to contentless tables, not this project's table. Deletion reads old indexed text to remove its tokens; rowid addressing removes discovery scans, not the token-maintenance cost of a real change. [S2], [S3]
3. **Rowid is the useful mutation address.** FTS5 has an implicit integer rowid. The implementation exposes a direct rowid plan, and its storage lookup/deletion statements use the content table's integer primary key. The ordinary side table can carry a compound identity index. No additional `CREATE INDEX` can be attached to the FTS virtual table itself. Do not modify FTS shadow tables as a shortcut. [S1], [S2], [S3], [S4]
4. **REPLACE and UPSERT are different.** Normal FTS5 `INSERT OR REPLACE` with an explicit existing rowid deletes that row's old contribution before insertion; without the known rowid it cannot replace a string identity. SQLite's `ON CONFLICT ... DO UPDATE` UPSERT does not support virtual tables. Its conditional WHERE can, however, suppress unchanged writes on ordinary `files` or derived tables. [S2], [S5]
5. **Storage-mode conversion is not a local SQL substitution.** External content requires an authoritative content table and synchronization. Contentless-delete, introduced in SQLite 3.43.0, supports replacement/deletion but imposes update constraints and changes how column values are read. Neither supplies this project's identity index by itself. They would change stored-content/read/cleanup contracts and require compatibility tests; do not select them for this bounded task. [S1], [L1], [L2], [L20]

These facts support removing unnecessary operations, not a numerical energy prediction. Replacing a statement name or moving work to a worker does not itself prove less total work.

## Candidate: Writer-Owned Derived Rowid Table

The main agent's proposed shape preserves every physical FTS row:

```sql
CREATE TABLE IF NOT EXISTS search_index_rowids (
  fts_rowid INTEGER PRIMARY KEY,
  provider_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  document_hash TEXT
);
CREATE INDEX IF NOT EXISTS idx_search_index_rowids_provider_item
  ON search_index_rowids(provider_id, item_id);
```

This is a **derived runtime schema addition**, even without modifying Drizzle schema declarations or the versioned migration journal. Runtime DDL already has a local precedent in replacement staging tables. Keep the table reconstructible, private to the owning writer, and absent from public transport contracts. It must not become a new authoritative catalog or cause a second writer connection. Split-on and legacy shared-home ownership still apply. [L24], [L25]

### Coverage and Initialization

- Seed from `SELECT rowid, provider, item_id FROM search_index`, never from meta alone. This covers missing meta and preserves duplicate identities. Use a non-unique compound index: a UNIQUE identity index would fail or discard the very duplicates this proposal promises to handle. [L1], [L4], [L9]
- A SQL `INSERT ... SELECT` avoids transferring a million-row array to JavaScript, but **streaming rows inside one SQLite statement does not create scheduler yield points**. The statement still reads FTS content and writes the side table/index under its transaction. Per-provider filtering remains an UNINDEXED FTS scan; one rebuild per provider can scan the overall FTS table once for each provider. [S2], [S3]
- A lazy provider rebuild can replace the existing coverage scan, rather than adding another unconditional full pass. Whether one whole-table rebuild, provider-lazy passes, or rowid-keyset pages is preferable is a main-agent decision after isolated timing. Do not promise an inexpensive startup rebuild at the reported scale. [L9]
- Rebuild and prune stale derived rows under the writer's serialized boundary. Set the provider-ready flag **only after successful commit**. Failure/rollback must clear the in-flight readiness promise and permit retry. An empty or partly rebuilt map must never mean "document does not exist."
- For chunked rebuilding, capture a coverage fence/high-water rowid and either hold admission or update the derived table for every interleaving mutation. Until completion, use a safe fallback for unproven identities. Paging alone is not a consistent snapshot.
- The actual table contains only IDs/hash, but file-provider item IDs may contain file paths: retain them locally; diagnostics/export should contain counts and operation classes, not values. [L31]

### FTS INSERT and `lastInsertRowid`

**Using the successful FTS INSERT statement's own result is source-supported; using a later connection-wide value is unsafe.**

SQLite documents connection-local last-insert state for successful virtual-table inserts, including that rollback does not reset it and internal virtual-table writes can disturb it. Current SQLite FTS5 passes the content-row ID through `xUpdate`; its storage sync saves/restores last-insert state. The installed client enables safe integers and returns `BigInt(info.lastInsertRowid)` for non-row-returning statements; installed Drizzle `run()` forwards that statement result. [S6], [S2], [S3], [L26], [L27]

Required safeguards:

- Capture `const inserted = await tx.run(ftsInsert)` and use **that result**, before any meta, keyword, side-table INSERT, or commit-time query. Never use the result of a later INSERT or the last result of a multi-statement batch.
- Validate missing/unusable results and maintain FTS plus derived row plus meta/mappings in the same transaction. On failure roll back; do not publish a cached mapping for an insert that was rolled back.
- Keep the 64-bit ID as bigint or a lossless representation. Do not coerce through `Number`; raw rowid queries using the client's default integer mode also need a lossless strategy. `files.id` is not interchangeable with the globally shared FTS rowid.
- Test actual pinned libSQL, not only a mock returning `1`. Source support from current upstream SQLite does not certify the shipped native binding.
- Do not substitute FTS `RETURNING rowid` without testing that exact statement. SQLite documents virtual-table UPDATE/DELETE RETURNING limitations; the installed client's row-returning branch also reports `lastInsertRowid` as undefined. [S7], [L26]

### Duplicates, Rowid Reuse, and Deletion

**No-op requires exactly one trusted physical row for an identity.**

- If an identity maps to multiple FTS rows, do not skip because any one hash matches. Delete every mapped physical row and insert one canonical document on the next authoritative apply. This preserves today's DELETE-all-matches then INSERT-one semantics. A read-only map rebuild need not rewrite the user's FTS merely to deduplicate. [L6]
- Item removal must delete every matching FTS rowid and every matching derived row, then meta/mappings. A map seeded from FTS works even when meta is missing. Provider/item matching must remain provider-scoped.
- Keep physical removal counts distinct from logical submitted IDs, especially for duplicates; do not silently change existing summary semantics. Retired-ID handling, provider clear, staged replacement commit/abort/retry, and explicit repair must update or invalidate the map.
- Rowids can be reused after deletion; FTS's normal content primary key does not supply an AUTOINCREMENT guarantee. A surviving derived rowid must therefore not be trusted without matching provider and item. Identity mismatch must reset its hash. [S3], [S8]
- **Matching rowid plus identity is still insufficient for retaining a persisted hash.** Counterexample: raw content clear changes the row but not its identity/rowid. Another example is FTS drop/recreation followed by the same identity receiving the same numeric rowid. A copied old hash would incorrectly skip restoring different content. [L20], [L22]
- Safest initial contract: seed `document_hash = NULL` at a new writer session, learn it only from this session's committed authoritative writes. If retaining hashes across sessions is required, prove complete atomic mutation coverage plus a hash-format/FTS-incarnation validity fence, or verify the current FTS payload before carrying the hash. Rowid/identity matching is necessary, not sufficient.
- Provider-ready flags are session-local and database-instance-local. Worker restart/re-init, FTS recreation, global clear, and admission bypasses invalidate them. A reused service object must not inherit readiness for another connection/database.

### Content Clear and Other Bypass Writes

The current content-clear path updates `search_index.content` through raw worker `execWrite` on split-on, and directly through a scheduled transaction on split-off. It does not pass through `applyDocument`. Whole-index storage cleanup is another independent path. [L20], [L21], [L28]

For the proposed table:

- Content clear may retain rowid/identity mappings, but must set their document hashes NULL **in the same transaction** as FTS content UPDATE, or write the correctly recomputed hash. Lazy invalidation after publishing the clear leaves a stale-hash window.
- Global clear removes all derived rows and invalidates all cached provider readiness. Repair/recreation discards all old mappings/hashes; provider replacement clears only its provider and reinstates coverage after commit.
- Audit supported raw `execWrite`, cleanup, and legacy write paths explicitly. "One physical writer" does not mean "all writes use one semantic method." A mutex does not invalidate hashes.
- If an unknown supported maintenance path can mutate FTS without participating, mark derived coverage/hash trust dirty and revalidate before skipping. Do not silently infer SQL semantics with an incomplete string matcher.

## No-Op Document and Metadata Contracts

### Separate Two Hashes

The prepared FTS tuple is:

```text
item_id, provider, type, title, title_compact, keywords, tags, path, content
```

Hash its **actual normalized stored values** with a versioned, unambiguous encoding, for example a JSON array and SHA-256. Do not concatenate unescaped fields, hash only file timestamps, or fold titles/tags differently from the writer. The existing `keyword_hash` normalizes a separate value/priority map and includes `SEARCH_KEYWORD_SCHEMA_VERSION`; it is not a document hash. [L8], [L29]

Expected behavior:

| Document hash                      | Keyword hash/meta         | Required work                                                                                                                               |
| ---------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Equal, exactly one trusted FTS row | Equal, meta present       | Skip FTS DELETE/INSERT and keyword delta; avoid refreshing meta timestamp merely for a no-op.                                               |
| Equal, exactly one trusted FTS row | Different or meta missing | Keep FTS; repair/update mappings and meta. Keyword-priority-only changes must still affect search and count as an effective index mutation. |
| Different/NULL/untrusted           | Any                       | Validate/replace the document, establish its committed hash, then apply any necessary keyword delta.                                        |
| Any                                | Multiple physical rows    | Canonicalize on authoritative apply; never use an "any matching hash" shortcut.                                                             |

Changing only a keyword priority can leave the FTS keyword string unchanged. Conversely, body/tag/type/title changes can leave the existing keyword hash unchanged. Tests must exercise both directions. [L8], [L29]

`indexedItems`/`affectedItems` currently reflect submission, so document suppression alone would still emit false commits. Preserve the public result shape but define mutation counts to include actual FTS or keyword changes, not attempts; confirm callers do not depend on attempted-count semantics. A pure FTS/keyword no-op should not cross a visibility barrier or advance the search revision, while an effective priority change must. [L10], [L23]

### Avoid Scan-Induced Work Before Hashing

1. Compare ordinary metadata before its upsert/update, using indexed path/id lookup on the correct home. Reuse the established incremental conventions unless deliberately changing their contract. Decide which of size/name/extension/type/isDir/time fields affect metadata versus the FTS projection. [L16], [L17], [L18]
2. Do not use `lastIndexedAt = now` as evidence that a document changed. If a scan-observation timestamp is needed, keep that bookkeeping separate from reindex/enrichment admission. Child checkpoints still represent scan coverage, not root completion. [L13], [L25]
3. Conditional ordinary-table UPSERT can eliminate unchanged rows, but changing RETURNING from "all attempted rows" to "only changed rows" affects acknowledgements, counters, custom sinks, progress, and recovery. Handle unchanged metadata with missing FTS separately: a metadata no-op must not suppress repairing a lost search document. [S5], [L14], [L16]
4. Mark content pending only for a changed content fingerprint or explicitly required recovery, not an unchanged observation. Keep metadata-only mode and explicit opt-in/disable cleanup intact. [L16], [L17], [L30]
5. Treat `base` and `worker-enrichment` as different publication purposes. Full-scan records lack body content; mapping them directly currently yields an empty prepared FTS content value. A future no-op design must distinguish "content omitted" from "authoritatively clear content" and preserve enrichment for unchanged files where appropriate. Do not introduce an early return that masks either a real body change or an explicit policy clear. [L14], [L31], [L29]
6. Preserve the version-gated in-database keyword backfill. Steady-state file reconciliation does not re-emit unchanged files, so hash/schema changes do not automatically cover legacy rows. Never perform a disk-content read solely to decide a metadata no-op. [L19], [L32]

Known limitation, not fixed here: reconciliation currently accepts only strictly newer second-quantized mtime, while incremental planning has a tolerance. Same-second/same-size edits and timestamp rollback require deliberate freshness policy; metadata equality is not proof of byte equality. Do not silently tighten or widen these existing rules as part of rowid optimization. [L18], [L19]

## Alternatives and Scope Limits

| Option                                                              | Potential work reduction                                                                                          | Constraints / recommendation                                                                                                                                   |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keep current coverage fast path                                     | Already removes cold-insert identity DELETE when meta coverage proves absence.                                    | Baseline, not a new fix; still scans for existing updates/removals.                                                                                            |
| Batch-select physical rowids, then DELETE by rowid                  | One identity scan per bounded batch instead of per item; no durable auxiliary table.                              | Lower-complexity fallback, but still scans FTS and must preserve duplicates. It does not provide indexed identity discovery.                                   |
| Proposed derived rowid table plus two-hash contract                 | Indexed identity discovery, precise rowid mutations, genuine no-op suppression, independent of meta completeness. | Preferred candidate subject to the coverage, hash-invalidation, initialization, and transaction tests above. No measured benefit claimed.                      |
| Add rowid/document fields to authoritative meta through a migration | Similar indexed lookup for one canonical row.                                                                     | A single-row-per-identity shape cannot represent legacy duplicates without repair/fallback. Changes versioned schema and exceeds the no-migration requirement. |
| External-content/contentless storage conversion                     | Different storage/token-maintenance tradeoffs.                                                                    | Not a drop-in replacement; changes reader/cleanup semantics and runtime feature requirements. Outside this bounded task.                                       |

Do not rebuild/delete the user's FTS to make the derived table easy to populate. Missing meta, duplicate physical rows, orphaned derived entries, repair-created empty FTS, split-off legacy behavior, failed transactions, and repeated replacement retries all remain supported states. Existing task PRD excludes database cleanup/migration; any wider authoritative schema/storage redesign belongs to a reviewed scope change. [L33]

## fd and fzf: Verified Distinction

**Current project source uses real bundled fd for enumeration and a custom fzf-inspired TypeScript scorer for already-recalled candidates. It does not execute actual fzf CLI in this file-search path.**

- fd is pinned as `@prebuilt-binary/fd` 10.4.2. Production resolution uses bundled platform packages, never user PATH. The child uses `--threads 1`, NUL-delimited absolute paths, hidden/no-ignore flags, and bounded depth; accepted candidates still receive project policy checks and `lstat`, with stat concurrency 2. Scan batches await acknowledgements; failure/missing binary falls back to the legacy walker. This is not "zero filesystem work" or an energy guarantee. [L34], [L35], [L36]
- fd's pinned CLI source confirms the flag meanings and distinguishes its default available-CPU parallelism from the project's explicit one-thread setting. Current arguments do not send `--exclude` prune rules to fd, so filtering returned paths is not proof that excluded subtrees were never traversed by the child. [S9], [L34]
- `scoreFzfSubsequence` is a project-local dynamic program. It uses its own constants, normalization and path/typo combination; e.g. consecutive bonus 12 differs from fzf's base consecutive bonus 4. The call site caps hydrated candidates at 120 and performs the score locally after database recall. A lockfile occurrence of npm `fzf` belongs to the Nuxt Devtools dependency tree, not this CoreApp file-search implementation. [L37], [L38], [L39], [S10]
- Actual fzf is a separate command-line/terminal toolkit. It accepts a candidate stream and can enumerate when run without piped input, using its walker/default-command configuration. fd can feed fzf, but the two are not synonymous. Its Go V1/V2 matching implementation does not make this custom scorer a CLI integration or an exact port. [S10], [S11]

External source snapshots checked here: SQLite master `1f7010d4ec424169c68b4299dc0c43ef3d11ea93` (committer September 29, 2026); fzf master `b1be3a8be1b833ce5b92fbbac11637643d60a046` (committer September 14, 2026); fd source pinned to the project's `v10.4.2`. These are source identities, not assertions of installed CLI versions.

## Main-Agent Test Criteria

All criteria below are **proposed and unexecuted by this sidecar**. Use synthetic temporary databases and the actual pinned client/FTS path, not private profiles.

| Test                       | Observable pass condition                                                                                                                                                                                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity versus rowid plan | Record EXPLAIN QUERY PLAN for existing identity WHERE and candidate rowid WHERE plus compound side-index lookup. Show rowid/side-index constraints; do not assert merely that the word SCAN is absent, since virtual-table plan text can contain it for indexed access.                                       |
| Last-insert ownership      | Single and multi-document FTS inserts, explicit transaction, other table inserts, FTS sync/merge, rollback/retry, and high explicit 64-bit rowids: captured statement IDs address exactly the intended provider/item. No lossy Number conversion or mapping retained after rollback.                          |
| First provider use         | Existing complete, incomplete-meta, no-meta, empty, and duplicate FTS fixtures: derive all physical rows without modifying FTS; mark readiness only after success; retry after injected rebuild failure.                                                                                                      |
| Legacy duplicates          | Applying one identity with two physical rows canonicalizes to one; removal deletes both. Identical item IDs under different providers remain isolated. Hash equality with one duplicate must not skip cleanup.                                                                                                |
| Real document replacement  | Change body/title/tags/type while keeping keyword identity/priority unchanged; old MATCH hits disappear, new hits appear; meta, mappings and side table remain consistent.                                                                                                                                    |
| Independent keyword update | Same FTS tuple but changed keyword priority: no FTS mutation, mappings update, effective commit emitted.                                                                                                                                                                                                      |
| Pure repeated no-op        | Reapply identical item: FTS mutation count 0, keyword mutation count 0, no no-op meta timestamp write, effective affected count 0, no visibility request/revision change.                                                                                                                                     |
| Rowid reincarnation        | Delete/reuse a rowid for another identity, then recreate FTS with the same rowid/identity but changed content. Restart must not retain a stale trusted hash.                                                                                                                                                  |
| Raw content clear          | Establish hash, execute the actual split-on and split-off content-clear path, then reapply the pre-clear item. Correct new body behavior; hashes invalidated atomically with the clear; no stale skip. Include cleanup rollback.                                                                              |
| Repair/global cleanup      | Actual repair and storage-cleanup entry points discard/invalidate derived state. Next insert/lookup must not target an old rowid, report ghost coverage, or damage another provider.                                                                                                                          |
| Staged replacement         | Existing abort/visibility/idempotent-retry/failure tests extended to side table and hashes: aborted or failed replacement preserves all committed state; successful replacement leaves exact new coverage.                                                                                                    |
| Scan persistence           | Unchanged metadata fixture produces no FTS/enrichment re-admission; changed file persists and publishes; missing FTS with unchanged metadata is repaired; checkpoints/custom sinks/counts stay correct. Test content-enabled and metadata-only modes.                                                         |
| Version recovery           | Keyword-schema backfill and interrupted fused metadata/FTS writes converge on restart. No timestamp-only gate blocks schema reindex or content-policy cleanup.                                                                                                                                                |
| Initialization cost        | Synthetic scale representative of the reported million-row index: separately report rebuild reads, derived writes, wall time, worker CPU time, queue delay, and peak payload size. Include restart repeats; compare whole-statement and bounded approaches without claiming watts from CPU time.              |
| Work reduction             | With identical fixture and mutation workload, compare actual identity-scan count, FTS mutation count, ordinary-table writes, and correctness before/after. Attribute a gain to removed work, not to batching sleeps alone. Runtime/energy acceptance stays in the main agent's existing measurement campaign. |
| fd/scorer regression       | Existing fd boundary/fallback/cancellation tests and scorer ordering/Unicode tests still pass. No production fzf subprocess or broader file-search scope is introduced.                                                                                                                                       |

Relevant existing test anchors: [T1], [T2], [T3], [T4], [T5], [T6], [T7], [T8]. Main-agent integration owns test selection, implementation and any commit; this sidecar adds only this research note.

## Sources

### Official External Sources

- [S1] SQLite FTS5 documentation, especially UNINDEXED, table/storage modes and rowid.
- [S2] SQLite first-party FTS5 `fts5_main.c`, `fts5BestIndexMethod`, `fts5UpdateMethod`, `fts5StorageInsert`.
- [S3] SQLite first-party FTS5 `fts5_storage.c`, rowid content lookup, delete/insert and `sqlite3Fts5StorageSync`.
- [S4] SQLite virtual-table restrictions and update contract.
- [S5] SQLite UPSERT description, conditional no-op WHERE and virtual-table limitation.
- [S6] SQLite `sqlite3_last_insert_rowid()` contract.
- [S7] SQLite RETURNING limitations.
- [S8] SQLite rowid reuse rules.
- [S9] fd CLI source at the project's pinned version.
- [S10] Actual fzf's matching implementation.
- [S11] Actual fzf's first-party README, input and walker/default-command behavior.
- [S12] Pinned project baseline `SearchIndexService`, corresponding to the local anchors below.

[S1]: https://www.sqlite.org/fts5.html
[S2]: https://github.com/sqlite/sqlite/blob/1f7010d4ec424169c68b4299dc0c43ef3d11ea93/ext/fts5/fts5_main.c
[S3]: https://github.com/sqlite/sqlite/blob/1f7010d4ec424169c68b4299dc0c43ef3d11ea93/ext/fts5/fts5_storage.c
[S4]: https://www.sqlite.org/vtab.html
[S5]: https://www.sqlite.org/lang_upsert.html
[S6]: https://www.sqlite.org/c3ref/last_insert_rowid.html
[S7]: https://www.sqlite.org/lang_returning.html#limitations_and_caveats
[S8]: https://www.sqlite.org/autoinc.html
[S9]: https://github.com/sharkdp/fd/blob/v10.4.2/src/cli.rs
[S10]: https://github.com/junegunn/fzf/blob/b1be3a8be1b833ce5b92fbbac11637643d60a046/src/algo/algo.go
[S11]: https://github.com/junegunn/fzf/blob/b1be3a8be1b833ce5b92fbbac11637643d60a046/README.md
[S12]: https://github.com/talex-touch/tuff/blob/226e8d2fb960c053b3d0dbd6204b1221c1ead217/apps/core-app/src/main/modules/box-tool/search-engine/search-index-service.ts

### Exact Local References

Each link names one starting line, not a line range. Production-source anchors were recorded at the project commit stated above, before concurrent main-agent candidate edits; lines in the working tree may now differ. Use [S12] at the same baseline line when checking `SearchIndexService` evidence. This note does not review or certify the candidate implementation. Dependency references describe the installed `@libsql/client` 0.18.0 / `libsql` 0.5.29 and Drizzle client adapter, not a runtime probe.

[L1]: /Users/crosery/work_file/tuff/apps/core-app/src/main/modules/box-tool/search-engine/search-index-service.ts:1156
[L2]: /Users/crosery/work_file/tuff/apps/core-app/src/main/modules/box-tool/search-engine/search-index-service.ts:1242
[L3]: /Users/crosery/work_file/tuff/apps/core-app/resources/db/migrations/0024_search_index_runtime_store.sql:10
[L4]: /Users/crosery/work_file/tuff/apps/core-app/src/main/db/schema.ts:64
[L5]: /Users/crosery/work_file/tuff/apps/core-app/resources/db/migrations/0021_search_index_meta.sql:1
[L6]: /Users/crosery/work_file/tuff/apps/core-app/src/main/modules/box-tool/search-engine/search-index-service.ts:1278
[L7]: /Users/crosery/work_file/tuff/apps/core-app/src/main/modules/box-tool/search-engine/search-index-service.ts:1456
[L8]: /Users/crosery/work_file/tuff/apps/core-app/src/main/modules/box-tool/search-engine/search-index-service.ts:1497
[L9]: /Users/crosery/work_file/tuff/apps/core-app/src/main/modules/box-tool/search-engine/search-index-service.ts:1338
[L10]: /Users/crosery/work_file/tuff/apps/core-app/src/main/modules/box-tool/search-engine/search-index-service.ts:435
[L11]: /Users/crosery/work_file/tuff/apps/core-app/src/main/modules/box-tool/search-engine/search-index-service.ts:545
[L12]: /Users/crosery/work_file/tuff/apps/core-app/src/main/modules/box-tool/search-engine/search-index-service.ts:643
[L13]: /Users/crosery/work_file/tuff/apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-full-scan-run-service.ts:139
[L14]: /Users/crosery/work_file/tuff/apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts:1849
[L15]: /Users/crosery/work_file/tuff/apps/core-app/src/main/modules/box-tool/search-engine/workers/search-index-worker.ts:183
[L16]: /Users/crosery/work_file/tuff/apps/core-app/src/main/modules/box-tool/search-engine/file-index-persistence-repository.ts:180
[L17]: /Users/crosery/work_file/tuff/apps/core-app/src/main/modules/box-tool/search-engine/file-index-persistence-repository.ts:246
[L18]: /Users/crosery/work_file/tuff/packages/utils/search/indexing-write-plan.ts:185
[L19]: /Users/crosery/work_file/tuff/packages/utils/search/indexing-write-plan.ts:467
[L20]: /Users/crosery/work_file/tuff/apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts:2689
[L21]: /Users/crosery/work_file/tuff/apps/core-app/src/main/service/storage-maintenance.ts:171
[L22]: /Users/crosery/work_file/tuff/apps/core-app/src/main/modules/box-tool/search-engine/search-index-service.ts:241
[L23]: /Users/crosery/work_file/tuff/apps/core-app/src/main/modules/box-tool/search-engine/search-index-writer.ts:833
[L24]: /Users/crosery/work_file/tuff/apps/core-app/src/main/modules/box-tool/search-engine/search-index-service.ts:1112
[L25]: /Users/crosery/work_file/tuff/.trellis/spec/main-process/database-write-contracts.md:10
[L26]: /Users/crosery/work_file/tuff/apps/core-app/node_modules/@libsql/client/lib-esm/sqlite3.js:527
[L27]: /Users/crosery/work_file/tuff/apps/core-app/node_modules/drizzle-orm/libsql/session.js:118
[L28]: /Users/crosery/work_file/tuff/apps/core-app/src/main/modules/box-tool/search-engine/workers/search-index-worker.ts:415
[L29]: /Users/crosery/work_file/tuff/apps/core-app/src/main/modules/box-tool/search-engine/search-index-service.ts:1666
[L30]: /Users/crosery/work_file/tuff/apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-content-index-policy-service.ts:40
[L31]: /Users/crosery/work_file/tuff/packages/utils/search/indexing-source.ts:833
[L32]: /Users/crosery/work_file/tuff/apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-keyword-backfill-service.ts:59
[L33]: /Users/crosery/work_file/tuff/.trellis/tasks/09-28-macos-watcher-startup-cpu/prd.md:38
[L34]: /Users/crosery/work_file/tuff/apps/core-app/src/main/modules/box-tool/addon/files/workers/file-scan-fd-backend.ts:19
[L35]: /Users/crosery/work_file/tuff/apps/core-app/src/main/modules/box-tool/addon/files/workers/file-scan-worker.ts:109
[L36]: /Users/crosery/work_file/tuff/apps/core-app/package.json:105
[L37]: /Users/crosery/work_file/tuff/apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-fuzzy-score.ts:4
[L38]: /Users/crosery/work_file/tuff/apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-search-result-service.ts:247
[L39]: /Users/crosery/work_file/tuff/pnpm-lock.yaml:17520
[T1]: /Users/crosery/work_file/tuff/apps/core-app/src/main/modules/box-tool/search-engine/search-index-service.delta.test.ts:297
[T2]: /Users/crosery/work_file/tuff/apps/core-app/src/main/modules/box-tool/search-engine/search-index-service.meta-count.test.ts:92
[T3]: /Users/crosery/work_file/tuff/apps/core-app/src/main/modules/box-tool/search-engine/search-index-service.schema-repair.test.ts:57
[T4]: /Users/crosery/work_file/tuff/apps/core-app/src/main/modules/box-tool/search-engine/search-index-writer.test.ts:1
[T5]: /Users/crosery/work_file/tuff/apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-full-scan-insert-service.test.ts:1
[T6]: /Users/crosery/work_file/tuff/apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-incremental-write-planner-service.test.ts:1
[T7]: /Users/crosery/work_file/tuff/apps/core-app/src/main/modules/box-tool/addon/files/workers/file-scan-fd-backend.test.ts:1
[T8]: /Users/crosery/work_file/tuff/apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-fuzzy-score.test.ts:1
