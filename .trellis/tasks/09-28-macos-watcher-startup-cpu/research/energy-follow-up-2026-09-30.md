# beta.54 file-index energy follow-up

## Scope and acceptance

The user requested a measured local fix and an upstream PR on 2026-09-30.
Continue the existing energy task without changing the installed app, its settings,
or its databases. Branch: `task/perf/file-index-energy`, base `226e8d2fb`.

- Preserve metadata, admitted search scope, FTS matching, keyword priority, provider
  isolation, mutation atomicity, commit visibility, and existing scan pacing.
- Remove cardinality-dependent repeated FTS scans from document updates/deletes.
- Test through the existing public `SearchIndexService` mutation/search seam with
  real libSQL; require a regression that fails on the baseline.
- Measure three isolated baseline/candidate runs at 100k and a production-sized
  fixture. Include first-use discovery, CPU time, wall time, final row count, and
  warm search P95. No wattage claim from CPU time.
- Retain explicit whole-app/idle and untested-platform limitations. Publish only
  redacted evidence after tests, typecheck, lint, build and review.

## Read-only field evidence

Installed app and newest upstream prerelease: `2.4.14-beta.54`, published
2026-09-30 00:38:32 UTC. Local master equals upstream HEAD `226e8d2fb`.
macOS 15.7.5 arm64. A 30-second process-CPU-delta probe failed the 50% budget
at 78.3% aggregate CPU. Renderer/GPU were effectively idle in that window.
The live search database contained 1,189,461 files and the same number of
file-provider meta rows, with no content-enrichment progress rows.

A second 10-second native sample observed one WorkerThread in libSQL for
888/889 samples, including 402 `pread` samples; other workers were asleep.
This identifies a database workload, not the specific statement or a writer
rather than reader. The field observations are not a controlled fix A/B.
Raw samples and private logs remain outside the repository.

## Design

Add a private, writer-owned derived rowid lookup table beside the existing
runtime-created FTS/replacement tables. Discover provider rowids with one SQL
streaming `INSERT SELECT` per writer lifetime; retain every duplicate and rows
without metadata. Keep the table transactionally in step with inserts, removals,
provider replacement and FTS repair. No public schema migration or FTS rebuild.

Use FTS rowid equality for item mutation. Read actual stored columns by rowid with
primary-keyed keyword metadata in one lookup to avoid extra cold-insert reads and
avoid rewriting an identical FTS document, while preserving keyword-priority
updates and meta freshness. Do not trust a document-hash cache: content clearing
also has an established direct SQL writer path. Guard rowid deletes by identity
and rediscover on a new writer lifetime so downgrade/repair cannot delete another
provider's reused rowid.

Keep the read path and duty-cycle constants unchanged. Investigate fd pruning
separately; do not bundle it without an independent correctness/performance loop.

## Execution

1. Add/run no-op mutation regression and `search-index-energy-benchmark.ts`.
2. Implement the derived lookup and all existing mutation consumers.
3. Exercise legacy duplicates, changed content/tags/type/path, rollback, restart,
   rowid reuse, content clearing and provider replacement.
4. Run A/B benchmarks, focused checks, build and review; update executable specs.
5. Commit the focused patch and publish the authorized upstream PR if evidence
   meets the stated scope. No merge, release, deployment or installed-app change.

## Reproducible Service A/B

Final synthetic runs use the actual service and pinned libSQL, not SQL replicas.
Three repetitions per variant; baseline is the service source at `226e8d2fb`.
The host was not otherwise idle and variants were sequential, not randomized.
Each run seeds its own temporary WAL database, exercises actual provider apply,
priority-preserving document changes, cold inserts, FTS lookup and removal, checks
exact final row count, and removes only that fixture.

```sh
cd apps/core-app
git show 226e8d2fb:apps/core-app/src/main/modules/box-tool/search-engine/search-index-service.ts \
  > src/main/modules/box-tool/search-engine/search-index-service.energy-baseline.ts
./node_modules/.bin/tsx scripts/search-index-energy-benchmark.ts 100000 3 \
  src/main/modules/box-tool/search-engine/search-index-service.energy-baseline.ts
./node_modules/.bin/tsx scripts/search-index-energy-benchmark.ts 100000 3
./node_modules/.bin/tsx scripts/search-index-energy-benchmark.ts 1200000 3 \
  src/main/modules/box-tool/search-engine/search-index-service.energy-baseline.ts 1000
./node_modules/.bin/tsx scripts/search-index-energy-benchmark.ts 1200000 3 \
  src/main/modules/box-tool/search-engine/search-index-service.ts 1000
rm src/main/modules/box-tool/search-engine/search-index-service.energy-baseline.ts
```

The generated baseline module is temporary, not committed. Aggregates and all
twelve synthetic run records are in `search-index-energy-results-2026-09-30.json`.
The original benchmark did not emit a Node version with each run; the JSON's
`verificationNode` records the later observed verification runtime (v26.8.2),
not a per-run runtime attestation.
Below are medians across three runs; update/delete batches contain 20 existing items.

| 1.2m rows / phase                 | Baseline CPU-ms | Candidate CPU-ms | Baseline wall-ms | Candidate wall-ms |
| --------------------------------- | --------------: | ---------------: | ---------------: | ----------------: |
| First update, including discovery |        7172.649 |         1149.552 |         7510.802 |          1209.601 |
| Unchanged document apply          |        6605.021 |            3.614 |         6873.398 |             3.259 |
| Actual content change             |        6625.939 |           12.525 |         6941.668 |            10.727 |
| 1,000 cold inserts                |         905.132 |          767.935 |          886.340 |           782.994 |
| 20 item removals                  |        6426.542 |            5.463 |         6613.813 |             5.605 |

All large runs end with exactly 1,200,980 rows (1,000 inserted, 20 removed).
Warm FTS-query per-run P95 median: 4.608ms baseline, 1.626ms candidate; candidate
per-run range 1.455-4.900ms. This is the service lookup, not full CoreBox UI latency.
At 100k rows, warm P95 median is 0.179->0.188ms; exact final counts are 100,000.
The small 20-item cold phase is 15.907->19.480 CPU-ms despite lower wall time
(15.925->11.737ms). Retain this constant-cost/measurement limitation; do not claim
every workload's CPU improves. Larger cold insertion shows no throughput regression
in this fixture, not a universal promise.

## Regression and Review

- Red observed before the initial patch: priority-only apply rewrites FTS.
- Final real-libSQL tests cover unchanged documents, independently changed
  keyword priorities and body/type/tags, changed title/path, duplicate identities
  and missing meta, restart after legacy writes, transaction rollback/retry,
  discovery failure/retry, content policy clear, whole-index wipe/rowid reuse,
  public repair, 64-bit rowids and actual FTS rowid query plans.
- Staged replacement visibility/abort/rollback tests remain passing. Cold inserts
  issue no FTS DELETE or second provider discovery after coverage.
- A second red regression confirmed whole-index maintenance omitted the new
  derived identities; cleanup now removes them after successful FTS clear, allows
  older databases with no side table and propagates real address-cleanup errors.
- Standards and spec reviews found no production findings. Two judgment calls
  were addressed: share the prepared FTS tuple type, and independently assert the
  unchanged keyword-hash condition instead of merely naming a test that way.
- Final follow-up reviews independently checked the fused guarded LEFT JOIN and
  storage-maintenance lifecycle changes; neither reported actionable findings.

## Final Local Checks

The final bounded suite passed **99 files / 1,024 tests** in 45.13s:

```sh
cd apps/core-app
./node_modules/.bin/vitest run \
  src/main/modules/box-tool/search-engine src/main/db \
  src/main/service/storage-maintenance.test.ts \
  src/main/modules/box-tool/addon/files/services/file-provider-full-scan-insert-service.test.ts \
  src/main/modules/box-tool/addon/files/workers/file-scan-fd-backend.test.ts \
  src/main/modules/box-tool/addon/files/services/file-provider-fuzzy-score.test.ts \
  --maxWorkers=2
./node_modules/.bin/tsc --noEmit -p tsconfig.node.json --composite false
./node_modules/.bin/electron-vite build
```

Scoped ESLint and Prettier, search-index writer ownership/self-tests, module-size
ratchet, branch policy and `git diff --check` passed. The release catalog was
generated with no tracked-output changes, and release-note verification passed.
Renderer typecheck, repository-wide tests and all-platform packaging were not run
for this main-process-only patch. Branch-policy historical remote warnings were
non-blocking and unrelated to this branch.

Earlier test runs overlapped with a build or used default worker concurrency and
hit the existing `search-core.trace` 10s import hook deadline. The timeout was not
changed: the complete bounded suite was rerun without a concurrent build and with
two workers. Early `pnpm exec` attempts implicitly entered installation and hit
node-gyp symlink EEXIST; direct existing executables were used instead, without
manifest/lockfile changes. These failed attempts are not counted as passing checks.

## Isolated Packaged-App Smoke

A fresh unsigned arm64 package was built with Electron 41.10.7 and publishing
disabled. The source manifest remains the upstream master's beta.53; the installed
release is beta.54. The package was checked for the new writer code, native
file-events backend and bundled fd before launch. No installed app was replaced.
Reusing an older local archive failed because its post-pack pruned files were
still referenced by the archive header; that copy was not used for acceptance.
The fresh builder's first attempt misdetected npm dependency collection and
failed. The successful retry explicitly selected the repository's pnpm runtime;
its existing after-pack closure repair resolved the logged missing modules.

The successful launch used a generated HOME/userData and one ordinary synthetic
fixture root, with no copied credentials or private data. An early diagnostic
verified the effective userData path before any database assertion. Startup
analytics and Sentry reporting were disabled in this successful fixture.

| Candidate-only smoke                                   |            Result |
| ------------------------------------------------------ | ----------------: |
| Synthetic file rows / file-provider FTS rows           |     3,000 / 3,000 |
| Launch to 3,000 persisted file rows                    |     78,900.344 ms |
| Watch insertion of 20 probes, all MATCH-visible        |      1,279.152 ms |
| Watch deletion of 20 probes, zero remaining MATCH hits |        507.458 ms |
| Post-scan observation window                           |        60 seconds |
| Main-process CPU median                                |            5.964% |
| App-process-group CPU median / maximum                 | 42.370% / 48.680% |
| `Perf:EventLoop` warning occurrences                   |                 0 |

CPU uses cumulative `ps` CPU deltas in twelve five-second windows. Short-lived
children that exit between snapshots can be missed. This is not watts, a matched
app A/B, a full UI search latency test, or a confirmed fully idle window: logs show
an update-download retry and startup maintenance during the observation. The
unchanged update subsystem also reported an update-lifecycle conflict; active-app
lookups timed out and applied their backoff. These remain visible limitations,
not problems silently fixed by the FTS optimization.

Two earlier smoke attempts did not converge: a root under the macOS temporary
system path admitted zero files under existing filtering; an isolated
`Documents` root was held pending by the existing unresolved TCC determination
gate. The successful retry used an ordinary root, not a permission bypass or a
production filter change. No system permission determination was changed.
Every generated profile and candidate process was removed/stopped after its run.
Only aggregate synthetic metrics are publishable; raw app output remains outside
the repository.

**Whole-app "particularly low energy" remains unverified.** The main-process
median is below the task's 10% observation budget, but no matched group reduction
or settled-idle/power-counter acceptance exists. Publish this bounded writer fix
as a draft, not as closure of the overall energy task.

## Bug Analysis

1. Root cause category: implicit assumption plus test coverage gap. A normal-table
   identity predicate was assumed to be cheap on a shared FTS virtual table.
2. Why previous fixes were partial: fd reduces traversal work, bounded fuzzy
   scoring reduces recall work, and meta coverage fixes new inserts. None changes
   the existing-document and per-item removal discovery cost.
3. Prevention: a private indexed identity map, rowid plan regression, real legacy/
   rollback tests and contract 8 in `search-hotpath-contracts.md`; no blind hash
   trust after policy clear, no number coercion of rowids.
4. Expansion boundary: ordinary metadata no-op persistence, false commit
   suppression, fd subtree pruning and long-running read failures remain separate
   work, not silently bundled optimizations.
5. Knowledge capture: update the main-process executable contract and the living
   search audit. No template spec tree exists in this product repository.

## Evidence Limits

The one-time provider discovery still scans and writes the side map synchronously
inside native SQLite: ~1.21s wall at 1.2m synthetic rows. It can delay queued writes
and costs one full pass per provider/writer lifetime. Body-rich profiles may cost
more; no new hash trust or startup migration is introduced to hide that cost.
The extra derived identity table/index also consumes disk space; real-profile
storage overhead and long-path/body-rich workloads were not measured.

The installed beta.54 is untouched and does not contain this patch. Service A/B
does not establish causality for every live libSQL sample, wattage, battery life,
or "particularly low" whole-app energy. Windows/Linux/Intel macOS runtime,
power-counter A/B, the live million-file profile, long-duration restarts and
content-rich workload acceptance remain unverified.
