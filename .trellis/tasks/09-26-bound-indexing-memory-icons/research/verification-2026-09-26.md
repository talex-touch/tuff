# Verification — 2026-09-26 (session talex-touch-31 took the task over)

## Native crash delivery round-trip (items 10–11), isolated instance

Isolated profile: `TUFF_STARTUP_BENCHMARK_USER_DATA_DIR=/tmp/tuff-iso-1964/userData`, synthetic root
`TUFF_FILE_PROVIDER_BASE_WATCH_PATHS=/tmp/tuff-100k/tree`, launched from `apps/core-app` with the
dev `out/main/index.js` build and `ELECTRON_RENDERER_URL=http://127.0.0.1:5173`, CDP port 9334.
The real profile and the boss's running app were not touched.

1. Boot: `Native crash delivery discovery completed phase=idle pending=0`, `Sentry initialized environment=development`.
2. `kill -SEGV <pid>` at 15:24:43 → Crashpad wrote `logs/crashes/pending/b58d3ef3-….dmp` (crashDumps is `logs/crashes` per precore.ts).
3. Relaunch at 15:25:19: `discovery completed phase=discovered pending=1` → `Native crash minidump parsed phase=parsed` (15:25:19.350) → `Native crash event transport completed phase=sent statusCode=200` (15:25:20.374). `pending/` and `completed/` empty afterwards.
4. Independent receipt (Sentry API, org `quotawish`, project `tuff`): event `a66f76b63f954801b5134c9dbf249d61`, platform `native`, mechanism `minidump`, environment `development`, release `2.4.14-beta.41@release`, title `base::MessagePumpNSApplication::DoRun`, group `7755932277`.

Both instances were stopped; total lifetime of the isolated app ≈ 3 minutes. Note: it registered the same global shortcuts (⌥Space etc.) as the boss's dev app while alive; an env switch to skip shortcut registration in isolated runs would make longer soaks safe.

## Icon cutover (items 7–8), real dev app

- Search rows for files now render `tfile:///users/tagzixian/Library/Caches/file-icons/<sha256>.png` (probe: `img.complete=true`, `naturalWidth=64`), several rows sharing one hash file (cache reuse). App rows keep `…/Caches/app-icons/darwin/<hash>` at 256px.
- A row whose database value is still a legacy data URL renders it as before until converted.
- `iconGeneratedBytesCumulative` stayed 0 across the whole home scan: no scan-driven icon production.
- `file_extensions` icon values on the dev profile: 251,627 data URLs / 4,721 paths at 14:50 → 247,231 / 8,687 at 15:27 with only the lazy per-hit path (stale-icon regeneration on changed rows).
- `file-protocol/index.test.ts` failed 4 cases because `getFileIconCacheDirectory()` throws when Electron has no cache/userData path; `onInit` now treats the icon root as optional and logs a warning. `win.test.ts` registry-app case updated to the path contract.

## Legacy conversion (item 9)

`FileProviderIconMigrationService` is scheduled by the original task in `FileProvider.scheduleBackgroundStartupTasks` (once the search worker is ready, after the startup degrade window, minimum 30s), idle-gated per 32-row page, single-row compare-and-update writes through the writer. An extra scheduling call added during the takeover was redundant (the service's `iconMigrationScheduled` guard made it a no-op) and was removed before commit. On the dev profile it converts slowly while the whole-home scan holds the writer: data URLs 251,627 → 245,784 between 14:50 and 15:40.

## Memory (items 12–13 evidence so far, real dev app)

Per-worker heap telemetry added: the writer worker (`search-index`) could never answer the 300ms metrics message while inside synchronous libSQL, so its heap showed as `null`; `Worker#getHeapStatistics` now fills it in. With that, during the whole-home scan every isolate stays small (main heapTotal 105–183MB, search-index 21–25MB, file-index 4–9MB, file-scan ~6MB) while process RSS swings 1.2–5.2GB and `footprint` peaks at 4.8–6.2GB with ~4GB dirty under "App-Specific Tag 14" (the process allocator arena, not V8 — `Malloc*` zones are ~3MB because Electron routes malloc through PartitionAlloc). The V8-heap OOM class from the issue is therefore closed by evidence; the native arena growth during the scan is real, transient (drops after subtrees finish) and not yet attributed. libvips worker threads are idle (condition waits), not the cause.
