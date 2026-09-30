# Design — StreamText foundation: presets, tokens, segmenter, pacer, logo caret, TxStreamText

The design lives in the parent: Parent `design.md` §1 (shape), §2.1–§2.5 (presets, units, pacer, caret, state/slots), §3 (`TxStreamText`), §7 (docs/gallery rows for stream-text). Record child-specific decisions or deviations below as they arise.

## Deviations from the parent design

Children 2–4 build on these; where the parent `design.md` and this list disagree, this list is what the code does.

### Presets (parent §2.1)

- **No `-a` / `-b` keyframe pairs.** `replay()` sets `revealed` back to 0, so every word span unmounts and a new element mounts in its place; a new element starts its animation from 0% on its own, with no name flip and no forced reflow. AC1's "second-keyframe replay" is covered by the pacer replay test plus that remount.
- **Mixin names:** `stream-reveal-keyframes($variant: text | code)` emits the keyframes (`tx-stream-fade`, `tx-stream-fade-blur`, `tx-stream-languid`, and `tx-stream-hue` for text only). `stream-reveal-presets($word, $variant)` emits every preset rule for one word selector, not one preset per include, because the preset is a root class and a component needs all of them.
- The duration is written once, as `--tx-stream-reveal-duration` on the root, and each preset reads it with its own fallback. The hue keyframes have no 100% stop, so the sweep ends on the inherited ink.

### Word units (parent §2.2)

- `segmentWords(text, locale = 'zh'): WordUnit[]` with `WordUnit = { text, ws }`. Whitespace is carried as the unit's trailing `ws`, outside the animated span, so a space never animates and never holds a word back.
- Opening brackets and quotes (`\p{Ps}\p{Pi}`) lead the next word; other punctuation clings to the word before it.
- Keys are assigned by the renderer: `w{index}` for fresh words, `r{run}` for runs, `a{index}` for atoms. The segmenter does not assign `b{block}:{index}` keys.

### Pacer (parent §2.3)

- **The catch-up rule is a deadline, not a proportional rate.** Each unit records when it arrived (`arrivedAt`). While streaming, the release rate is `max(1/wordMs, backlog / (arrivedAt[oldest waiting] + maxLagMs − now))`, so the oldest waiting unit shows by its deadline and a burst clears evenly. `backlog / maxLagMs` recomputed every frame decays exponentially and never clears a burst in time; tests caught that.
- **The drain rate is fixed** when the source stops: `max(1/wordMs, backlog / drainMs)`, held until done.
- **Replay** plays at `wordMs` with no lag bound; nothing is arriving. `replaying` clears once everything is shown.
- **The first unit after a quiet spell** goes out on the next frame, not a whole `wordMs` later (`lastEmit` starts at −∞).
- **The pause clock starts when the source starts.** `sync()` detects the rising and falling edges of `streaming` itself. It cannot be the watcher, because a rewrite reaches `sync()` through `rewind()` before the watcher runs. Found in ego: a stream starting after the component had been idle for more than 400 ms reported `paused` before its first token.
- **API additions:**
  - `settled` plus a `settleMs` option drive the settled/fresh split of §3.2.
  - `rewind(index)` handles rewrites; `stop()` handles disposal.
  - `requestFrame: null` means no clock (SSR): everything shows and settles at once, and no timer is left behind.
  - Frame and timer functions are injectable for tests.
- **Reduced motion:** preset `none` (`settleMs` 0) and `paced: false`, so words show as they arrive.

### Tail hold (new; parent §3.2 only said "wait for whitespace")

While `streaming`, the last unit is held back only if it is a word with no trailing whitespace and does not end on punctuation (`\p{P}$`). It shows anyway once the content has been unchanged for 200 ms (`TAIL_GRACE_MS`), because Chinese has no spaces and a model can stop mid-sentence. Found in ego: during the demo's scripted pause, the last word 「驶过。」 stayed hidden for the whole pause.

### Caret (parent §2.4)

- The zero-width box is `span.tx-stream-text__caret` in `TxStreamText`, wrapping the `caret` slot. `TxStreamCaret` (0.95em, sized in em, so there is no `size` prop) hangs out of it absolutely at `left: 0.22em`.
- The retract is a Vue `<Transition name="tx-stream-text-caret">` on that wrapper: leave takes 260 ms (opacity + scale), enter 300 ms, both only under `no-preference`. A slot caret therefore retracts the same way as the default.
- `TxStreamCaret` takes only `state`.

### Props and slots (parent §3.1)

- Added `pauseMs` and `locale`.
- The citation inline also takes `index?`, which the chip and the slot receive.
- Custom inlines render through one `inline` slot with `{ name, props }`, not per-name `inline-<name>` slots. That keeps the slot contract static and typed with `defineSlots`.

### Instance typing (parent §2.5)

`TxStreamTextInstance = InstanceType<typeof TxStreamText>`. The SFC is not generic, so there is no hand-written interface, and therefore nothing for `instance-drift.contract.ts` to guard (that file exists only for hand-written interfaces). The expose surface was checked with a vue-tsc probe: `state` unwraps to `StreamState`, and `replay()` and `skip()` are callable.

### Build and docs

- `useReducedMotion` comes from `liquid`, so the build lists `liquid` as a style dependency of `stream-text` (502 B of CSS). Accepted rather than duplicating the composable.
- There is no separate `caret.test.ts`. Caret behaviour is pinned in two places:
  - `stream-text.test.ts`: live/done, `aria-hidden`, the slot.
  - `stream-text-style.test.ts`: compositor-only loops, logo tokens, zero inline size, motion-gated declarations.
- Frontmatter `since: 0.6.3` is the tuffex version stream-text will first ship in. 0.6.2 has been on npm since 2026-09-29 02:43Z without it, even though `package.json` still says 0.6.2. It was first written as 0.6.2 and corrected.
- **Release pending (the user's decision).** `components-lifecycle.json` has no `stream-text` entry yet, so `component-lifecycle-gate.test.ts` (`audit-version-changelog`) is red. Registering it needs `since` ≤ the package version, which means bumping to the release that ships it: CHANGELOG `[Unreleased]` becomes a version chapter, the lifecycle gets a version entry plus a component entry, and both Nexus `changelog.*.mdc` pages are updated. Until then the entry sits under CHANGELOG `## [Unreleased]`.
