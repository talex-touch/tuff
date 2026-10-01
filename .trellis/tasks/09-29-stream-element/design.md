# Design — StreamElement family

Requirements and decisions: `prd.md` (D1–D9, R1–R15). Evidence: `research/*.md`.

## 1. Shape of the family

```
TxStreamElement  (stream-element/)          content: markdown | parts[] → one pacer, in document order
├─ text-like parts ──► TxStreamText        (stream-text/)   words, marks, inline components
├─ code parts ───────► TxCodeStream        (code-stream/)   = TxStreamCode alias (D5)
├─ citation inline ──► TxInlineCitation    (inline-citation/, unchanged)
├─ delegated span ───► TxStreamMarkdown    (stream-markdown/) tables, math, mermaid, html, images (D4)
└─ custom part ──────► slot / renderer     (D9)

shared (stream-text/src/, imported by the others)
  segment.ts          word units (R2)
  use-stream-pacer.ts the clock (R3)
  TxStreamCaret.vue   logo caret (R4, D8)
  types.ts            StreamState, StreamRevealPreset, StreamPart …
style/mixins.scss     stream-reveal keyframe mixins (R1)
style/variables.scss  --tx-stream-reveal-1/2/3, --tx-stream-caret-start/end (light + .dark)
```

Why `stream-text/` hosts the shared pieces: the text primitive is the only dependency every other member has; components already import siblings by path (`TxBadge` → `../../text-morph/src/TxTextMorph.vue`), and the on-demand style build carries a sibling's sheet as a style dependency. `TxStreamCaret` is exported from `stream-text/index.ts` too, so hosts can place it themselves.

Why not `TxTextMorph`: its engine diffs one known value into another and owns the DOM after mount (`tuffex-text-motion.md`); streaming is append-mostly, needs inline Vue components (citation chips) and a pacer, and must stay in Vue's render tree. The spec forbids a second *morph* engine, not an append reveal — this family never morphs a value.

## 2. Shared foundation

### 2.1 Reveal presets (R1)

`StreamRevealPreset = 'aurora' | 'hue' | 'blur' | 'languid' | 'none'`, default `'aurora'`.

| Preset | Keyframes | Duration / easing | Source |
|---|---|---|---|
| `aurora` | opacity 0 + blur(4px) → 1 + none; colour stop-1 (0%) → stop-2 (30%) → stop-3 (60%) → inherit (100%), linear | 460 ms, `cubic-bezier(.22,.61,.25,1)` | D2 (prototype B) |
| `hue` | opacity 0 → 1; same colour sweep | 180 ms, `cubic-bezier(.25,.1,.25,1)` | kobra |
| `blur` | opacity 0 + blur(4px) → 1 | 420 ms, `cubic-bezier(.22,.61,.25,1)` | BUI |
| `languid` | opacity 0 + blur(8px) + translateY(4px) → rest | 900 ms, `cubic-bezier(.22,1,.36,1)` | Home motion language |
| `none` | — | — | |

- Implemented as SCSS mixins in `style/mixins.scss` (`@include stream-reveal-keyframes;` + `@include stream-reveal($preset, $variant)`), included by each member, the way the BUI keyframe mixins are (duplicate keyframe bodies per sheet are the accepted cost, `08-15-beautiful-ui-port/research/style-bridge-and-conventions.md:434`).
- Selection is a class on the root (`.is-reveal-aurora` …); duration is a custom property read by `animation-duration`, never inside keyframes (`tuffex-design-rules.md` "A looping effect runs on the compositor …" generalised to all our keyframes).
- **Colour tokens:** `--tx-stream-reveal-1/2/3` in `variables.scss`: light `oklch(70% .14 250)`, `oklch(58% .17 295)`, `oklch(62% .13 350)`; `.dark` `oklch(78% .13 250)`, `oklch(72% .16 295)`, `oklch(76% .12 350)` (kobra's values); high-contrast blocks set all three to the ink so the sweep disappears rather than lowering contrast. Components read them with the `var(--tx-stream-reveal-1, …)` fallback form.
- **Code variant:** the same opacity/blur track, no colour track (kobra's code words show no tint).
- **Reduced motion:** the animation is declared inside `@media (prefers-reduced-motion: no-preference)`, so a reduced-motion word simply rests at its finished style (`tuffex-design-rules.md:188-198`, the smaller accepted form).
- **Replay:** every keyframe exists twice (`…-a` / `…-b`); `replay()` flips a root class to switch the name, so re-mounted words restart without a forced reflow (`tuffex-design-rules.md:230-245`).

### 2.2 Word units (R2) — `stream-text/src/segment.ts`

```ts
export interface StreamUnit { key: string, text: string, kind: 'word' | 'inline' }
export function segmentWords(text: string, locale?: string): string[]
```

- `Intl.Segmenter(locale ?? 'zh', { granularity: 'word' })`. A segment that is only whitespace or punctuation joins the previous unit, so layout never waits on a bare space and a Chinese comma rides with its word; a leading one joins the next unit.
- Fallback without `Intl.Segmenter`: split on `(\s+)` for Latin; CJK runs split per character (`/[㐀-鿿豈-﫿]/`).
- Unit keys are positional (`b{block}:{index}`) — stable while the text only grows; see 3.2 for rewrites.

### 2.3 Pacer (R3) — `stream-text/src/use-stream-pacer.ts`

```ts
export type StreamState = 'idle' | 'streaming' | 'paused' | 'draining' | 'done'
export interface StreamPacerOptions {
  total: () => number          // units available now (grows with content)
  streaming: () => boolean
  wordMs?: () => number        // default 24
  maxLagMs?: () => number      // default 600
  drainMs?: () => number       // default 320
  pauseMs?: () => number       // default 400
  paced?: () => boolean        // false → reveal = total (parent paces, reduced motion, SSR)
  now?: () => number; raf?: (cb) => number; caf?: (id) => void   // injectable for tests
}
export interface StreamPacer {
  revealed: Readonly<Ref<number>>
  state: Readonly<Ref<StreamState>>
  replay: () => void           // revealed → 0, state → streaming/draining, restart clock
  skip: () => void             // revealed → total, state → done (or streaming if still streaming)
}
```

Per frame: `backlog = total - revealed`. Base rate: one unit per `wordMs`. If `backlog * wordMs > maxLagMs`, the rate becomes `backlog / maxLagMs` units per ms so the backlog clears within `maxLagMs`. When `streaming` is false the rate becomes `backlog / drainMs`, then `done`. Fractional units accumulate in a carry so rates below one unit per frame stay exact. The loop runs only while there is backlog or a state timer pending; a hidden tab stops rAF and the catch-up rule handles the return. `paused` = streaming, backlog 0, and no new unit for `pauseMs`. `idle` = nothing revealed yet and nothing to reveal. Reduced motion (matchMedia, listened) and SSR force `paced = false`.

### 2.4 Caret (R4, D8) — `stream-text/src/TxStreamCaret.vue`

```
<span class="tx-stream-caret" :data-state aria-hidden="true">      ← inline-block, inline-size 0, overflow visible
  <span class="…__box">                                            ← 1em square, absolutely placed after the text end
    <svg class="…__orbit" viewBox="0 0 100 100"> arc: r 44, stroke 9, dash 190/400, gradient start→end </svg>  rotate 1.6s ease-in-out ∞
    <svg class="…__core"  viewBox="22 22 56 56"> logo core path, 45° gradient fill </svg>                        scale .82↔1.04 + opacity 1.8s alternate ∞, drop-shadow glow
</span></span>
```

- Tokens `--tx-stream-caret-start` (#199FFE-derived) / `--tx-stream-caret-end` (#810DC6-derived) with light/dark values; gradient stops read them through `stop-color: var(…)`.
- Zero inline size keeps wrapping identical to the reserve layer (3.4). States: `streaming` / `paused` loop; `draining` loops; `done` plays the retract (`scale .4` + `opacity 0`, 260 ms `cubic-bezier(.4,0,1,1)`) then unmounts. Under reduced motion the loops are declared only in `no-preference`, so it rests as a still arc + core.
- Props: `state?: StreamState` (drives retract), `size?: string` (default `1em`). Exported for hosts (`TxStreamCaret`) and used by every member.

### 2.5 State, slots, instance (R5, D9)

Common to `TxStreamText`, `TxStreamElement` and `TxCodeStream`'s content-driven mode:

- Emits `state-change: [state: StreamState]`, `done: []` (once per play-through).
- Slot `caret: { state }` replaces `TxStreamCaret`; `:caret="false"` removes it.
- `defineExpose({ state, replay, skip })` — `state` exposed as the unwrapped value (the instance-typing rule from `08-05-tuffex-ai-conversation-stream/design.md:84-85`), with an `*Instance` drift-contract entry.

## 3. `TxStreamText` (R6)

### 3.1 Props / API

```ts
interface StreamTextProps {
  content: string | StreamInline[]      // plain text, or runs with marks + inline components
  streaming?: boolean                   // default false
  wordMs?: number; maxLagMs?: number; drainMs?: number
  reveal?: StreamRevealPreset          // default 'aurora'
  caret?: boolean                       // default true
  reserve?: boolean                     // default false; only meaningful when content is complete
  paced?: boolean                       // default true; TxStreamElement passes false
  tag?: string                          // default 'span'
}
type StreamInline =
  | { type: 'text', text: string, marks?: ('strong' | 'em' | 'del' | 'code')[], href?: string }
  | { type: 'citation', source: AiSourceItem, label?: string }
  | { type: 'custom', name: string, props?: Record<string, unknown> }   // rendered by slot `inline-<name>`
```

### 3.2 Rendering model

- `units = flatten(content)`; each text run is segmented (2.2), each `citation` / `custom` inline is one unit.
- **Settled / fresh split:** units revealed more than one preset duration ago are *settled* and render merged — adjacent text of the same marks becomes one text node, inline components stay components. Only *fresh* units (the last ~duration ÷ cadence) render as `<span class="tx-stream-word">`. Per tick Vue diffs ~20 vnodes regardless of answer length (R14), and a finished word is plain text, so nothing keeps a compositing layer.
- **Rewrites:** on a `content` change the new unit list is compared with the old by longest common prefix of unit text; units after the divergence re-render, and only those beyond the old `revealed` count animate. A rewrite never replays settled words.
- **Citations:** `TxInlineCitation` with `appear=false` (the reveal preset animates the chip like a word); its `open` is re-emitted as `cite`.

### 3.3 SSR and hydration

On the server the pacer is off and everything renders settled (no fresh spans), so a server-rendered answer does not animate on load, and hydration matches because the client's first render also treats existing content as settled when `streaming` is false.

### 3.4 Reserve layer

With `reserve`, the root becomes a one-cell grid: an `aria-hidden` + `inert` + `visibility: hidden` copy of the full content in cell 1/1 holds the final size, and the live layer sits in the same cell. The caret's zero inline size keeps both layers' line breaks identical. `reserve` is ignored while `streaming` (the final text is unknown).

## 4. `TxCodeStream` content-driven mode (R7, D5)

- Mode selection: `streaming` present (boolean, either value) **and** `revealedLines` absent → content-driven; otherwise the current behaviour, untouched.
- Code units are word-ish runs (`/\s+|[^\s]+/`), so indentation arrives with the next word.
- The pacer reveals a prefix of `code`; lines render from the highlighted source as today (`plainLines` / shiki split). While streaming, the tail line is highlighted on the 120 ms coalescing cadence TxCodeBlock uses (`STREAM_HIGHLIGHT_INTERVAL_MS`), and newly revealed characters are wrapped by `createFreshChunks({ className: 'tx-bui-code-stream__fresh', durationMs })` (from `stream-markdown/src/use-fresh-chunks.ts`) after each patch, so animations survive the `v-html` re-render with negative delays.
- Height is not pre-reserved in this mode (total lines unknown) unless `reserve` is set with complete code.
- The family caret replaces the still position marker in this mode only; `revealedLines` mode keeps its marker (BUI parity).
- `code-stream/index.ts`: `export { CodeStream, TxCodeStream, TxCodeStream as TxStreamCode }` — an alias of the same object. `withInstall` mutates the component itself (`packages/tuffex/packages/utils/withInstall.ts`), so `CodeStream` and `TxCodeStream` are already one object reached through two barrel keys and the root install loop already hands it to `app.use` twice (Vue ignores a plugin it has applied). A third key changes nothing `global-install.test.ts` checks (it asserts only that non-plugin exports never reach `app.use`).

## 5. `TxStreamElement` (R8)

### 5.1 Props / API

```ts
interface StreamElementProps {
  content?: string                 // markdown, everything received so far
  parts?: StreamPart[]             // structured alternative; wins over content
  streaming?: boolean
  sources?: AiSourceItem[]         // resolves [n] markers
  wordMs?: number; maxLagMs?: number; drainMs?: number
  reveal?: StreamRevealPreset
  caret?: boolean
  reserve?: boolean
  renderers?: Record<string, Component>   // per part type or `code:<lang>`, instance-level (not global)
  markdownProps?: Partial<StreamMarkdownProps>  // forwarded to delegated TxStreamMarkdown blocks
}
type StreamPart =
  | { type: 'heading', depth: 1 | 2 | 3 | 4 | 5 | 6, inlines: StreamInline[] }
  | { type: 'paragraph', inlines: StreamInline[] }
  | { type: 'list', ordered: boolean, start?: number, items: { checked?: boolean, parts: StreamPart[] }[] }
  | { type: 'quote', parts: StreamPart[] }
  | { type: 'rule' }
  | { type: 'code', lang?: string, code: string, filename?: string }
  | { type: 'markdown', raw: string }            // delegated span
  | { type: 'custom', name: string, props?: Record<string, unknown> }   // slot `part-<name>` / renderers[name]
```

Emits `state-change`, `done`, `cite: [source: AiSourceItem]`. Slots: `caret({ state })`, `citation({ source, index })`, `code({ part, streaming })`, `part-<name>({ part, state })`, `footer({ state, done })`. Expose `{ state, replay, skip }`.

### 5.2 Markdown → parts

- `marked.lexer` over `completeInlineMarkup(content)` while streaming (raw content once settled) — the same helper `TxStreamMarkdown` uses, so a half-written `**bold` never flashes its asterisks.
- Supported block tokens map to parts; inline tokens map to `StreamInline` (text / strong / em / del / codespan / link / br / escape).
- A block token outside the subset (`table`, `html`, math via the stream-markdown math extension, a paragraph containing an image or inline math) is collected with its neighbours into one `markdown` part holding their `raw` text, rendered by `TxStreamMarkdown` (`streaming` forwarded when it is the tail). Delegated parts count as one unit and reveal with the block keyframe.
- Citations: in `text` inline tokens only, `\[(\d+)\]` with `1 ≤ n ≤ sources.length` becomes `{ type: 'citation', source: sources[n-1] }`; unresolvable markers stay text. Never inside code spans, code blocks or link text.

### 5.3 One clock across parts

`TxStreamElement` owns the only pacer. Its `total` is the sum of every part's unit count in document order (text words, code words, one per atomic part). Each child renders with `paced=false` and receives a *prefix* of its own content: `sliceByUnits(part, revealed - part.start)`. Children animate whatever arrives, so the element-level pacer alone decides the cadence and parts reveal strictly in order. Only the part holding the tail shows the caret and gets `streaming`.

### 5.4 Stability

Parts are keyed by position; `TxStreamText`'s prefix diff (3.2) absorbs text rewrites inside a part; a part that changes type (paragraph → setext heading) remounts once, settled. The lexer runs on every content change (<1 ms at 5k chars, `08-05-tuffex-ai-stream-markdown/design.md:15-24`); the budget in R14 is measured, and only if it is exceeded does the element cache settled parts by `raw` like `createBlockStream`.

## 6. `TxStreamMarkdown` motion (R9)

- Fresh-chunk spans and new blocks take the shared preset classes (default `aurora`); new optional prop `reveal?: StreamRevealPreset` (additive). The tail ink mask, block diffing and `v-html` pipeline stay.
- The `::after` orb is removed. The caret becomes a `TxStreamCaret` rendered once in the component and positioned after the last text node: in the existing post-flush watcher, a `Range` over the last text-bearing node gives the end rect; the caret is absolutely placed there (inline-size 0, so no reflow), or in the block-cursor position when the tail is a fence (the current rule `INLINE_CURSOR_RE`). One writer: the positioning writes `transform` only.
- Existing tests stay; new style-contract tests pin the preset classes and the absence of the orb.

## 7. Docs, gallery, template (R10–R13)

- Pages `stream-text.{zh,en}.mdc`, `stream-element.{zh,en}.mdc` (category as `stream-markdown`; structure per `.trellis/spec/frontend/nexus-docs-structure.md`), updates to `stream-markdown.*` and `code-stream.*`, TAXONOMY + SECTION_ORDER + both hub indexes.
- Demos: `StreamElementAnswerDemo` (the hero, R11), `StreamElementMarkdownDemo`, `StreamElementSlotsDemo` (custom caret / citation / part + state), `StreamTextStreamTextDemo`, `StreamTextPresetsDemo`, `CodeStreamLiveDemo`; registry lines alphabetical.
- Gallery: `docs/gallery/GalleryStreamElement.vue`, `GalleryStreamText.vue`, `GalleryStreamMarkdown.vue`, each starting its stream in its own `onMounted` (`useGalleryLoop`), inside the default `DocsGallerySpecimen` stage so the reset button restarts them.
- Template: `template-ai-answer.{zh,en}.mdc` + `TemplateAiAnswerDemo.vue` following `nexus-docs-templates.md` §2–§8 (registration chain, `TemplateFrame`, behaviour matrix); streaming starts on visibility (`@enter`), not in `onMounted`.

## 8. Compatibility

| Change | Who sees it | Handling |
|---|---|---|
| `TxStreamMarkdown` reveal + caret | HomePage chat, every docs demo using it | intended (D1/D2/D8); verified in core-app and docs |
| New `reveal` prop on `TxStreamMarkdown` | nobody unless set | additive |
| `TxCodeStream` content-driven mode | only callers passing `streaming` without `revealedLines` | existing callers unchanged; tests unchanged |
| `TxStreamCode` alias | new name only | same object |
| New tokens in `variables.scss` | none | new names |
| New components in the `ai` barrel | `suite-barrels.test.ts` | registered in exactly one barrel |

## 9. Rollout and rollback

Children land in dependency order (see `implement.md`), each as its own verifiable change: foundation + `TxStreamText` → `TxCodeStream` live mode and `TxStreamMarkdown` motion (parallel) → `TxStreamElement` + hero → template. Each child is revertible on its own; the only cross-app effect is the `TxStreamMarkdown` look in HomePage, isolated in its own child so it can be reverted without touching the new components. Nexus consumes tuffex through `dist/`, so every child that changes tuffex ends with a locked dist rebuild and a supervised dev-server restart (procedure in `implement.md`).
