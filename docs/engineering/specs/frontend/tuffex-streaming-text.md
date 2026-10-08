# TuffEx Streaming Text

> How streamed text is paced, revealed and given a caret, across `TxStreamText`, `TxCodeStream` (streaming mode), `TxStreamMarkdown` and `TxStreamElement`. Established 2026-09-30/10-01 (frozen task `09-29-stream-element`, children 1–5; [handoff](../../workflow/handoffs/09-29-stream-element/README.md)). Read this before touching any of those components, `style/mixins.scss` `stream-reveal-*`, or a host that streams into them.

---

## 1. Scope / Trigger

- Editing `packages/tuffex/packages/components/src/{stream-text,stream-element}/**`, the streaming mode of `code-stream`, or the motion/caret of `stream-markdown`.
- Editing `stream-reveal-keyframes` / `stream-reveal-presets` in `style/mixins.scss`, or the `--tx-stream-reveal-*` / `--tx-stream-caret-*` tokens.
- Writing a host that feeds tokens into these components (docs demos, templates, CoreBox, HomePage).

Not covered: a text *value* changing (`TxTextMorph` and friends) — that is [`tuffex-text-motion.md`](./tuffex-text-motion.md).

---

## 2. Signatures

```ts
// stream-text/src/use-stream-pacer.ts — the one clock
useStreamPacer({
  total: () => number,              // units available now
  streaming: () => boolean,         // the source is still producing
  wordMs?: () => number,            // default 24: one unit per wordMs
  maxLagMs?: () => number,          // default 600: no unit shows later than arrival + maxLagMs
  drainMs?: () => number,           // default 320: after the source ends, release the rest within this
  pauseMs?: () => number,           // default 400: no new unit for this long → 'paused'
  settleMs?: () => number,          // how long a released unit stays "fresh" (its entrance)
  paced?: () => boolean,            // false: release everything at once (a parent paces)
  appear?: boolean,                 // read once: content present at mount enters too
  requestFrame?: ((cb) => number) | null,   // null (SSR, tests): everything released and settled at once
  onState?: (next: StreamState, previous: StreamState) => void,
}): { revealed, settled, state, replay(), skip(), rewind(n) }

type StreamState = 'idle' | 'streaming' | 'paused' | 'draining' | 'done'
type StreamRevealPreset = 'aurora' | 'hue' | 'blur' | 'languid' | 'none'   // 460 / 180 / 420 / 900 / 0 ms
```

```scss
// style/mixins.scss
@include stream-reveal-keyframes($variant: text | code | block);   // code: no colour sweep; block: only tx-stream-fade-blur
.root { @include stream-reveal-presets('.word-selector', $variant: text | code); }
```

Shared component props: `streaming`, `reveal` (default `aurora`), `caret` (default `true`), `reserve`, `wordMs`/`maxLagMs`/`drainMs`/`pauseMs`; `TxStreamText` and `TxCodeStream` also take `paced` (default `true`) and `appear` (default `false`). All expose `{ state, replay, skip }`.

---

## 3. Contracts

### Units

- Words come from `Intl.Segmenter` (`segmentWords`); code words are `/\s*\S+|\s+$/g` (`code-stream/src/units.ts`); a citation or custom inline is **one** unit; a delegated Markdown part counts **one unit per line**.
- `stream-text/src/model.ts` (`buildStreamModel`, `sliceStreamContent`) is shared by `TxStreamText` and `TxStreamElement`: a prefix of the units rebuilds into exactly those units.
- Whitespace: a run's leading space attaches to the unit before it. On render, the space after a run's last word goes **outside** the run's marks (a code pill or a link ends at the word), and the space after an atom is plain text after the atom.
- `href`s from content pass `safeHref`: only `http(s)`, `mailto`, `tel` and relative / query / hash URLs. `//host` and `/\host` are **not** relative (they take the page's scheme, and core-app pages are `file:`); tabs and newlines are stripped before the test.

### The clock

- One pacer per stream. `TxStreamElement` owns the only one for a whole answer; every part gets `paced: false` and a prefix of itself, so parts reveal strictly in order.
- A burst is spread at `1/wordMs` until the oldest waiting unit would miss its `maxLagMs` deadline; then the rate is raised to clear the backlog by that deadline. A live source therefore sets the overall speed — `wordMs` only decides cadence within bursts, and the full pace only on `replay()` of complete content.
- The pause clock starts when the source starts (edge detection in `sync()`), not at mount.
- A part that mounts mid-answer gets `appear` (only after the element itself has mounted, never for the reserve copy, never under reduced motion), so the words already due play their entrance instead of popping in.

### The caret

- `caret: false` removes the caret **at once**; a stream that ends with the caret still on retracts it. Every caret `<Transition>` binds `:css="caret"` (`TxStreamText`, `TxCodeStream` streaming mode, `TxStreamMarkdown`).
- `TxStreamElement` switches the caret off on every part except the one holding the last revealed unit; once the answer is done it keeps that last part's caret on, so the final caret retracts. A handoff never shows two carets and never runs Vue's leave hook (whose `forceReflow` cost a full-page layout per handoff).
- An absolutely positioned caret (`TxStreamMarkdown`) is placed with the **`translate` property**, not `transform`: the individual `scale` of the enter/leave transition composes outside `transform`, and an offset inside `transform` got scaled too (the caret flew in from the corner).

### Motion and reduced motion

- Every animation and transition is declared only under `@media (prefers-reduced-motion: no-preference)`; pinned per component by compiled-SCSS tests.
- Reduced motion also turns pacing off (`paced: () => props.paced && !reduced`): content shows as it arrives, the caret rests.
- Each sheet emits only the keyframes it plays (`block` for `TxStreamElement`); identical keyframes across sheets are harmless — the full bundle folds them.

### Render-function hosts (`TxStreamElement`)

- A hand-written render function force-updates every child it passes a slots object to unless the object is `$stable`. Pass one `$stable` set per layer, whose forwarders read the host's slot at call time.
- A functional body that renders the host's slots re-renders only when its props change: give it the `useSlotVersion(slots)` count (`stream-text/src/use-slot-version.ts`) as a prop, so a host that swaps, adds or removes a slot still reaches every part.
- Keys: `${generation}:${path}${index}:${type}`; `replay()`/`skip()` bump `generation` (replay remounts from empty, skip mounts complete without entrances). A text part's model is cached by `JSON.stringify(inlines)` so unchanged parts keep their content identity.

### Reserve

- The reserve copy is `aria-hidden` + `inert` + `visibility: hidden`, in the same grid cell as the live layer, and exists only while complete content plays back.
- `TxStreamElement.replay()` also holds the live layer at its current height (`getBoundingClientRect`, fractional) until the copy is gone: the copy's delegated parts render a frame or two late.
- The live layer and the copy trim their first child's top margin and last child's bottom margin, so block and grid layout measure the same. Hosts give a `footer` its own top spacing.

---

## 4. Validation & Error Matrix

| Condition | Behaviour |
|---|---|
| `[n]` with no `sources[n - 1]` | stays text |
| `[n]` inside code or link text | never a chip |
| source stops with a backlog | `draining`, everything out within `drainMs`, then `done` |
| no new unit for `pauseMs` while `streaming` | `paused` (the caret keeps showing) |
| content shrinks or a word is rewritten | `rewind` to the first changed unit; a word that merely grew keeps its place |
| content present at mount, not streaming | shown as is, state `done`, no `done` event |
| `requestFrame: null` / SSR | everything released and settled at once, no timers, no animated elements |
| `reserve` while `streaming` | ignored |
| renderers object kept in reactive state | the element `toRaw`s it before `h()` |

---

## 5. Good / Base / Bad

- **Good:** `TxStreamElement` with `content` + `streaming`, `sources`, actions/sources/follow-ups in `#footer` behind `done` (docs hero `StreamElementAnswerDemo`, template `TemplateAiAnswerDemo`).
- **Base:** `TxStreamText` alone for one run of text; `TxCodeStream` with `streaming` for code.
- **Bad:** a host that passes only the latest delta, sets `streaming` false before the source ends, copies what is on screen, or re-streams through "Replay" and expects `wordMs` to change the speed.

---

## 6. Tests Required

- Pacer (`stream-text/__tests__/pacer.test.ts`): cadence, deadline catch-up, drain, pause clock from the source start, `appear`, rewind, replay/skip, SSR.
- Units/model (`model.test.ts`, `segment.test.ts`): prefix round-trip across marks, links, citations, custom inlines, CJK, emoji.
- Each component: one caret at the write head; `caret: false` removes it at once and an ending stream retracts it — with **real** transitions (`global: { stubs: { transition: false } }`; the default stub removes a leaving node either way).
- `TxStreamElement`: only the write-head part re-renders as the clock ticks (count `updated` per `TxStreamText`; advance frame by frame — one big `advanceTimersByTime` never interleaves Vue's flushes, so parts mount late and "settle" in the next phase); slots follow a host that adds/removes one; the replay holds the height and releases it.
- Style contracts (`*-style.test.ts`): animations only under `no-preference`; preset keyframes; variants.
- Each new assertion gets a negative control that fails without the fix.
- Browser budget (`R14`): ≤ ~30 concurrently **running** reveal animations (count `playState === 'running'`; finished-but-filled ones stay in `getAnimations()`), per-tick main-thread p95 < 2 ms at 5,000 characters, no layout shift in a `reserve` replay.

---

## 7. Wrong vs Correct

#### Wrong — fresh slots on every render

```ts
h(TxStreamText, { content, streaming: head }, {
  citation: scope => slots.citation!(scope),   // new object, not $stable: every part re-renders every tick
})
```

#### Correct

```ts
// once per layer, rebuilt only when useSlotVersion() moves
const text = { $stable: true, ...(slots.citation ? { citation: (s: any) => slots.citation?.(s) } : {}) }
h(TxStreamText, { content, streaming: head, caret: props.caret && last }, text)
```

#### Wrong — positioning a scaled caret through `transform`

```ts
caret.style.transform = `translate(${x}px, ${y}px)`   // the Transition's `scale` scales the offset too
```

#### Correct

```ts
caret.style.translate = `${x}px ${y}px`
```
