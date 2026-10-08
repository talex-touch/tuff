# Implement — TxStreamElement: markdown subset, delegation, citations, one clock, slots + hero showcase

Follow Parent `implement.md` §1.4, §2, §3, §4, §6. Tick the parent checklist items for this child as they land, and record verification evidence (commands, screenshots, measurements) below.

## Verification evidence (2026-09-30 – 2026-10-01)

### Tests

**stream-element: 30 tests in 4 files.**
- `parse` 6
- `plan` 4
- `stream-element` 14
- `stream-element-slots` 6

**Added for the fixes the browser found.** Each has a negative control that fails without its fix.

- **Only the write head re-renders as the clock ticks.** It fails with unmarked slots objects: a settled part re-rendered on every tick.
- **A caret is dropped at once as the write head moves on, and the last one retracts.** This uses real transitions. It fails without `:css="caret"` in `TxStreamText`, and again with the caret kept only at the head.
- **The answer's height is held through a `reserve` replay, and released at the end.** It fails without the style binding, and again without the release.
- **The slots follow the host when one comes or goes.** It fails without the version prop on either functional body.
- **A caret switched off goes at once, and an ending stream retracts it.** One test each in `stream-text.test.ts`, `code-stream-live.test.ts` and `stream-markdown-motion.test.ts`; each fails without its own `:css="caret"`.
- **The space after inline code or a link stays outside it** (`stream-text.test.ts`). It fails with the old `renderRun`.
- **The `block` keyframes variant emits only the block fade** (`stream-text-style.test.ts`).

**Totals.**
- Family: 25 files, 314 tests.
- Full tuffex: 276 files, 3118 tests, all passing.
- The lifecycle gate passes since the user's 0.6.3 registration (`82ced6d83`).

### Types, lint, gates

- **tuffex vue-tsc**, with a probe inside `include` (`packages/components/src/stream-element/__tsc_probe__.ts`): only the probe's deliberate error.
  - Earlier runs put the probe at the package root, outside `include`, so the probe itself never checked anything.
  - The sources were covered either way: a real `RawSlots` import error was caught.
- **Nexus vue-tsc**, with a probe: the probe, plus the pre-existing `nuxt.config.ts` `pwa` error.
- **ESLint**: 0 errors and 0 warnings per workspace, on every touched file.
- **Nexus gates**: fences 0, translation parity 0, demo-registry orphans 0, recategorize `--check` 0. Docs vitest: 53 passed.
- **tuffex audits**: exports, types, readme inventory (166 modules) and size all pass. Full CSS 628.1/629.0 KiB; on-demand 598.6/620.0 across 169 sheets.

### Browser (ego)

- **Where.** TaskSpace 127, then 170 after 127 was gone, on `localhost:3200/zh/docs/dev/components/stream-element`.
- **How.** Timing probes run under a CDP screencast ack loop. That keeps frames flowing; the idle ego window is otherwise throttled.
- **Mid-stream visuals** come from screencast frames and DOM traces. `Page.captureScreenshot` with `captureBeyondViewport` misrendered running animations and, once, a scrolled clip.

**AC10, the hero, dark and light.**
- **State sequence:** 输出中 → 模型停顿 → 输出中 → (收尾) → 完成.
- **`aria-busy`** is `true` until done, then removed.
- **Footer.** It first appears in the frame that reaches 完成; it was present before done in 0 frames.
- **Caret.**
  - Exactly one visible caret on every live frame; no frame has two.
  - The final caret retracts over about 31 frames after done.
- **Presets** each play their keyframes:
  - aurora: fade-blur + hue;
  - hue: fade + hue;
  - blur: fade-blur;
  - languid: languid;
  - none: nothing.

  Code never gets the hue.
- **Replay at 快 / 标准 / 慢:** 1588 / 2371 / 4743 ms, ≈ 16 : 24 : 48. It is disabled while streaming.
- **Chips.** Opening a chip sets the status to 「打开来源 · Dairy API」 and expands the source stack, with no navigation.
- **Thumbs** toggle `aria-pressed`.
- **Done-state screenshots** in both themes: `/tmp/se-verify/shots/hero-dark-done-s.png` and `hero-light-crop.png`.

**AC11, the budget.**

*Concurrent animating words while live* (running animations only): max 21–22, p95 19–20, median 15, against a budget of about 30.
- Finished-but-filled animations in code lines had inflated the first count, which read 79.

*A 5,000-character answer* (5,243 characters, 52 parts), measured by wrapping `requestAnimationFrame` around the pacer's `step` and including the flush it triggers:

| Measure | Before the stable-slots fix | After both fixes |
|---|---|---|
| Per tick, p95 | 2.6 ms (tail) | 0.8 ms (0.9 tail) |
| Ticks over 2 ms | 241 at the tail | 4 of 6,541 |
| Per content update, tail median | 2.7 ms | 1.0 ms |
| Per content update, tail max | 3.3 ms | 1.5 ms |

- The 13.3 ms maximum is the done tick, and it includes the host's footer mounting.
- The CPU profile otherwise showed browser-extension content scripts (ego uses the user's profile). Those run after the measured flush.

*`reserve` replay* (Markdown demo, `play()` called directly so `layout-shift` entries are not excused as input):
- The element height has one value, 480.63 px, throughout.
- The heading below has one position, and the element's top is constant.
- `layout-shift` totals 0.00005, from the caret moving inside.
- Before the fix, the element collapsed 238 px for two frames (CLS 0.085).

**AC12, accessibility.**
- **`aria-busy`** toggles as above.
- **The reserve copy is hidden from assistive technology.**
  - The accessibility tree ignores it (`ariaHiddenElement`).
  - It is also `inert` and `visibility: hidden`.
  - The live layer's content is exposed.
- **Chips.** There are 3. Each has `tabIndex` 0 and takes focus, and their accessible names are `link: Dairy API`, `link: Scoop Data`, `link: Trends Index`.
- **Copy** was clicked with `navigator.clipboard.writeText` stubbed in the page, so the real clipboard was never touched.
  - The captured text equals the answer: 398 of 398 characters.
  - Selecting the live layer covers every word of it.

**The other demos and the gallery cell.**
- **Markdown demo** (table, inline math, task list, code) and **Slots demo** (custom caret, citation, chart part, footer state), checked in both themes.
- **Task checkbox.** It is centred on its item's first line: offset 0 px, 14 × 14, a 6 px gap before the text.
- **Gallery cell.** It holds 108 px through a whole loop in zh and en.

### Incidents

- **The dist was emptied for about 4.5 minutes** (2026-10-01, 21:44:12 → 21:48:39).
  - **Cause.** The corepack pnpm 11.24.0 cache had been cleaned on 09-30 at 12:30: only `.corepack` metadata was left. The build runner prefers `corepack pnpm`, so it failed after gulp had deleted `dist`.
  - **Recovery.** Rebuilt with a `/tmp/pnpm-shim` holding two scripts: a `pnpm` that runs the global pnpm 11.24.0, and a `corepack` that fails, so the runner falls back to `pnpm`.
  - **Left alone.** No shared cache or config was changed. Reported to the user.
  - **Effect.** Neither dev server was running at the time.
- **A foreign vue-tsc overlapped one rebuild.** It was core-app's `tsconfig.node.json` run, which does not read tuffex dist. The gate check printed it but did not stop the build. Since then, any foreign gulp or vue-tsc aborts the rebuild.
- **The Nexus dev server** had been stopped (supervisor SIGTERM at 09:01 on 10-01). I restarted it for verification; it is to be stopped again afterwards.

### Independent check (trellis-check, 2026-10-01)

Report only. The check ran the family suites: 25 files, 314 tests, all passing. Clean:
- the caret rule together with the three `:css="caret"` transitions;
- `forwardedSlots`, which passes an unmarked set the one render after a slot change and the cached `$stable` set otherwise;
- docs against code: the props, events, slots and exposed tables, and the four test counts;
- test strength: real transitions where they matter;
- reduced motion, `aria-hidden` / `inert` on the reserve copies, and focusable chips.

**One low-priority claim: not reproducible.**
- **The claim.** If `skip()` and `replay()` run back to back in one call stack, the replay's first frame would mount parts while `appearing` is still `false`, and a catch-up burst would lose its entrance.
- **Why it does not happen.** `replay()` resets the clock to 0, so that flush mounts no part at all. The first part mounts with the first released word on the next frame, and the `nextTick` that restores `appearing` has run by then.
- **How it was checked.** A temporary test, deleted afterwards:
  - mount, then `skip(); replay()`;
  - assert that no part is mounted;
  - step frames and assert the first part's first entering word is `First`.

  It passes as is. With the restore removed (the claimed failure), it fails with `expected 'paragraph' to be 'First'`. No change was made.
