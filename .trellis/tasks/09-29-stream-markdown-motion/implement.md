# Implement — TxStreamMarkdown: shared reveal presets + logo caret + live gallery cell

Follow Parent `implement.md` §1.3, §2, §3, §4, §5. Tick the parent checklist items for this child as they land, and record verification evidence (commands, screenshots, measurements) below.

## Verification evidence (2026-09-30)

### Tests

- **Existing stream-markdown suites pass unchanged:** 156 tests across 11 files, including the 23 in `stream-markdown.test.ts` that assert the `--tail` class, the block cursor, the settled state and the mask.
- **New `stream-markdown-motion.test.ts` (12).** Style contract, 6 tests:
  - motion only under `no-preference`;
  - fresh text with the text-variant presets;
  - a `languid` chunk kept inline;
  - the block entrance on the shared keyframes;
  - no orb (no `tx-stream-md-*` keyframes, no pseudo-element caret, no radial gradient);
  - a zero-size caret box.
- **Caret, 4 tests:**
  - one caret while streaming, none once settled or before content;
  - the paragraph-tail anchor, `translate` `120.0px 50.0px` with `transform` empty;
  - the fence tail on the cursor line;
  - the same caret element across an inline → block switch.
- **Preset, 2 tests:** root class and duration (`aurora` 460 ms, `hue` 180 ms), and reduced motion giving `is-reveal-none` with no fresh spans.
- **Totals:** stream-markdown 168 tests in 12 files; with markdown-view (including its `.tx-md` scope contract), 182 tests in 14 files.

### Types and lint

- tuffex vue-tsc: 0 errors.
- ESLint, per workspace, 0 errors and 0 warnings on:
  - `stream-markdown/**`;
  - the Nexus gallery component and `DocsComponentsGallery.vue`.

### Nexus gates

`check-mdc-fences` 0 and `check-doc-translation-parity` 0 (stream-markdown and stream-text docs).

### Dist

- An external `pnpm -F @talex-touch/tuffex run build` (another session's core-app `typecheck:web`) rebuilt dist at 02:08:52 without the lock. It already carried these changes; I did not rebuild while its vue-tsc ran.
- After the `translate` fix, I rebuilt under the lock at 02:15 (26 s).
- `audit-package-size` passes: full bundle 625.7/626.0 KiB, on-demand 596.2/620.0.

### Browser (ego, `localhost:3200/zh/docs/dev/components/stream-markdown`)

- **Caret placement**, from a MutationObserver on the caret box's `style`, measured at each placement against the last character's `Range` rect (inline) or the cursor line (block). The screencast keeps frames flowing; the ego window is otherwise throttled to about 4 fps.
  - **After the fix:** 28 placements (21 inline, 7 block, 7 mid-scale), with **one caret element** throughout. The largest error is 0.04 px across and 0.05 px down inline, and 0 / 0.04 px on the block line.
  - **Before the fix** (`transform` positioning): up to 34.4 px across and 19.5 px down, all during the enter `scale`.
- **Filmstrip** (`/tmp/md-verify/strip.png`, dark):
  - the paragraph tail with the caret after 「…so the reduce is not」;
  - the caret on its own line below the growing fence;
  - no caret at the end.
- **Gallery cell** (`/zh/docs/dev/components/ai-suite`):
  - it loops every ~6.8 s and streams in ~1.2 s;
  - the caret is seen, with at most 4 fresh spans at once;
  - the height stays 168 px throughout;
  - list bullets are restored, with 22.4 px padding (`/tmp/md-verify/gallery-rest2-s.png`).

### HomePage (parent §5): isolated core-app dev instance

- **Launch.**
  - Started through `scripts/dev-electron-wrapper.mjs` with `REMOTE_DEBUGGING_PORT=9335`, `TUFF_DEV_SERVER_PORT=5393`, `TUFF_STARTUP_BENCHMARK_USER_DATA_DIR=/tmp/tuff-md-verify/userdata`, `TUFF_DISABLE_GLOBAL_SHORTCUTS=1` and `TUFF_DISABLE_NATIVE_AUDIO=1`.
  - Chromium flags: `--disable-renderer-backgrounding --disable-backgrounding-occluded-windows --disable-background-timer-throttling`.
- **Setup.**
  - The onboarding gate was passed via `storage:app:save` (`beginner.init: true`), then `Page.reload`.
  - The theme was set through `theme-style.ini` (`{ auto: false, dark }`).
  - The scripted stream went through HomePage's `setupState.conversation.restore`:
    - a user message, then an assistant message whose `content` grows in 2–7-character bursts every 25–70 ms, pausing 1.5 s after 「the fetch is.」, then `status: 'complete'`;
    - this is the fallback call site, where `streaming = status === 'streaming'`.
- **Dark.** Paused at 1164 ms, done at 5096 ms. 19 placements (11 inline, 8 block, 2 mid-scale), one caret element, largest error 0.05 px; at the end, no caret and 0 fresh spans. Root: `tx-md tx-stream-md dark is-reveal-aurora HomePage-Reply`. Filmstrip `/tmp/tuff-md-verify/home-strip.png`.
- **Light.** 32 placements (26 inline, 6 block, 5 mid-scale), one caret element, largest error 0.05 px. Filmstrip `/tmp/tuff-md-verify/home-strip-light.png`.
- **Reduced motion** (emulated): `is-reveal-none`, 0 fresh spans, block `animationName` `none`, the caret runs 0 animations, and it retracts at the end.
- **Teardown.** The instance was stopped by PID: SIGTERM to the wrapper (89879), and the whole tree exited within 7 s. Ports 5393 and 9335 are free. The user's own dev instance (vite 5173, pid 48006) kept running throughout.

### Incident

`TxStreamMarkdown.vue` was truncated to 0 bytes for about a minute.
- **Cause.** A Python edit wrote a non-raw `'\uDC00'` (a lone surrogate); `write_text` truncated the file, then failed to encode.
- **Recovery.** The file had no uncommitted changes, so it was restored with `git show "HEAD:<path>" > <path>`. The byte count matched HEAD (23855), `git diff` was empty, and the edit was redone as encode first, temp file, `os.replace`.
- **Effect.** The user's running core-app dev server on 5173 compiles tuffex source, so its HMR may have briefly seen the empty SFC.
- Recorded in memory as `python-write-text-truncates-before-encoding`.

### Independent check (trellis-check, 2026-09-30)

The first run stalled on the agent's side (a watchdog timeout after 600 s with no findings) and was re-run. The re-run found:

1. **Docs said `transform`; the code uses `translate`.** CHANGELOG and both `stream-markdown` pages still carried the pre-fix wording, which invites a "fix" back to `transform` that would bring back the flying caret. Fixed; the docs now also say why.
2. **The new `caret` prop was undocumented.** Rows added in zh and en; CHANGELOG mentions it.
3. **An inline tail with no text yet** (for example `## ` before the heading's words) left the caret at its previous spot, or at the corner on a first placement. It now anchors at the start of the last paragraph, heading or quote. The fix is not the tail's last child: the fresh-chunk tracker wraps the newline after `<h2></h2>` in a fresh span (seen in a jsdom debug run), which is how the first fix attempt failed. New test: "waits at the start of a block that has opened but holds no words yet". stream-markdown now has 169 tests, all passing.

Nothing else was found in regressions, caret logic, SSR, tracker recreation, spec compliance or test hygiene.
