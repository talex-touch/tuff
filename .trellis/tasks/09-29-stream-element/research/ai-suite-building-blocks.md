# Research: AI-suite building blocks for the StreamElement showcase

- **Query**: For inline-citation, sources, message-actions, suggestion-chips, working-indicator, thinking-orb, bot-avatar, avatar, chat, ai-elements, reasoning-disclosure, chain-of-thought, context-cards, tool-call-card — API summary, visual/motion behaviour, suite membership, and whether each composes into the kobra.systems-style showcase (streamed answer + inline source chip + caret + action row + expandable sources + staggered follow-ups) as-is.
- **Scope**: internal (`packages/tuffex/packages/components/src/`, `packages/tuffex/packages/components/src/__tests__/suite-barrels.test.ts`, `apps/nexus/app/utils/docs-suites.ts`, `apps/nexus/content/docs/dev/components/*.en.mdc`, `apps/nexus/app/components/docs/DocsComponentsGallery.vue`)
- **Date**: 2026-09-29

All paths below are relative to `/Users/talexdreamsoul/Workspace/Projects/talex-touch/packages/tuffex/packages/components/src/` unless given in full.

## Suite / category classification

`suite-barrels.test.ts` (`packages/tuffex/packages/components/src/__tests__/suite-barrels.test.ts:20-30`) asserts that `base/index.ts` + `pro/index.ts` + `ai/index.ts` are an **exact, non-overlapping partition** of `components.ts` — every component directory is in exactly one of the three package-export barrels. Separately, `apps/nexus/app/utils/docs-suites.ts:1-20` defines a **seven-key docs taxonomy** (`concepts/templates/base/pro/ai/data/flow`) driven by each doc page's `category` frontmatter, which the file's own header notes "do not have to line up with the three component barrels" (`docs-suites.ts:12-15`) — e.g. `data` doc category spans both `pro` and `base` barrels, `markdown-view` and `avatar` prove that split below.

| Component dir | Barrel (`{base,pro,ai}/index.ts`) | Docs `category` (`*.en.mdc`) |
|---|---|---|
| `inline-citation` | ai | AiReasoning |
| `sources` | ai | AiReasoning |
| `message-actions` | ai | AiChat |
| `suggestion-chips` | ai | AiChat |
| `working-indicator` | ai | AiAgent |
| `thinking-orb` | ai | AiReasoning |
| `bot-avatar` | ai | AiAgent |
| `avatar` (+ `avatar-group`) | **base** | Basic (`avatar-variants.en.mdc`) |
| `chat` (composer/list/message/typing-indicator) | ai | AiChat (`chat.en.mdc`, `chat-composer.en.mdc`) |
| `ai-elements` | ai | AiReasoning |
| `reasoning-disclosure` | ai | AiReasoning |
| `chain-of-thought` | ai | AiReasoning |
| `context-cards` | ai | AiContext |
| `tool-call-card` | ai | AiAgent |
| (for reference) `stream-markdown` / `code-stream` | ai | AiReasoning |
| (for reference) `conversation-stream` | ai | AiChat |
| (for reference) `markdown-view` | **base** | Data |

Thirteen of the fourteen requested components are in the `ai` package barrel; only plain `avatar`/`avatar-group` is in `base` (it is a generic UI primitive reused by chat/AI surfaces, not AI-specific itself — `bot-avatar` is the AI-specific sibling, classified `ai`/`AiAgent`).

## 1. `inline-citation` (TxInlineCitation)

**Files**: `inline-citation/src/TxInlineCitation.vue` (132 lines), `types.ts`; exports `InlineCitation`/`TxInlineCitation` (`inline-citation/index.ts:1-9`). Header comment: `// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.` (`TxInlineCitation.vue:2`).

**API** (`types.ts`, `TxInlineCitation.vue:6-20`): props `source: AiSourceItem` (type imported from `../../ai-elements/src/types`), `label?: string`, `appear?: boolean` (default `true`). Emit `open: [source: AiSourceItem]`. Slots: `default({ source, label })`, `icon({ source })`. Renders as an `<a>`; the click handler calls `event.preventDefault()` before emitting `open` (`TxInlineCitation.vue` click handler) — the component never navigates itself, host owns what "open" means (important in Electron: a plugin surface following `<a href>` directly would try to navigate the renderer).

**Visual/motion**: `appear` toggles an `is-appear` class that plays a shared BUI mixin, `@include bui-pop-in(250ms)`, once on mount — a small scale/opacity pop-in, not a per-character reveal.

**Composability**: this is the exact "inline source chip" the showcase calls for — a small inline `<a>`-shaped chip carrying one `AiSourceItem`, meant to sit inline in flowing prose (i.e., inside a streamed answer, one chip per citation marker). It is not itself markdown-aware; something upstream (a `renderers` override on `TxStreamMarkdown`/`TxCodeBlock`, or a custom inline-token handler) would have to decide *where* in the streamed text a citation marker turns into a `<TxInlineCitation>`. No such wiring exists today — see `research/consumers.md` and the "gap" note below.

## 2. `sources` (TxSources)

**Files**: `sources/src/TxSources.vue` (260 lines); not BUI-attributed. Exports `Sources`/`TxSources` (`sources/index.ts`); the type comment explicitly says `AiSourceItem` "lives in ai-elements — the single parts home" (`sources/index.ts:7`).

**API**: props `sources: AiSourceItem[]`, `labelFormatter?: (count: number) => string` (default renders `Used N source(s)`), `defaultOpen?: boolean` (default `false`), `variant?: 'default' | 'stack'` (default `'default'`). Emit `open: [source]`.

**Visual/motion**: collapsed header is a button; `variant='stack'` replaces the default globe/link icon with **up to 3 overlapping favicon discs** instead of the plain "sources used" icon — this is literally an avatar-stack toggle. Expansion uses a CSS grid `0fr → 1fr` `grid-template-rows` transition (`0.26s cubic-bezier(0.4, 0, 0.2, 1)`, the same idiom `reasoning-disclosure` and `tool-call-card` use below) plus an `inert` attribute on the collapsed body so its rows leave the tab order while hidden.

**Composability**: directly matches **two** showcase requirements at once — "sources toggle with avatar stack" (`variant="stack"`) and "expandable sources list" (the collapse itself). Confirmed already demoed with `variant="stack"` in the docs gallery: `apps/nexus/app/components/docs/DocsComponentsGallery.vue:3904` — `<TxSources :sources="aiSources" variant="stack" />`. This is the component the showcase's "sources toggle" panel should be built from as-is; no gap.

## 3. `message-actions` (TxMessageActions)

**Files**: `message-actions/src/TxMessageActions.vue` (276 lines); not BUI-attributed.

**API**: props `copyText?: string`, `regenerable?: boolean` (default `false`, shows a regenerate/"retry" button), `speakable?: boolean` (default `false`), `speakState?: 'idle'|'loading'|'speaking'`, `appear?: boolean` (default `true`), plus label-string props for a11y. Emits: `copy`, `regenerate`, `speak`. Implements `role="toolbar"` with roving-tabindex keyboard navigation (arrow keys / Home / End) that reads the live DOM, including slotted controls, so extra buttons dropped into the default `<slot />` inherit the same keyboard behaviour automatically.

**Visual/motion**: `appear` plays a slow `0.9s cubic-bezier(0.22, 1, 0.36, 1)` blur-fade-up entrance — a deliberately slower/quieter entrance than the chip/card families' ~0.25–0.42s beats, presumably because it appears once the answer has already fully settled.

**Gap for the showcase**: `TxMessageActions` ships copy + regenerate("retry") + speak, but has **no built-in thumbs-up/down props, state, or emits** — only a bare default `<slot />` for arbitrary extra buttons. The showcase's "thumbs up / down" action has to be added via that slot (custom buttons wired into the same `role="toolbar"` roving-tabindex group) or as new markup alongside it; it is not available out of the box.

## 4. `suggestion-chips` (TxSuggestionChips)

**Files**: `suggestion-chips/src/TxSuggestionChips.vue` (152 lines); not BUI-attributed itself but consumes BUI keyframe mixins.

**API**: props `suggestions: AiSuggestion[]` (type from `ai-elements`), `layout?: 'wrap' | 'list'` (default `'wrap'`). Emit `select: [suggestion]`.

**Visual/motion**: `layout='list'` staggers each row's entrance: `animation: tx-bui-fade-up 350ms cubic-bezier(0.23, 1, 0.32, 1) calc(var(--tx-suggestion-chips-index) * 90ms) both` — i.e. a per-row CSS custom property drives the stagger delay (90ms/row) rather than JS-timed mounts.

**Composability**: this is the "follow-up prompts that fade up staggered" requirement, essentially verbatim, already demoed with `layout="list"`: `apps/nexus/app/components/docs/DocsComponentsGallery.vue:3465` — `<TxSuggestionChips :suggestions="copy.suggestions" layout="list" />`. No gap; drop-in.

## 5. `working-indicator` (TxWorkingIndicator)

**Files**: `working-indicator/src/TxWorkingIndicator.vue` (158 lines), `types.ts`, `use-elapsed.ts`; BUI-ported.

**API**: props `label?` (default `'Working'`), `variant?: 'drive' | 'dots' | 'orbit'` (default `'drive'`), `startedAt?: number` (a wall-clock timestamp, so a host that remounts the indicator on every render does not reset the elapsed clock), `showElapsed?` (default `true`), `elapsedFormatter?`, `ariaLabel?`.

**Visual/motion**: an animated 3×3 pixel grid; each of the three variants drives per-cell `animation-delay` "wavefronts" across the grid, plus a shimmering label. `role="status"`; the elapsed-time readout is `aria-hidden` so it is not re-announced on every tick.

**Composability**: a pre-answer "the assistant is working" indicator (demoed with `variant="drive"` and `variant="orbit"` side by side, `DocsComponentsGallery.vue:3431-3432`). Distinct in kind from the showcase's "caret while streaming" — see cross-cutting note below.

## 6. `thinking-orb` (TxThinkingOrb)

**Files**: `thinking-orb/src/TxThinkingOrb.vue`, `types.ts`, `engine/registry.ts`, `presets.ts`; vendored — `types.ts:1` header: `// Vendored from thinking-orbs v0.2.0 (MIT © Jakub Antalik)`.

**API**: props `state?: OrbState | 'random'` (nine states: `working/searching/solving/listening/connecting/weaving/composing/breathing/shaping`; default `'random'`), `size?: 20 | 64` (hand-tuned preset geometries only), `displaySize?: number` (rendered px, defaults to `size`), `speed?`, `paused?`, `theme?: 'auto'|'dark'|'light'`, `label?` (defaults to a per-state English string, e.g. `'Thinking…'` for `breathing`).

**Visual/motion**: canvas-drawn orb; state is **rolled once per mount** (`ORB_STATES[Math.floor(Math.random() * ORB_STATES.length)]`, `TxThinkingOrb.vue` setup) — "a thought keeps its orb for its whole lifetime; the next thought (a fresh mount) rolls a new one." Render loop is a single shared `performance.now()` clock so every mounted orb stays in phase; it pauses via `IntersectionObserver` when offscreen and on hidden tabs. `prefers-reduced-motion` freezes it to "a static representative frame that still follows the live theme" rather than turning it fully off.

**Composability / reuse note**: `TxThinkingOrb` is not only usable standalone — it is already **embedded inside** `reasoning-disclosure` and `chain-of-thought` (see below) as their "live" icon, swapped in only while streaming. It is a shared sub-component of the reasoning family, not a general working-indicator alternative.

## 7. `bot-avatar` (TxBotAvatar)

**Files**: `bot-avatar/src/TxBotAvatar.vue`, `types.ts`, plus `engine.ts`, `draw.ts`, `presets.ts`, `plastic.ts`, `color.ts`, `shapes.ts` — vendored, `types.ts:1-2`: `// Ported from bot-avatars/src/types.ts (https://github.com/Jakubantalik/Libraries). MIT License © 2026 Jakub Antalik.`

**API** (`types.ts:74-196`, ~40 props): `type?: BotAvatarType` (18 body shapes: clover/flower/triangle/square/blob/ghost/circle/drop/star/droid/mech/alien/hexagon/cat/cloud/pill/pebble/puddle), `face?: 'eyes'|'mouth'`, `state?: 'default'|'working'|'sleeping'`, `size?`, plus an extensive material/lighting system (`shading: 'crisp'|'smooth'|'plastic'|'flat'`, `shadow`, `highlight`, `depth`, `light`, `rim`, `spread`), pointer-follow interactivity (`interactive` default `true` — eyes/head track a nearby pointer, click triggers a hop), and a full jump-physics parameter set (`jumpHeight`, `jumpTime`, `jumpStretch`, `jumpSquash`, `jumpSquashTime`, `jumpSquashEase`, `jumpGroundTime`, `jumpGroundEase`, `jumpRiseTime`, `jumpRiseEase`, `jumpClickSquashTime`, `jumpSpin`, `jumpLean`, `jumpEvery`, `jumpLand`). `BotAvatarAttrs` deliberately kept out of `BotAvatarProps` so native `<canvas>` attributes/listeners keep flowing through via Vue attribute fallthrough rather than becoming declared (and thus fallthrough-blocking) props (`types.ts:9-16`).

**Composability**: this is a decorative agent-persona avatar (18 shapes × states), demoed 3-up in the gallery (`clover`/`mech`/`star`, `DocsComponentsGallery.vue:3822-3824`). It is not part of the streamed-answer chrome itself; relevant to the showcase only if the design wants a mascot/persona avatar next to the streamed answer rather than a plain `TxAvatar`.

## 8. `avatar` (TxAvatar, TxAvatarGroup)

**Files**: `avatar/src/TxAvatar.vue` (324 lines), `TxAvatarGroup.vue` (262 lines), `types.ts`. **Only** component of the 14 classified in the `base` barrel (see table above), not `ai`.

**TxAvatar API** (`types.ts:13-28`): `src?`, `alt?`, `name?` (initials fallback), `icon?`, `size?: 'small'|'medium'|'large'|'xlarge' | number | \`${number}\` | \`${number}px\``, `status?: 'online'|'offline'|'busy'|'away'`, `shape?: 'circle'|'square'|'rounded'`, `clickable?`, `backgroundColor?`, `textColor?`. Emit `click`.

**TxAvatarGroup API** (`types.ts:30-52`): `max?: number` (caps visible avatars, rest collapse into a `+N` overflow), `size?`, `overlap?: number|string` (default `8`, negative-margin stacking), `hoverEffect?: 'none'|'lift'` (per-avatar hover raises it above neighbours), `spreadOnHover?: boolean` (fans the whole row apart on group hover, using a separate `spreadOverlap`), `overflowPopover?: boolean` (off by default — reveals the `+N` avatars in a `TxPopover` instead of just a static count; `overflowPopoverTrigger`, `overflowPopoverPlacement`). Slot `overflow({ nodes, count })` to customize the popover panel. Implemented as a manual `h()`-based render function (not `<template>`) so it can flatten `v-for`-produced `Fragment` vnodes and clone each child avatar with injected stacking props (`TxAvatarGroup.vue:12-103`).

**Composability**: `TxAvatarGroup` is the generic building block behind an "avatar stack" visual, but note `TxSources`'s `variant="stack"` (item 2 above) implements its own small favicon-stack inline rather than delegating to `TxAvatarGroup` — two independent stack implementations exist in the codebase for two different data shapes (arbitrary avatars vs. `AiSourceItem[]` favicons).

## 9. `chat` (TxChatComposer, TxChatList, TxChatMessage, TxTypingIndicator)

**Files**: `chat/src/TxChatComposer.vue` (746 lines), `TxChatList.vue` (70 lines), `TxChatMessage.vue` (201 lines), `TxTypingIndicator.vue` (458 lines), `types.ts`. This is a **separate, older message-model family from `ai-elements`** — `ChatMessageModel` (`types.ts:11-18`: `id, role: 'user'|'assistant'|'system', content, createdAt?, avatarUrl?, attachments?: ChatMessageAttachmentImage[]`) has no `parts`, no `status`, and only image attachments, unlike `ai-elements`'s richer `AiElementMessage` (parts, status, arbitrary attachment kinds, sources). The two message shapes are **not interchangeable** and nothing in this survey converts one into the other.

**TxChatList/TxChatMessage**: plain list renderer + bubble; `TxChatList` wraps children in `TxStagger` when `stagger` (default `true`) for entrance staggering; `TxChatMessage` renders `content` through `TxMarkdownView` (the **static** markdown viewer, not `TxStreamMarkdown`) when `markdown` (default `true`) — i.e. this chat family is not itself streaming-aware.

**TxChatComposer** (`types.ts:37-69`, props only sketched here — 746-line file not fully read): `modelValue`, `placeholder`, `ariaLabel`, `disabled`, `submitting`, `allowAttachmentWhileSubmitting`, `minRows`/`maxRows` (auto-growing textarea), `sendOnEnter`/`sendOnMetaEnter`, `allowEmptySend`, `sendButtonText`, `showAttachmentButton`/`attachmentButtonText`, `attachments`, `trayPlacement: 'top'|'bottom'`, `trayLabel`. Emits `update:modelValue`, `send`, `attachmentClick`, `paste`, `attachmentAdd` (files from paste/drag-drop — upload itself is the host's job), `focus`, `blur`. Uses a runtime `defineProps({...})` object rather than `defineProps<ChatComposerProps>()`, with a comment explaining the SFC compiler needs it that way (`TxChatComposer.vue:15`, not fully diagnosed here).

**TxTypingIndicator** (`types.ts:89-110`): `variant?: 'dots'|'ai'|'pure'|'ring'|'circle-dash'|'bars'` — six distinct loader animations (`@keyframes tx-typing-indicator-bounce`, `tx-typing-ai-rotation`, `tx-typing-ai-roundness`, `tx-typing-ai-colorize`, `tx-typing-pure-rotate`, `tx-typing-ring-rotate`, `tx-typing-circle-dash-rotate`, `tx-typing-bars-pulse` — `TxTypingIndicator.vue:351-436`), each independently sized (`size`, `loaderSize`, `pureSize`, `ringSize`+`ringThickness`, `circleDashSize`+`circleDashThickness`+`circleDashDashDeg`+`circleDashGapDeg`, `barsSize`), plus `text`/`showText`/`ariaLabel` for a `role="status"` region.

**Composability**: not directly part of the showcase's answer chrome (no source chip, no action row), but `TxChatComposer` is the closest existing "type a follow-up" input if the showcase needs one, and `TxTypingIndicator` is a **fourth** distinct "assistant is busy" visual idiom in this survey (see cross-cutting note).

## 10. `ai-elements` (TxAiConversation, TxAiMessage) — the shared type vocabulary

**Files**: `ai-elements/src/TxAiConversation.vue` (91 lines), `TxAiMessage.vue` (384 lines), `types.ts` (133 lines).

**`types.ts` is the canonical home for the cross-component AI vocabulary** — five other components in this survey (`inline-citation`, `sources`, `suggestion-chips`, `chain-of-thought`, `tool-call-card`) import their core data type from here rather than declaring their own, and their own `index.ts` files say so explicitly (e.g. `sources/index.ts:7`: `// AiSourceItem / AiSourcesPart live in ai-elements — the single parts home.`; `tool-call-card/index.ts:7`: `// AiToolCallPart (the card's data shape) lives in ai-elements and is exported there`). Key types (`ai-elements/src/types.ts`):
- `AiSourceItem { id, url, title?, favicon? }` (`:72-77`) — consumed by `inline-citation`, `sources`.
- `AiSuggestion { id, text }` (`:88-91`) — consumed by `suggestion-chips`.
- `AiChainStep { id, kind: 'thinking'|'tool', title, body?, status: 'active'|'done'|'error', durationMs? }` (`:97-105`) — consumed by `chain-of-thought`.
- `AiToolCallPart { type:'tool-call', id, name, status: 'pending'|'running'|'done'|'error', summary?, input?, output?, error?, logs?, submitted? }` (`:21-41`) — consumed by `tool-call-card`.
- `AiElementMessage { id, role, content, createdAt?, name?, avatar?, status?: 'pending'|'streaming'|'complete'|'error', parts?: AiMessagePart[] }` (`:107-117`) — the message envelope `TxAiMessage`/`TxAiConversation` render; `AiMessagePart = AiTextPart | AiReasoningPart | AiToolCallPart | AiAttachmentPart | AiSourcesPart` (`:85`).

**`TxAiMessage`** (`TxAiMessage.vue:1-190`) is the composition root that already wires several of these components together for a *settled or per-part-streaming* message: it renders `AiReasoningPart` via `TxReasoningDisclosure`, `AiToolCallPart` via `TxToolCallCard`, `AiAttachmentPart` via `TxAttachmentTray`, `AiSourcesPart` via `TxSources` (re-emitting its `open` as `open-source`), and falls back to `TxMarkdownView` (static) for `content`/`AiTextPart`. Streaming affordances here are minimal and **independent of `TxStreamMarkdown`**: a `role="status"` three-dot `tx-ai-message__typing` pulse when `status` is `pending`/`streaming` and there is no content yet (`:112-120,306-327`, its own `@keyframes tx-ai-typing-dot`, 1.15s), and a one-shot `tx-ai-response-reveal 0.42s ease-out both` fade-blur-in applied to the whole response block while `status==='streaming'` (`:329-331,338-349`) — this fires once on the streaming response container, not per character/word like `TxStreamMarkdown`'s fresh-chunk mechanism. `isPartStreaming(index)` only ever flags the **last text part** as live (`:42-52`), a "only the tail is live" convention that mirrors stream-markdown's own tail-only reveal (topic 1) and reasoning-disclosure/chain-of-thought's tail-follow scrolling (below) — the same idiom repeated four times across independent implementations.

**`TxAiConversation`** (`TxAiConversation.vue`) is a plain non-virtualized `v-for` over `TxAiMessage` with an empty-state slot — no virtualization, unlike `conversation-stream` (topic 1), and it filters out messages with no content/parts/pending/streaming status (`:26-34`).

**Composability**: `TxAiMessage` is the closest existing thing to "compose the showcase pieces into one message," but it renders sources/reasoning/tool-calls as **parts of one message**, not as the standalone streamed-answer-plus-chrome layout the showcase wants (source chip inline in the prose + caret + action row below + expandable sources + follow-ups below that). Building the showcase by extending `TxAiMessage` would mean adding inline-citation-in-prose support, a `TxMessageActions` row, and a `TxSuggestionChips` follow-up row, none of which `TxAiMessage` currently renders.

## 11. `reasoning-disclosure` (TxReasoningDisclosure)

**Files**: `reasoning-disclosure/src/TxReasoningDisclosure.vue` (203 lines); no separate `types.ts` (props are inline).

**API**: `text?`, `streaming?`, `durationMs?`, `defaultOpen?` (default `false`), `label?` (default `'Reasoning'`), `thinkingLabel?` (default `'Thinking…'`), `durationFormatter?: (ms) => string` (default `Thought for X.Xs`). Emit `toggle: [open]`.

**Visual/motion**: header icon swaps to a live `TxThinkingOrb` (`:size 20`, `:display-size 14`) while `streaming`, else a static bulb SVG. While streaming, the label plays a `tx-reasoning-shimmer 1.6s linear infinite` gradient-text sweep; the open body auto-scrolls its own tail (`el.scrollTop = el.scrollHeight` in a `flush: 'post'` watcher on `text`) and gets a bottom mask-image fade (`to bottom, #000 calc(100% - 2em), rgb(0 0 0 / 40%) 100%`) "like the answer's does — one shared reveal language across prose and reasoning" (source comment, `:167-168`). Expand/collapse uses the same `grid-template-rows: 0fr → 1fr` (`0.26s cubic-bezier(0.4,0,0.2,1)`) idiom as `sources` and `tool-call-card`.

## 12. `chain-of-thought` (TxChainOfThought)

**Files**: `chain-of-thought/src/TxChainOfThought.vue` (405 lines); no separate `types.ts` (imports `AiChainStep` from `ai-elements`).

**API**: `steps: AiChainStep[]`, `streaming?`, `defaultOpen?` (default `true`), `label?` (default `'Chain of thought'`), `userOpen?: boolean` (host-owned override — the in-component code comment explains a purely-local override would be lost if a streaming host remounts the instance on every delta, so the open/closed choice must be able to live in host state, `:16-24`). Emit `toggle: [open]`.

**Behavior**: `open` auto-follows the thinking — it opens itself while any step is `active` and folds away once the last live step settles, but a manual click sets `userOverride` and wins from then on (`:40-60`). Renders an ordered list of steps with a connecting vertical line; each step's bullet shows a spinner (active), an X (error), a wrench-like tool icon (kind `'tool'`), or a check (done). Thinking-kind step bodies are rendered through a **per-component `new Marked({ gfm:true, breaks:true })` + `DOMPurify.sanitize`** pass (`:62-70`) rather than `TxStreamMarkdown` — an explicit code comment records that embedding the full streaming component here "froze the trail's own update reactivity (bisected)" (`:168-171`); tool-kind bodies render as verbatim `<span>` text (no markdown). Same header-icon convention as `reasoning-disclosure` (live `TxThinkingOrb` vs. static bulb, gated on `streaming && hasActive`), same label shimmer, same tail-follow scroll + bottom mask-fade on the active step's body, same `0fr→1fr` collapse.

## 13. `context-cards` (TxContextCards, TxContextChunk)

**Files**: `context-cards/src/TxContextCards.vue` (130 lines), `TxContextChunk.vue` (298 lines), `types.ts`; BUI-ported (`TxContextCards.vue:2`).

**API** (`types.ts`): `ContextChunk { id, title, body?, chars?, source?: ContextChunkSource }`; `ContextChunkSource { name, badge?, tone?, href? }` — again "the component never navigates on its own — it emits `open` and the host decides, matching `TxSources`" (`types.ts:15-17`). `TxContextCards` props: `chunks: ContextChunk[]`, `title?` (default `'All chunks'`), `total?: number|string` (the *corpus* size, deliberately not `chunks.length` — "upstream shows `32` above two rendered chunks"), `appear?` (default `true`), `staggerStep?` (default `100`ms/card), `chipDelay?` (default `700`ms before the source chip resolves in), `chipStaggerStep?` (default `80`ms). Emit `open: [payload: ContextChunkOpenPayload]`. Slots for header/chunk/chunk-title/chunk-body/chunk-source overrides.

**Visual/motion**: only the batch of chunks present **at mount** gets the entrance stagger (`enterDelay`/`chipDelay` keyed off `index < initialCount`, `:31-39`) — a chunk streamed in later gets no delay, so it doesn't sit blank waiting for an inherited index-based offset. Demoed with `:total="32"` over two chunks (`DocsComponentsGallery.vue:3936`), matching the documented "corpus size, not rendered count" semantics.

**Composability**: this is a RAG/retrieved-context display, not part of the streamed-*answer* chrome — relevant only if the showcase wants a "context used" panel alongside the answer (distinct from `TxSources`, which is about citation URLs, not chunk text).

## 14. `tool-call-card` (TxToolCallCard)

**Files**: `tool-call-card/src/TxToolCallCard.vue` (364 lines); no separate `types.ts` (imports `AiToolCallPart` from `ai-elements`).

**API**: `toolCall: AiToolCallPart`, `defaultExpanded?` (default `false`), plus label props (`retryLabel`, `pendingLabel`, `runningLabel`, `doneLabel`, `errorLabel`, `inputLabel`). Emits `retry: [id]`, `toggle: [expanded]`. Slots `summary`, `result` (the "widget surface: hosts mount their own rendering... here", `:36`), `icon`.

**Visual/motion**: header shows a status icon (clock/spin/check/alert, `data-status`-driven), name, one-line summary (ellipsis-truncated), status pill, chevron. Body is the same `0fr→1fr` collapse idiom, `inert` while closed. Running-state logs auto-scroll their tail like `reasoning-disclosure`/`chain-of-thought`. Error state renders a retry button inline.

**Composability**: already wired as `TxAiMessage`'s renderer for `AiToolCallPart` parts; usable standalone as demoed (`DocsComponentsGallery.vue:3785`, `default-expanded`).

## Cross-cutting observations relevant to the showcase

1. **Four independent "assistant is busy" visual idioms coexist**: `TxWorkingIndicator` (3×3 animated pixel grid + elapsed timer), `TxThinkingOrb` (canvas-painted orb, random state per mount, embedded inside `reasoning-disclosure`/`chain-of-thought`'s header), `TxAiMessage`'s own hardcoded three-dot `tx-ai-message__typing` pulse, and `TxTypingIndicator` (six CSS-animation variants: dots/ai/pure/ring/circle-dash/bars). None of these is the showcase's "caret while streaming" — that caret already exists, but inside `TxStreamMarkdown` itself (a small pulsing radial-gradient "orb" cursor, topic-1 research, `tx-stream-md-orb` keyframe), a fifth, separate mechanism again.
2. **`ai-elements/src/types.ts` is the single shared vocabulary** for `AiSourceItem`, `AiSuggestion`, `AiChainStep`, `AiToolCallPart`, and the `AiElementMessage`/`AiMessagePart` envelope; every consuming component's own `index.ts` re-export comment says so explicitly, so a new `StreamText`/`StreamElement` that wants to interoperate with citations/suggestions/tool-calls should import from here rather than inventing parallel types (as `chat/src/types.ts`'s `ChatMessageModel` already independently did — see item 9).
3. **The showcase's individual pieces mostly already exist and are demoed standalone** in `DocsComponentsGallery.vue`, each in its own `docs-gallery__cell`, never composed together: `TxSources variant="stack"` (avatar-stack + expandable list), `TxSuggestionChips layout="list"` (staggered fade-up follow-ups), `TxMessageActions` (copy/retry, but no thumbs), `TxInlineCitation` (inline source chip), `TxToolCallCard`, `TxReasoningDisclosure`, `TxChainOfThought`. The `StreamMarkdown` gallery cell (`DocsComponentsGallery.vue:3915-3925`) passes only `:content="markdownSample"` with no `streaming` prop — confirming it renders static content only, per the task's own framing.
4. **The `0fr → 1fr` CSS-grid collapse** (`0.26s cubic-bezier(0.4, 0, 0.2, 1)`, with `inert` on the closed body) is a repeated, consistent idiom across `sources`, `reasoning-disclosure`, `chain-of-thought`, and `tool-call-card` — a de facto shared disclosure pattern, though each component reimplements it locally rather than sharing a composable/mixin.
5. **"Only the tail is live" is a convention, not a shared primitive**, appearing independently in `TxAiMessage.isPartStreaming` (last text part only), `TxReasoningDisclosure`/`TxChainOfThought` (auto-scroll + bottom mask-fade on the active step only), and `TxStreamMarkdown`'s own tail-block handling (topic 1) — four separate implementations of the same idea.
6. **Two message-model vocabularies coexist and do not convert into each other**: `chat/src/types.ts`'s `ChatMessageModel` (simple: content string, image-only attachments, no parts/status) versus `ai-elements/src/types.ts`'s `AiElementMessage` (parts, status, richer attachments, sources). A new streaming showcase built on `ai-elements`/`AiElementMessage` will not interoperate with the plain `chat` family (`TxChatList`/`TxChatMessage`/`TxChatComposer`) without an adapter.
7. **Two independent "avatar stack" implementations exist**: `TxSources variant="stack"` (bespoke 3-favicon overlap, for `AiSourceItem[]`) and `TxAvatarGroup` (general-purpose, `max`/`overlap`/`hoverEffect`/`spreadOnHover`/`overflowPopover`, for arbitrary avatar vnodes). They do not share code.

## Caveats / Not found

- `TxChatComposer.vue` (746 lines) and `TxTypingIndicator.vue` (458 lines) were only grep-scanned for `defineProps`/`defineEmits`/`@keyframes`/`transition` line numbers, not read in full; the composer's attachment-tray/paste/drag-drop internals and the typing indicator's six keyframe bodies are not detailed here beyond their names and line numbers.
- `bot-avatar`'s engine files (`engine.ts`, `draw.ts`, `plastic.ts`, `color.ts`, `shapes.ts`) were not opened — only `types.ts` (full) and the top ~90 lines of `TxThinkingOrb.vue` (a different component) were read in detail; bot-avatar's own `.vue` template/script body was not read.
- `TxAvatar.vue` was read only through line 80 (props/size normalization); its template and `status`/`shape` rendering were not inspected.
- No test files in this group (`ai-elements/__tests__/*`, `avatar/__tests__/avatar.test.ts`, `chain-of-thought/__tests__/*`, `chat/__tests__/*` [6 files], `context-cards/__tests__/*` [2 files], `reasoning-disclosure/__tests__/*`, `tool-call-card/__tests__/*`) were opened in this pass — only topic 1's seven components had their test `describe`/`it` names enumerated.
- Did not check whether any `apps/nexus` demo page (as opposed to the gallery) composes several of these 14 components together into a single full conversation view; only `DocsComponentsGallery.vue`'s standalone per-component cells were checked via grep.
- `avatar-group` has no dedicated doc page (`avatar-variants.en.mdc` / `avatar.en.mdc` presumably cover it); frontmatter for `TxAvatarGroup` specifically was not separately confirmed.
