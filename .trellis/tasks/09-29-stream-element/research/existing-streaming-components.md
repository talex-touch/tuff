# Research: Existing streaming/text-motion components in TuffEx

- **Query**: For each of stream-markdown, code-stream, conversation-stream, text-morph, text-transformer, glow-text, markdown-view — public API, streaming input model, animation details, reduced-motion, SSR, tests, known limitations.
- **Scope**: internal (`packages/tuffex/packages/components/src/`)
- **Date**: 2026-09-29

All paths below are relative to `/Users/talexdreamsoul/Workspace/Projects/talex-touch/packages/tuffex/packages/components/src/` unless given in full.

## 1. `stream-markdown` (TxStreamMarkdown)

**Files**: `stream-markdown/src/TxStreamMarkdown.vue`, `types.ts`, `use-block-stream.ts`, `use-fresh-chunks.ts`, `complete-inline-markup.ts`, `TxCodeBlock.vue`, `harden-html.ts`, `math-extension.ts`, `remote-image-policy.ts`, `table-csv.ts`, `shiki-runtime.ts`, `use-auto-theme.ts`; export surface `stream-markdown/index.ts`.

### Public API (`stream-markdown/src/types.ts:42-66`)
`StreamMarkdownProps`: `content: string` (the full accumulated document, not a delta), `streaming?: boolean`, `sanitize?: boolean` (default true, dompurify lazy-loaded), `theme?: 'light'|'dark'|'auto'`, `renderers?: Record<string, Component>` (per-language fenced-block renderer override), `blockRemoteImages?: boolean` + four label props for the blocked-image UI, `copyTableText`/`copiedTableText`. No emits. `TxStreamMarkdownInstance` exported from `index.ts:49` but the SFC calls no `defineExpose`, so the instance type only carries default component internals.

Exported helpers (`index.ts:25-49`): `createBlockStream`, `completeInlineMarkup`, `completeTable`, remote-image-policy functions, plus `TxCodeBlock`/`TxMermaidBlock` as named exports so hosts can register them as custom `renderers`.

### Streaming input model
**Whole growing string, not chunks/deltas.** `content` is fed in full on every update (`TxStreamMarkdown.vue:158-184`); there is no append/delta prop and no `done` flag — `streaming: boolean` alone signals "still arriving" vs "settled". Internally:
- `createBlockStream` (`use-block-stream.ts:71-154`) re-lexes the *entire* content every call (cheap, token-only) via `marked.lexer`, then diffs against the previous token list by `raw` string equality, keeping the longest unchanged prefix (`use-block-stream.ts:107-137`). Only new/changed blocks get parsed+sanitized. The first mismatched block **inherits the previous id** (`use-block-stream.ts:130`) so its DOM node — and therefore the reveal animation — is not replayed while it is still the growing tail.
- Blocks carry a stable numeric `id`, `type: 'markup'|'code'`, `html`, `raw`, `lang`, `code`, `fenceClosed` (`types.ts:10-27`).
- While `streaming` is true, content is pre-processed by `completeInlineMarkup` (closes open `**`/`_`/`~`/backtick/`[]()` runs so half-written markup doesn't flash as literal punctuation, `complete-inline-markup.ts:33-141`) and `completeTable` (synthesizes a GFM delimiter row so a half-arrived table renders as a table immediately, `complete-inline-markup.ts:155-180`). Both are documented as streaming-only; settled text is never rewritten.
- A fenced code block is rendered non-final (`closed: false`) until its closing fence lands, another block follows it, or the whole stream settles (`TxStreamMarkdown.vue:207-209`).

### Animation (exact values)
- **Block-level reveal**, once per newly-inserted block only (settled blocks never remount, the growing tail patches in place so it never replays either): `animation: tx-stream-md-reveal 0.42s cubic-bezier(0.22, 1, 0.36, 1) both` (`TxStreamMarkdown.vue:342-344`). Keyframes (`:723-734`): from `opacity 0.4, translateY(4px), blur(3px)` to `opacity 1, translateY(0), blur(0)`.
- **"ChatGPT-style" bottom-edge ink mask** on the tail block only: a `mask-image`/`-webkit-mask-image` linear-gradient whose floor is a registered custom property `--tx-stream-md-ink` (`@property`, `syntax: '<number>'`, initial `1`, `TxStreamMarkdown.vue:716-720`) so it *transitions* (`0.5s ease`, `:361`) instead of snapping when the tail hands off to the next block. Floor value while active is `0.65` (`:382`), and the dim band is capped at `min(1.4em, 40%)` of the block height (`:369-379`). Comment explicitly records a retired alternative: "A per-delta re-fade on the tail element was tried and retired — restarting on every chunk pins the whole growing element at its floor opacity for the entire stream" (`:349-351`).
- **Per-character "fresh chunk" materialization** (`use-fresh-chunks.ts`): every batch of characters appended to the growing tail block is tracked by `{start, end, t0}` character offsets (not DOM refs, because the tail is replaced wholesale via `v-html` on every delta) and re-wrapped in `<span class="tx-stream-md__fresh">` after each patch with a **negative `animation-delay`** so the animation resumes exactly where the previous patch interrupted it (`use-fresh-chunks.ts:106-107`, `wrapChunk`). Animation: `tx-stream-md-fresh 0.44s cubic-bezier(0.22, 1, 0.36, 1) both` — `opacity 0.08→1 (55%)→1, blur 5px→0` (`TxStreamMarkdown.vue:429-431,736-750`). Chunks older than `durationMs` (default 440ms) stop being tracked (`use-fresh-chunks.ts:43,82`). If the parser rewrites earlier output (an emphasis closing, a reference link resolving), offsets are voided and that beat is skipped rather than replayed (`use-fresh-chunks.ts:74-80`). The wrap runs in a `flush: 'post'` watcher so it lands in the same frame as the DOM patch, before paint (`TxStreamMarkdown.vue:235-251`).
- **Caret**: a small radial-gradient "orb" (brand light-orb, not a terminal bar), either inline via `::after` on the last text-bearing element when the tail ends in an unclosed `<p>/<h1-6>/<blockquote>` (`INLINE_CURSOR_RE`, `:258-263`) or as a standalone zero-height block cursor otherwise (`:265-267,313`). Both animate `tx-stream-md-orb 1.4s ease-in-out infinite`: `scale(0.86)/opacity 0.75` ↔ `scale(1.06)/opacity 1` at 50% (`:754-765`), explicitly not a hard `steps()` blink ("reads as a terminal artefact").
- Bare bodyless fences (no language, no code) are suppressed entirely mid-stream rather than showing an empty framed box (`isSuppressedFence`, `:274-276`).

### Reduced motion
`motionless()` reads `window.matchMedia('(prefers-reduced-motion: reduce)').matches` and short-circuits the fresh-chunk wrapping watcher entirely (`:228-233,241`). A CSS `@media (prefers-reduced-motion: reduce)` block additionally zeroes the block-reveal animation, the cursor/orb animation, and the fresh-chunk animation (`:768-778`).

### SSR
No SSR-specific guard inside `TxStreamMarkdown.vue` itself beyond the reduced-motion `typeof window !== 'undefined'` check (`:230`); DOM work (`querySelector`, `TreeWalker`) only runs inside `flush: 'post'` watchers which do not execute during SSR render. `use-auto-theme.ts:15,33` and `TxMermaidBlock.vue:61,106,118` guard with `hasDocument()` from `@talex-touch/utils/env`.

### TxCodeBlock (fenced-block default renderer, `TxCodeBlock.vue`)
Props: `lang`, `code`, `closed` (default `true`; false only for the live-streaming tail fence), `streaming`, `theme`, `previewable`, `previewLabel`, `codeLabel` (`:8-31`). Live highlighting cadence: an **open** fence coalesces bursts of deltas into a highlight pass every `STREAM_HIGHLIGHT_INTERVAL_MS = 120` ms via `setTimeout` (`:49-89`); a **closed** fence highlights immediately. Stale in-flight highlight results are dropped via a monotonically increasing `requestToken` (`:39,60-66,99`). Sandboxed `<iframe sandbox="">` preview (no `allow-scripts`/`allow-same-origin`) for settled `html|svg|xml` fences only (`PREVIEWABLE`, `:105-129,151-157`).

### Tests pinning behaviour
- `use-block-stream.test.ts`: tail id stability while a paragraph grows, settled-block object reuse, no re-sanitize of stable blocks, setext-rewrite keeping the tail id, late reference-link definitions re-rendering earlier blocks, fence language/closure tracking (tilde fences, longer closing runs, indented code), blank-token filtering, sanitizer application, shrink-drops-trailing-entries, full reset.
- `fresh-chunks.test.ts`: whole-block zero-delay wrap on first arrival, delta-only wrap on growth, negative-delay resume after re-patch, spanning inline element boundaries without breaking structure, skip-a-beat on rewrite, new registry on tail-block change, `finish()` unwraps and normalizes text nodes back together.
- `complete-inline-markup.test.ts`: closes unterminated `**`/backtick/`[]()`/link-text; leaves balanced arithmetic asterisks, escaped delimiters, cross-blank-line emphasis, and long "rule" runs alone; never touches fenced or inline code; visible text stays byte-identical to what arrived.
- `stream-markdown.test.ts`: sanitizer-gated render, `sanitize` flip re-render, **settled block DOM nodes survive across streaming updates** (identity test), inline-vs-block cursor selection, fence dispatch to custom `renderers` with correct `closed`, unregistered fences fall back to `TxCodeBlock` with escaped code, **5000+ character streamed document keeps every settled block node** (perf/identity regression guard), bare-fence suppression, last-block reveal-mask class, mermaid dispatch, auto-theme tracking via `<body>` mutation, remote-image blocking/click-through/session-allow, table→CSV clipboard copy with confirm/revert.
- `code-block.test.ts`: escaped-plain-first-then-coalesced-highlight timer, timer cleared on unmount, immediate highlight once closed, graceful degrade when the shiki runtime fails, bare fences never call shiki, stale highlight resolution ignored after code changes, sandboxed preview gating, svg preview centring wrapper, copy-button code exposure.

### Known limitations / comments worth carrying forward
- The vendored GitHub markdown stylesheet is deliberately *not* `@import`-ed from this component — it is borrowed from `markdown-view`'s bundled CSS to avoid shipping the ~38 KiB sheet twice in the on-demand build (`TxStreamMarkdown.vue:318-332`, referencing issue #1555).
- KaTeX's own stylesheet is deliberately not imported; the host app must supply `katex/dist/katex.min.css` itself or formulas render in a fallback font (`:319-324`).
- A clipboard write can silently fail (permission denied); the copy button intentionally shows no error state, only a non-confirmation (`:76-80`).

## 2. `code-stream` (TxCodeStream)

**Files**: `code-stream/src/TxCodeStream.vue`, `types.ts`. Header comment: "Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT." (`TxCodeStream.vue:1`, `types.ts:1`) — this is the BUI-family port, distinct from stream-markdown's own fence renderer.

### Public API (`code-stream/src/types.ts:32-71`)
`CodeStreamProps`: `code: string` (required, full text — always the complete source, diff mode included), `lang?`, `filename?`, `langLabel?`, `diff?: CodeDiffRow[]` (presence, not a boolean flag, switches to diff mode — an empty array is explicitly "a listing, not an empty diff"), `revealedLines?: number` (omit or `-1` = show everything; **the host owns the reveal cadence, the component only owns the transition** — no internal timer), `caret?` (default true), `lineNumbers?` (default true), `theme?: 'light'|'dark'|'auto'` (default `'auto'`), `copyable?` (default true), `copyLabel`/`copiedLabel`, `minHeight?: number|string`. Emits: `copy: [code: string]`, `complete: []` (fires once when `revealCount` reaches `totalLines`, not on every partial reveal — `TxCodeStream.vue:158-161`). Named slots `header`, `actions` (`:32-37`).

### Streaming input model
**Not chunk-based at all** — the component receives the *complete* `code` string every time and the caller drives an external `revealedLines` counter to animate a line-by-line reveal (`revealCount` clamped to `[0, totalLines]`, `:148-153`). This is the opposite of stream-markdown's model (which infers "new" content itself from string growth). `isDiff`/`diffRows` derive from whether `diff` is supplied; `plainLines`/`highlightSource` unify diff and non-diff code into one pipeline (`:45-69`).

### Animation
- Each revealed line fades up on entrance: `@include bui-fade-up(250ms)` (`:314`, mixin in `packages/tuffex/packages/components/src/style/mixins.scss` — not read in this pass) applied to `.tx-bui-code-stream__line`. Already-revealed lines are **not** re-triggered (`v-for="index in revealCount"` keyed by `index`, so a growing count only mounts new `<div>`s — confirmed by test "reuses already-revealed lines so their entrance does not replay").
- Caret marks the line at `index === revealCount` while `revealing` is true (`revealCount > 0 && revealCount < totalLines`, `:155-156,236-240`); explicitly a still position marker, not a blinking cursor — comment: "Deliberately still. Upstream reserves the blinking caret for prose streaming; the code caret is a position marker, not a cursor." (`:390-391`).
- Diff rows get a background tint + 2px edge marker via `background-image` gradient (not a `border`, so line text never shifts): green solid for added, red **hatched** `repeating-linear-gradient` for removed — the hatching is explicitly for colour-blind accessibility ("the one pairing a red/green-blind reader cannot separate", `:337-347`).
- Height is reserved up front from the full line count (`--tx-bui-code-stream-lines`, `calc(lines * 1.7em + 20px)`, `:173-184,300-304`) so a reveal grows into pre-reserved space instead of pushing the page.

### Reduced motion
Only the copy-button's own hover transition is explicitly zeroed under `prefers-reduced-motion: reduce` (`:436-440`); the per-line fade relies on the shared `bui-fade-up` mixin's own guard (not inspected in this file).

### SSR
Guards `typeof DOMParser === 'undefined'` before splitting shiki output into lines (`:112-113`), falling back to plain text.

### Tests pinning behaviour (`code-stream.test.ts`, `code-stream-diff.test.ts`)
Whole-listing-by-default, prefix reveal, reveal clamped outside bounds, **already-revealed lines don't replay their entrance**, `complete` fires once on arrival at the end (not per-line), caret marks the last revealed line and disappears on completion, caret can be disabled, gutter numbering + full-height reservation regardless of reveal + explicit `minHeight` floor, header presence/absence rules, header survives on copy-button-alone, header slot replacement/append, plain-render with no highlighter call when `lang` is empty, shiki output split back into lines, **falls back to plain text when the highlighter returns a different line count than expected** (defensive against a shiki markup change), highlighting cleared when `lang` clears, re-highlight on theme change; diff mode: stays a listing until `diff` rows supplied, empty array ≠ diff mode, per-row kind tagging, tally counts (omits a zero side), shared gutter numbers for a removed/added pair, blank gutter for a row with no number, diff rows render instead of `code`, **copy button always yields `code` not the diff text**, reveal counter shared with listing mode, height reserved from diff row count not code line count, header shows for a diff even with nothing else.

### Known limitations / comments
- `bodyStyle`/`minHeight` comment: "Upstream pins this at 137px, which is exactly six lines of its sample — a number that means nothing for any other listing" (`:170-172`) — i.e. the BUI original hardcoded a magic height that this port replaced with a computed one.
- No language means "unhighlighted, which is always correct" (`types.ts:34`) — plain text is treated as a safe default, not a degraded state.

## 3. `conversation-stream` (TxConversationStream)

**Files**: `conversation-stream/src/TxConversationStream.vue`, `types.ts`, `use-position-cache.ts`, `use-stick-to-bottom.ts`.

### Public API (`conversation-stream/src/types.ts:16-29`)
Generic `ConversationStreamProps<T>`: `items: T[]`, `itemKey: string | ((item, index) => string|number)`, `estimatedItemHeight?` (default 96), `overscan?` (default 4), `loadOlder?: () => Promise<{hasMore: boolean}>` (loader prepends into `items` itself before resolving — "the component is not a second source of truth", `types.ts:8-11`), `hasMoreInitial?: boolean`, `streaming?: boolean` (drives the scroll-pill's "new content" visual state only, `TxConversationStream.vue:547`). Emits `at-bottom-change: [boolean]`, `load-error: [unknown]`. Slots: `item`, `empty`, `top-loading`, `top-error` (with `retry`), `top-done`, `scroll-to-bottom` (with `streaming`). `defineExpose`: `scrollToBottom(behavior?)`, `scrollToIndex(index)`, `tweenToBottom(duration?): Promise<boolean>`, `atBottom` (ComputedRef) (`:471-479`).

### Streaming input model
This is a **virtualized list**, not a text-reveal primitive — "streaming" here means "the last item in the list is still growing (e.g. its text is mid-stream)". The **last item in `items` is always rendered in a separate non-virtualized "live" zone** (`liveItem`/`liveRef`, `:86-90,535-537`) so it never gets recycled mid-growth; only `items.slice(0, -1)` goes through the virtual window (`:84`). When the live item's own content grows, a `ResizeObserver` remeasures it and, while `streaming` is true, the "follow" scroll glides over `220`ms instead of snapping instantly (vs `0`ms when not streaming) — "per-token growth reads as one continuous slide" (`:213-216`). `itemKey` identity is what lets an item migrate from "live" to "virtual" without losing its measured height once the *next* message arrives (comment at `:70-75`).

### Animation / motion
- Prepend-anchoring: a batch of older items appearing above the first previously-visible key shifts `scrollTop` by exactly the prefix height so the viewport visually doesn't move (`:247-275`).
- Resize-driven compensation: any settled item's height correction above the viewport is compensated in the same ResizeObserver callback (pre-paint) if the reader is not following (`:189-202`); a following reader is instead re-glided via `stick.followIfSticking(...)`.
- "Scroll to bottom" pill: `tx-conversation-stream-pill-in 0.32s cubic-bezier(0.34, 1.56, 0.64, 1)` entrance (overshoot spring-like ease), only shown when the reader is detached from the bottom (`:664,543-546`); gains a `.is-streaming` tint while detached during an active stream, acting as a "new content" beacon (`:670-674`).
- `useStickToBottom` (`use-stick-to-bottom.ts`, not fully read this pass but exercised by `stick-to-bottom.test.ts`) supports both instant snap and a spring-based `tweenToBottom` glide that can retarget mid-flight as content keeps growing, and cancels immediately on upward wheel input.

### Reduced motion
Only the pill entrance animation is explicitly zeroed under `prefers-reduced-motion: reduce` (`:694-698`); no reduced-motion handling for the scroll-glide/spring path was found in this file (would live in `use-stick-to-bottom.ts`, not read in full this pass).

### SSR
Relies on `typeof ResizeObserver !== 'undefined'` / `typeof IntersectionObserver === 'undefined'` guards (`:335,433`) rather than a document check; safe to mount with no scroller ref during SSR since all measurement is deferred to `onMounted`.

### Tests pinning behaviour
Bounded window over 500 items, window content stays aligned with item keys (no swapped rows), **no re-render of the window for scroll frames that don't cross a row boundary** (perf guard), viewport anchored across a prepend, sentinel-driven older-history loading with concurrency/hasMore guards, retryable loader failures, **live growth is followed at the bottom and never yanks a detached reader**, pill stays hidden while the stream glides to the bottom on its own, `at-bottom-change` emission, empty slot renders without scroll scaffold, exposed `scrollToIndex`/`scrollToBottom`, sentinel observed even when items arrive after an empty mount, history observer revives when `hasMoreInitial` is re-supplied, every rendered window item registered with the ResizeObserver, range/`scrollToIndex` offset by the measured spacer origin. `use-stick-to-bottom.test.ts` additionally pins: follow starts/stops based on scroll position, upward wheel breaks follow even at the bottom, smooth-scroll's own intermediate events are not mistaken for the user leaving, `tweenToBottom` glide duration + retarget-mid-glide + suppressing instant follows while gliding + cancel on upward wheel + fallback to instant jump without `requestAnimationFrame` + spring-follow with velocity carried across mid-chase growth (no restart pulse).

### Known limitations / comments
- Explicitly not a general virtualization primitive for arbitrary reordering: "the live zone is always the last item... so a turn ending never moves a node between the virtual and live worlds mid-render" (`:70-75`) — assumes append-only / last-item-mutates semantics.
- `overflow-anchor: none` is intentional: "The component runs its own anchoring; the browser's would double-correct." (`:571`).

## 4. `text-morph` (TxTextMorph + `engine/`)

**Files**: `text-morph/src/TxTextMorph.vue`, `types.ts`, `engine/{index,controller,morph,diff,segment,number,animate-text,animate-number,animate-group,container,dom,flip,lcs,metrics,constants,reduced-motion,types}.ts`. Header: "Ported from https://github.com/lochie/torph (MIT © lochie), fused with tuffex's own spring compiler" (`engine/index.ts:1-3`); every engine file repeats "Ported from torph/... Kept intentionally close to upstream so its fixes stay diffable."

### Public API (`text-morph/src/types.ts:3-53`)
`TextMorphProps`: `text: string | number` (**the current full value, not a delta** — same "growing/changing snapshot" model as stream-markdown's `content`), `tag?` (default `'span'`), `durationMs?`, `easing?` (both ignored if `spring` is set), `spring?: MorphSpring` (preset name or coefficients; overrides duration+easing), `scale?: boolean` (scale exiting segments), `numbers?: boolean` (place-value digit morphing vs character-level), `decimals?`, `locale?`, `cursorIndex?: number` (switches a single numeric value from place-matching to caret-matching, for live-typed input), `disabled?`, `respectReducedMotion?` (default true per `MORPH_DEFAULTS`), `debug?`. Emits `animation-start`, `animation-complete`, `animation-cancel` (`TxTextMorph.vue:22-26`). `defineExpose({ rootRef })` (`:78-81`).

### Streaming input model
Not a token/word streaming primitive — it's a **diff-and-morph engine for discrete value changes** (numbers ticking, labels swapping). `segmentText` cuts a string into words/graphemes (`engine/segment.ts`), `diffSegments` (LCS-based, `engine/lcs.ts`) pairs surviving segments across an old/new value so only what changed animates, and numeric values get place-value-aware matching so digits "slide" per column rather than doing a full-string diff (`engine/number.ts`, `types.ts:26-29`). Relevant if `StreamText`/`StreamElement` ever need to animate a *value* (e.g., a live token/character counter) rather than growing prose, but it is not designed for append-only long-form text — `initialText` is rendered once for SSR/hydration and then the controller takes over the DOM directly, bypassing Vue's own re-render for that subtree (`TxTextMorph.vue:31-37`).

### Animation
FLIP-based per-segment transform/opacity animation (`engine/flip.ts`, `engine/animate-text.ts`, `engine/animate-number.ts`, `engine/animate-group.ts`) driven either by a CSS `durationMs`+`easing` pair or by the ported spring compiler (`MorphSpring`). CSS side (`TxTextMorph.vue:97-188`) sets up structural containment via custom attributes (`tx-morph-root`, `tx-morph-item`, `tx-morph-slot`, `tx-morph-sr`) rather than scoped classes, because segments are built with `document.createElement` and never receive a scoped `data-v-*` attribute (`:90-96`). Digit slots get a `clip-path: inset(0 -100vw)` mask so a sliding digit is clipped to its own line box, with an optional gradient-fade band (`--tx-morph-fade`) at top/bottom (`:135-178`). A hidden `tx-morph-sr` span carries the real accessible text; every visible child is `aria-hidden` (`:115-120`).

### Reduced motion
`engine/reduced-motion.ts` ports `torph`'s `matchMedia('(prefers-reduced-motion: reduce)')` listener (`:11-28`), explicitly kept close to upstream ("deviations are limited to tuffex lint style and a guard for environments where matchMedia exists but predates addEventListener"). `respectReducedMotion` prop (default true) makes the controller behave like `disabled` — write the value straight in, nothing to diff (confirmed by test "writes the value straight in under prefers-reduced-motion, leaving nothing to diff").

### SSR
`typeof window === 'undefined'` guard short-circuits the listener to a static `prefersReducedMotion: false` (`engine/reduced-motion.ts:12-13`). The Vue component pattern (render server text once via `initialText`, `TxTextMorph.vue:37`, then have the engine `attach()` post-mount, `:61-68`) is the SSR/hydration strategy: hydration sees the same plain text server and client rendered, and only after mount does the engine start rewriting the subtree outside Vue's vdom.

### Tests pinning behaviour
`text-morph.test.ts`: takeover of server-rendered text on mount, custom root tag, segment rebuild on value change, numeric locale/decimals formatting, **motion-disabled path writes plain text and claims no morph root at all**, reduced-motion respected by default, animates anyway when `respectReducedMotion` is off, gives the original element back on unmount. `engine.test.ts`: word/grapheme segmentation with unique ids even for repeated segments, newline-per-segment, LCS pairing that keeps surviving word ids and carries shared characters of a replaced word onto the new one (but refuses to pair words sharing "too little"), numeric place-value matching (recognises quantities without swallowing hyphenated words, rolls only changed places, holds a digit that kept its column, drops carry-over across a ≥3-place magnitude jump, marks digits vs symbols to slide opposite ways), controller behaviour (spring overrides duration+easing, `durationMs` used only without a spring, reduced-motion/`disabled` write straight through with nothing diffed, numeric slot creation vs character-fallback when `numbers` is off, full attribute + readable-copy cleanup on destroy).

### Known limitations / comments
- `numbers` mode explicitly documented to fall back to character-level morph when off (`types.ts:29-30`).
- `cursorIndex` exists specifically for live-typed numeric input, not for streamed text (`types.ts:39-43`).

## 5. `text-transformer` (TxTextTransformer)

**Files**: `text-transformer/src/TxTextTransformer.vue`, `types.ts`. Thin wrapper composing `TxTextMorph` for one mode and a hand-rolled crossfade for the other.

### Public API (`text-transformer/src/types.ts:3-30`)
`TextTransformerProps`: `text: string | number`, `mode?: 'morph' | 'fade'` (default `'morph'`), `durationMs?` (default 240), `blurPx?` (default 8, fade-only), `tag?` (default `'span'`), `wrap?` (default false). Default slot receives `{ text }` scoped slot data for custom rendering of the current/previous layer in fade mode (`TxTextTransformer.vue:162,171`). No emits.

### Streaming input model
Same "current full value" model as `TxTextMorph`. `usesMorph` computed (`:31`) forces `fade` mode whenever a default slot is provided or `wrap` is true, regardless of the `mode` prop, because the morph engine only knows how to diff plain text segments it builds itself and lays everything out on one `nowrap` line (`:21-29`).

### Animation
**Fade path** (non-morph): two absolutely-stacked layers cross-fade + cross-blur. Both layers transition `opacity`/`filter`/`color` over `--tx-tt-duration` (prop `durationMs`, default 240ms) with `cubic-bezier(0.2, 0, 0, 1)` (`:221-224`). The outgoing layer freezes its `color` via `getComputedStyle` before swapping text, so the fade-out layer doesn't inherit a color transition mid-flight from a themed ancestor (`:67-72`). Sequencing uses a forced layout read (`rootRef.value?.offsetWidth`) between setting the "no-transition" setup state and flipping `is-animating` one `requestAnimationFrame` later, specifically so the browser doesn't coalesce both style states into one recalc and skip the transition (`:84-98`). Total lifetime is `durationMs + 34`ms before the previous layer is discarded (`:100-108`). **Morph path**: delegates entirely to `TxTextMorph` (`:153-158`), no separate CSS transition of its own beyond what the morph engine does.

### Reduced motion
No explicit JS reduced-motion check in this component; CSS zeroes the fade layer's `transition` under `prefers-reduced-motion: reduce` (`:286-290`) — the class flips still happen but land on end state instantly. The morph path delegates its reduced-motion handling entirely to `TxTextMorph`'s own engine-level check.

### SSR
Guards `typeof getComputedStyle !== 'undefined'`, `typeof cancelAnimationFrame !== 'undefined'`, `typeof requestAnimationFrame === 'undefined'` (falls back to setting `animating.value = true` synchronously) (`:67,88-98,132`).

### Tests
No dedicated test file was found under `text-transformer/__tests__/` in this listing (only `text-transformer.test.ts` exists per the earlier `find`; contents not read in this pass — flagged as a gap below).

## 6. `glow-text` (TxGlowText)

**Files**: `glow-text/src/TxGlowText.vue`, `types.ts`. Not a text-*streaming* primitive at all — a decorative shine/sweep effect over slotted content.

### Public API (`glow-text/src/types.ts:1-15`)
`GlowTextProps`: `tag?`, `active?` (default true), `durationMs?` (default 2000), `delayMs?` (default 0), `angle?` (default 20°), `bandSize?` (default 38%), `color?` (default `rgba(255,255,255,0.9)`), `opacity?` (default 0.75), `blendMode?`, `mode?: 'classic' | 'adaptive' | 'text-clip'` (default `'adaptive'`), `backdrop?`, `radius?` (default 10px), `repeat?` (default true). Default slot only; no emits.

### Streaming input model
None — it wraps whatever the default slot renders and (in `text-clip` mode) mirrors the slot's live text into a hidden gradient-clipped span via a `MutationObserver` watching `childList`/`subtree`/`characterData` (`TxGlowText.vue:60-75`), so it *can* sit over a growing string, but it has no concept of chunks, deltas, or a `streaming` flag — it just re-syncs on every DOM mutation.

### Animation
Two CSS-only sweep layers: `.tx-glow-text__shine` (an overlay band via `mix-blend-mode: screen` or `plus-lighter` when supported, `:174-186`) and `.tx-glow-text__clip-shine` (a `background-clip: text` gradient sweep, only in `text-clip` mode, `:235-265`). Both run `linear` timing over `durationMs` (`infinite` unless `repeat` is false, then `animation-fill-mode: forwards` after one pass, `:267-275`). The keyframes are asymmetric on purpose: the band travels at constant speed through the first 65% of the cycle and then holds off-stage for the remaining 35% — "Holding the rest still is what separates one pass from the next; easing the travel instead made the band slow down before it had left" (`:299-325`).

### Reduced motion
`@media (prefers-reduced-motion: reduce)` disables both sweep animations and pins them to a static resting position/filter (`:285-297`).

### SSR
No explicit guard; only touches the DOM inside `onMounted`/`onBeforeUnmount` (`:121-129`), which don't run server-side.

### Tests
`glow-text.test.ts`: default adaptive overlay renders with slot content, prop→CSS-variable mapping with custom tag, inactive/one-shot state classes, text-clip mirror text creation and container-shine suppression in that mode, mirror text cleared when switching back to adaptive.

### Known limitations
None called out in code comments beyond the CSS-timing rationale above.

## 7. `markdown-view` (TxMarkdownView) — the static counterpart

**Files**: `markdown-view/src/TxMarkdownView.vue`, `types.ts`, `github-markdown.css`.

### Public API (`markdown-view/src/types.ts`)
`MarkdownViewProps`: `content: string`, `sanitize?` (default true), `theme?: 'auto'|'light'|'dark'`. No `streaming` prop, no emits, no slots.

### Streaming input model
**None.** `rawHtml` is a plain `computed` that calls `markedInstance.parse(props.content ?? '')` fresh on every change (`TxMarkdownView.vue:132-134`) — there is no block cache, no incremental diffing, no id-stable DOM reuse, no reveal animation, and no cursor. This is the direct point of contrast with `stream-markdown`: everything `use-block-stream.ts`/`use-fresh-chunks.ts` exist to solve (flicker, animation replay, wasted re-sanitize) is simply absent here because the component was never meant to receive a growing string. Confirmed by the component doc-comment cross-reference inside `TxStreamMarkdown.vue:330-331` ("`#1555` fixed the same thing for `markdown-view`").

### Animation
None beyond normal prose CSS. Theme resolution mirrors `use-auto-theme.ts`'s approach (reads `data-theme`/`.dark`/`.light` off `<html>`/`<body>`, observes via `MutationObserver`) but is implemented separately in this component rather than sharing the hook (`:61-125`) — worth noting as a duplication if `StreamText`/`StreamElement` want one shared auto-theme utility.

### Reduced motion
Not applicable (no animation).

### SSR
Uses `hasDocument()` from `@talex-touch/utils/env` consistently (`:5,62,86`), unlike `TxStreamMarkdown.vue`'s raw `typeof window` check — a naming/utility inconsistency between the two sibling components worth knowing about if `StreamText` needs the same theme-detection logic.

### Tests
`markdown-view.test.ts`: sanitizer gating before/after resolution, sanitize-disabled raw render, explicit vs auto theme (including `<body>`-driven dark mode), **does not mutate the shared global `marked` singleton** (guards against exactly the anti-pattern `TxStreamMarkdown.vue:34-35` and `TxMarkdownView.vue:16-17` comments warn about). `markdown-scope.test.ts` pins the vendored GitHub stylesheet's CSS scoping contract (every rule keyed under a `.tx-md` marker ancestor, present on both `TxMarkdownView` and `TxStreamMarkdown` roots) — directly relevant if a new `StreamText`/`StreamElement` root also needs to carry `.tx-md` to inherit that sheet.

## Cross-cutting observations relevant to a new StreamText/StreamElement design

1. **Two incompatible "streaming" conventions already coexist**: `TxStreamMarkdown`/`TxTextMorph` take the *entire current value* every update and diff internally (id-stable blocks / LCS segments); `TxCodeStream` takes the entire *value* too but lets the **host** drive an external `revealedLines` reveal counter and does no internal diffing at all. A new `StreamText` needs to pick one of these conventions explicitly (see `research/prior-decisions.md` for any binding rule).
2. Three different reduced-motion mechanisms are in use: a local `motionless()` closure reading `matchMedia` directly (`TxStreamMarkdown.vue`), a small reusable listener module `engine/reduced-motion.ts` (`text-morph`), and pure-CSS `@media` guards with no JS involvement (`code-stream`, `conversation-stream`, `glow-text`). None of the prose/text components share one reduced-motion utility.
3. Two different SSR/document-guard idioms are in use side by side: `hasDocument()` from `@talex-touch/utils/env` (`stream-markdown`'s `use-auto-theme.ts`, `TxMermaidBlock.vue`, `markdown-view`) vs. raw `typeof window !== 'undefined'` (`TxStreamMarkdown.vue:230`, `text-morph/engine/reduced-motion.ts:12`).
4. `TxStreamMarkdown` and `TxMarkdownView` independently implement the same auto-theme-from-`<body>`-or-`<html>` logic (`use-auto-theme.ts` vs. inline in `TxMarkdownView.vue:61-125`) rather than sharing one hook.
5. The per-character "fresh chunk" reveal technique in `use-fresh-chunks.ts` is the most directly reusable building block for a per-word `StreamText` reveal: it already solves "animate only what's new when the whole node is replaced via innerHTML/`v-html` on every delta" and "resume an interrupted animation with a negative delay," which is exactly the failure mode a naive per-word `<span>` approach would hit under fast token arrival.

## Caveats / Not found
- `text-transformer/__tests__/text-transformer.test.ts` exists (confirmed by directory listing) but its contents were not read in this pass; its test names are not enumerated above.
- `text-morph/engine/{morph,controller,animate-text,animate-number,animate-group,container,dom,flip,lcs,metrics}.ts` internals were not read line-by-line; only their role was inferred from `engine/index.ts` exports and the test descriptions in `engine.test.ts`.
- `stream-markdown/src/{harden-html.ts, math-extension.ts, remote-image-policy.ts, table-csv.ts, shiki-runtime.ts, use-auto-theme.ts, TxMermaidBlock.vue}` were referenced but not read in full; only grep hits and call sites were inspected.
- `conversation-stream/src/use-stick-to-bottom.ts` and `use-position-cache.ts` were not read in full; behaviour above is inferred from `TxConversationStream.vue`'s call sites and the test names in `stick-to-bottom.test.ts`/`position-cache.test.ts`.
- The `bui-fade-up`/`bui-keyframes-fade-up` mixin referenced by `code-stream` (`packages/tuffex/packages/components/src/style/mixins.scss`) was not opened, so its exact keyframe values and its own reduced-motion guard are not confirmed first-hand.
