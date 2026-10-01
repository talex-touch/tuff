# Implement — StreamText foundation: presets, tokens, segmenter, pacer, logo caret, TxStreamText

Follow Parent `implement.md` §1.1 checklist, §2 validation, §3 dist rebuild, §4 dev-server restart, §6 risky files. Tick the parent checklist items for this child as they land, and record verification evidence (commands, screenshots, measurements) below.

## Verification evidence (2026-09-30)

Commands are those of parent `implement.md` §2.

### Tests

- **tuffex:** `stream-text` 46/46 in four files: `segment` 7, `pacer` 15, `stream-text` 15, `stream-text-style` 9. With the shared guards (`suite-barrels`, `global-install`, `unscoped-deep-selectors`, `dark-fill-tints`, `bui-dark-neutral-ramp`) and `inline-citation`, 10 files and 69 tests pass.
- **Negative controls:**
  - The pause-clock test fails on the pre-fix pacer (`expected 'paused' to be 'streaming'`).
  - The zero-inline-size test fails with the caret box at `width: 0.4em`.
  - The code-variant test fails when `stream-reveal-keyframes(code)` also emits `tx-stream-hue`.
  - The scheme-relative link test fails on the old `SAFE_HREF`: all four spellings rendered as links.
  - An ungated `animation` rule planted in `TxStreamCaret.vue` fails the motion-gating test. The style tests read compiled CSS, not source.

### Types

- **tuffex vue-tsc:** with a probe planted in `stream-text/src/__tsc_probe__.ts`, exactly 1 error, the probe's own. The same probe's expose lines type-check: `instance.state` is `StreamState`, and `replay()` and `skip()` are callable. After the link fix and with the probe removed: 0 errors.
- **Nexus vue-tsc:** only the `nuxt.config.ts(713,3)` `pwa` error, which predates this work (also present in the 2026-09-29 baselines). No errors in the changed files.

### Lint and Nexus gates

- **ESLint, never `--fix`:**
  - tuffex `stream-text/**`, `components.ts`, `ai/index.ts`: 0 errors, 0 warnings. The two SCSS files are outside the lint config.
  - Nexus demos, gallery cell, `demo-registry.ts`: 0 errors, 0 warnings.
- **Nexus gates:** `check-mdc-fences` 0, `check-doc-translation-parity` 0, `check-demo-registry-orphans` "ok"; `test/docs` + both docs performance tests 53/53.

### Dist

- Rebuilt at 00:49 in 29 s under `/tmp/tuffex-build.lock` with a backup.
- `dist/es` has 178 entries; `stream-text/style.css` is 3231 B; `style-deps.json` lists `stream-text` → `inline-citation`, `liquid`.
- Both fixes are confirmed in dist: `wasStreaming` in `use-stream-pacer.js`, the `\p{P}$` tail rule in `TxStreamText.vue.js`.
- Nexus was restarted through the supervisor (back in about 39 s).

### Browser (ego, TaskSpace 127, `localhost:3200/zh/docs/dev/components/stream-text`)

- **Dark.** A CDP screencast filmstrip shows the aurora trail: blur plus the blue → violet → pink sweep, settling on the ink. At most about 19 words are entering at once. The caret orbits during streaming and breathes during the pause.
- **Light** (`/tmp/st-verify/light-strip-s.png`). The sweep reads on white, the caret is visible, and the caret retracts at done.
- **State walk after both fixes**, from a MutationObserver on the state label:
  - Replay +3 ms: 输出中.
  - 1323 ms: 模型停顿. That is the scripted 1600 ms pause minus `pauseMs` 400.
  - 2513 ms: 输出中.
  - 3062 ms: 收尾.
  - 3072 ms: 完成.

  During the pause the text ends 「…从屏幕上驶过。」. Before the fixes, the first state was 模型停顿, and the pause hid 「过。」.
- **Presets.** Switching sets `is-reveal-blur`. `reserve` is on while the replay plays (seen at 4 ms) and off after it (664 ms). The paragraph height stays 47.6 px throughout.
- **Slots.** Numbered citation buttons, the `+23%` delta inline, and a state · cite readout.
- **Reduced motion** (`Emulation.setEmulatedMedia`):
  - The root has `is-reveal-none`; there are no word spans, and the caret runs 0 animations.
  - The caret is removed at done. The leave-active `transition-duration` computes to `0s`, and removal waits only for Vue's double rAF.
  - An idle, occluded ego window runs rAF at about 1 Hz (8 frames in 4 s), so a rAF-polled measurement shows about 1 s. That comes from the environment, not the component.
- **Gallery cell** (`/zh/docs/dev/components/ai-suite`, `/tmp/st-verify/gallery-pair.png`):
  - It rests on the full sentence.
  - The loop streams 38 characters in about 920 ms, with at most 12 fresh words at once, and the caret is visible.
  - The height stays 66 px throughout.

### Publish chain and README (added after the check)

- **`audit-readme-inventory`** was failing: both READMEs claimed 164 modules and lacked `stream-text`. Now it reports 165 in both languages: the count lines are updated and `stream-text` is added to Reasoning, which goes 8 → 9.
- **`audit-package-size`** was failing: the full bundle was 624.7 KiB against a 623.0 limit. Re-baselined 623 → 626 with a dated note in `scripts/audit-package-size.mjs`.
  - `stream-text/style.css` (3231 B) appears verbatim in `components.css`; without it the bundle is 621.5 KiB.
  - The sheet carries only `.tx-stream-text*` and `.tx-stream-caret*` rules and `tx-stream-*` keyframes.
  - The on-demand total is 594.6 KiB of its 620 limit, so that limit is unchanged.
- `audit-package-exports` and `audit-package-types` pass. Both self-tests pass (`readme`, `size`).
- **core-app `vue-tsc -p tsconfig.web.json --composite false`** (only the vue-tsc half of `typecheck:web`, so the tuffex dist was not rebuilt without the lock): 9 errors, none in tuffex. All nine are in core-app's own `useResultExposure`, `useSearch` and `ApplicationIndex.vue`, which are other sessions' in-flight recommendation and search work in this tree. stream-text is in that program, compiled under `noUnusedLocals`: core-app's `widget-registry.ts` imports the `@talex-touch/tuffex` root, which maps to `components/src/index.ts`, which does `export * from './components'`.
- **`component-lifecycle-gate.test.ts` is red:** `Exported component "stream-text" is missing a "since" version declaration`. It needs a release: bump the version, write the chapter, add the lifecycle entries. That is the user's decision; see `design.md` › Build and docs. The change is recorded under CHANGELOG `## [Unreleased]`, and the docs `since` is 0.6.3 (0.6.2 is already on npm).

### Independent check (trellis-check, 2026-09-30)

- **Security, fixed.** `SAFE_HREF` let a scheme-relative `//host` through, because `[/#?.]` accepted any leading `/`.
  - A `//host` link takes the page's scheme, and core-app's pages load with `loadFile` (`file:`). On Windows, `file://host/…` is a network share.
  - The rule now rejects `/` followed by `/` or `\`, and strips tabs and newlines first as the URL parser does, so `/\t/host` cannot slip past.
  - New test: 4 spellings stay text; `/docs`, `./page`, `#part` and `?q=1` still link.
  - Docs Overview says so in both languages.
- **Process, fixed.** ESLint must run per workspace: the root config parses `.vue` as plain JS. The parent `implement.md` §2 now says so.
- Nothing found in: pacer / rewrite / rewind / tail-hold logic, docs accuracy, the registration chain, or test quality.
- **Not changed (outside this child):**
  - `TxInlineCitation` and `TxSources` pass `source.url` to `href` unfiltered. Both `preventDefault` on click and emit `open`, so a click never navigates.
  - The root-config ESLint run also lists three pre-existing `perfectionist/sort-exports` hits in `components.ts`, none next to the stream-text line.
