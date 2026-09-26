# Main Process Spec Index

Electron main-process (apps/core-app/src/main) coding contracts.

## Documents

- [pi-provider-contracts.md](pi-provider-contracts.md) — renderer→main→CLI
  boundary for the local CLI provider family (pi · omp · codex · claude):
  @files attachment channel (dual-mirrored types, spill validation
  skip-not-fail, hint contract), stream commit/rollback semantics, bounded
  subprocess cancellation/termination, packaged ledger comparison, native Pi
  sessions, and §11's per-CLI argument matrix, per-stream termination semantics,
  executable lookup (absent vs unprobed), and the model-catalogue credential
  boundary.
- [agent-tool-gateway-contracts.md](agent-tool-gateway-contracts.md) — how
  model-callable tools reach `pi`: loopback gateway topology, executor arg
  order, confirmation/remember semantics (proxy tools narrow rememberKey via
  `classify`), MCP risk mapping, home skills-injection surface marker,
  degrade-not-abort rules, opt-in live smoke; plus the opposite direction —
  Tuff as an MCP server for external agents (shared gate, confirmation-surface
  visibility, per-argument remembered approvals, what is deliberately not
  published).

- [voice-session-contracts.md](voice-session-contracts.md) — single main-owned dictation session, Rust audio boundary, active-target delivery, clipboard recovery, and plugin/renderer reuse.
- [database-write-contracts.md](database-write-contracts.md) — single-writer-per-file
  topology, `scheduleDbWrite`/`scheduleAuxWrite` call-site convention, scheduler
  busy-retry semantics (never sleep holding the queue), live home resolution,
  search-split parity rules, boot-time maintenance write gating; hand-written
  migration authoring (snapshot chain dead at 0014, journal `when` must be max,
  leaf-table rebuild pattern, renderer-assigned ids need parent-scoped PKs).
- [channel-transport-contracts.md](channel-transport-contracts.md) — main→renderer
  delivery modes, notification-vs-request semantics, renderer quiesce before handler teardown,
  destroyed-transport send rejection, perf-report recursion prevention, delivery-target identity,
  port allowlist, and stable-mock/runtime quit evidence.
- [corebox-meta-overlay-contracts.md](corebox-meta-overlay-contracts.md) — the ⌘K action
  panel across main, CoreBox and the overlay renderer: main owns the window height only while
  the panel is open (grow-to-fit on the settled height, hold the latest layout update, replay it
  over the pre-open height on close), the host-only `panelState` notification that keeps the
  grown space painted until the shrink lands, `showInFolder` reveal-never-open (macOS packages
  after realpath, behind `system.shell`), and the key rules (code chords, platform-split pin,
  held-Enter guard, IME) with failures logged as id + code and shown in footer or header.
- [global-shortcut-contracts.md](global-shortcut-contracts.md) — the OS-level keys
  `ShortcutModule` registers: defaults written once (`shared/corebox-shortcut.ts`) and migrated
  by value, not by author; what a refused registration means per OS (macOS registers
  non-exclusively and never reports another app holding the key, so ⌥Space conflicts get an
  onboarding hint instead of a detector; Windows refuses held keys); no fallback (a default the
  OS refuses or that loses an in-app conflict leaves CoreBox with no key and one once-per-launch
  notice saying why, naming the winning shortcut when settings labels it; the ⌘E stand-in was
  removed); the effective key every surface prints, the command window's Open CoreBox row
  included (`shortcon:get-binding` / `shortcon:changed` defined once, stale answers dropped, tray
  rebuilt on change; no in-window ⌘E chord); recorder
  modifier names and the off-macOS `Command`/`Option` → `Super`/`Alt` rename; settings status ink.
- [app-semantic-catalog-contracts.md](app-semantic-catalog-contracts.md) — category
  vocabulary: locale-structured alias groups (new language = locale key + rule),
  automatic English pluralization + skip-table discipline, match-needle token
  semantics (bare generic tokens leak), version bump ≠ instant refresh, lift-to-utils
  constraints.
- [recommendation-freshness-contracts.md](recommendation-freshness-contracts.md) —
  `installedAt` extension (write-once via conflict-do-nothing, watch-now fallback),
  double-gate freshness predicate, novelty→frecency handoff, the single
  `RECOMMENDATION_SECTION_ORDER` source of truth (also the section render order),
  verifiable-or-absent evidence rules, cache-invalidation read-guard vs cleanup
  deletion, exposure slice tag rules.
- [recommendation-source-registry-contracts.md](recommendation-source-registry-contracts.md) —
  how a source enters the empty-state grid: capability-vs-standalone registration
  (chosen by which db handle answers), push-in-only registration because
  `<provider> → search-core → recommendation-engine → item-rebuilder` is a real
  cycle, batched rebuild to avoid N+1, source-declared aliases, throw-on-conflict,
  per-source failure isolation.
- [search-hotpath-contracts.md](search-hotpath-contracts.md) — per-keystroke search
  path: token dedup funnels through `addSearchToken` (O(1) WeakMap/Set), per-app
  derivation memoized with a content key that must cover every input field, cached
  arrays are shared read-only references.
- [index-commit-refresh-contracts.md](index-commit-refresh-contracts.md) — how
  background indexing reaches an open CoreBox: per-stream `index-committed`
  notifications in a window the first commit opens and later ones never extend
  (1s; 3s plus `bulk` during a scan or a dense run) while the hub revision still
  moves per commit; renderer refresh backoff (500ms → 2s → 5s), a hidden CoreBox
  holding one pending refresh, same-query reconcile against pre-cap delivered
  ids; app watch events gated by root before health; meta-backed provider health
  count; native file results under the file-index directory rule (pool 150 → 50,
  iCloud Drive exception); enrichment-resume cooldown/cursor and read-failure
  skip classes.
- [background-task-timeout-contracts.md](background-task-timeout-contracts.md) —
  main-thread liveness: streaming requests default to a fetch-through-EOF
  deadline, caller-owned idle streams opt in explicitly, caller cancellation is
  source-provenanced and cooldown-neutral, protocol completion/cancellation use
  controlled lifecycle methods, one-shot native workers exit naturally after
  terminal delivery; PollingService defaults, outbox round budgets, child-process
  backoff, bounded interactive `waitForIdle()`, and `[Perf:EventLoop]` diagnosis.
- [search-charset-and-identity-contracts.md](search-charset-and-identity-contracts.md)
  — charset rules import from search-charset only; SEARCH_KEYWORD_SCHEMA_VERSION
  bump semantics (app auto / file via bound backfill, never through the disk-reading
  worker); gated paged migration pattern; usage identity = source.id everywhere.
- [network-error-classification-contracts.md](network-error-classification-contracts.md)
  — one error belongs to exactly one of transport / timeout / HTTP-status, and
  callers OR the classifiers rather than swapping one in; no blanket `net::err_`
  marker (it claims cancellations and caller bugs); three live error dialects;
  `NetworkTransportError` normalizes at the NetworkService boundary but preserves
  `message` verbatim; classification degrades class → code → message because IPC
  strips identity.

## Quality Check

Before committing main-process DB changes:

```bash
cd apps/core-app
grep -rn "schedule([^)]*withSqliteRetry" src/main --include="*.ts" | grep -v test   # must be empty
npm run typecheck:node
npx vitest run src/main/db/
```
