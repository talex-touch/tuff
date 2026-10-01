# StreamElement: streaming primitives (StreamText, StreamCode) + composer + showcase

## Goal

Streamed AI output in TuffEx should feel alive and be composable: a `TxStreamElement` that can stream anything, built on streaming primitives (`TxStreamText`, `TxStreamCode`), with motion modelled on kobra.systems' streaming text and a caret drawn from the Tuff logo, plus a showcase that demonstrates the whole answer surface.

## Background

### User request (2026-09-29)

- Screenshot of the Nexus gallery cell **StreamMarkdown** (heading "Tuffex", inline code `pnpm add @talex-touch/tuffex`, "Vue 3 + TypeScript"): "好好优化一下这个吧".
- References: <https://forgeui.in/components/text-morph>, <https://forgeui.in/components/text-reveal>, and above all <https://kobra.systems/components/streaming-text> ("尤其是参考这个动效 … 你可以录个屏抽帧看一下").
- The user pasted BUI's React `StreamingText` (the source already archived at `.trellis/tasks/archive/2026-08/08-15-beautiful-ui-port/research/beautifului-src/03-streaming-text.tsx`): words resolve out of blur, a `cite` token renders an inline source chip, a caret while streaming, then an action row (copy / retry / thumbs up / down + a sources toggle with an avatar stack), an expandable sources list, and staggered follow-ups.
- "StreamText 是非常重要的组件，优化为 StreamElement，可以 stream 输出任何；但是 StreamElement 其实是基于比如 StreamText、StreamCode 等；你还要来一个案例好好展示。" Later: "当然也给用户提供插槽和状态，允许自定义。"

### What exists (evidence and anchors in `research/*.md`)

- No `StreamText`, `StreamCode` or `StreamElement` exists (`research/existing-streaming-components.md`).
  - `TxStreamMarkdown` takes the whole growing `content` + `streaming`, re-lexes every delta and keeps settled blocks' DOM identity (`use-block-stream.ts`), renders blocks through `v-html`, and already animates arrivals: new blocks 0.42 s (opacity .4→1, translateY 4px, blur 3px→0), fresh character chunks in the tail 0.44 s (opacity .08→1, blur 5px→0, `use-fresh-chunks.ts`, resumed with negative delays across re-patches), a tail ink mask, and a pulsing orb caret on `::after`. Vue components cannot live inside its `v-html` prose (`apps/nexus/app/components/content/demos/TemplateResearchDemo.vue:9`).
  - `TxCodeStream` (BUI port) takes the full `code` + a host-driven `revealedLines` cursor and fades lines up; no production consumer (`research/consumers.md`).
  - `TxTextMorph` / `TxTextTransformer` morph a value A → B; the spec forbids a second morph engine (`.trellis/spec/frontend/tuffex-text-motion.md:13-14`) but does not cover an append-only reveal.
- The only production consumer of streamed rendering is `apps/core-app/src/renderer/src/views/base/home/HomePage.vue`, which renders every assistant text segment with `TxStreamMarkdown` (`:1544-1550`, `:1616-1622`; `streaming` is true only for the last part, `apps/core-app/src/renderer/src/modules/conversation/chain-steps.ts:155`).
- The showcase's supporting pieces exist in the `ai` suite, each demoed alone: `TxInlineCitation` (pop-in chip, emits `open`), `TxSources variant="stack"` (favicon stack + expandable list), `TxSuggestionChips layout="list"` (350 ms fade-up, 90 ms stagger), `TxMessageActions` (copy / regenerate / speak + a default slot; no thumbs) (`research/ai-suite-building-blocks.md`).
- Prior decision: BUI 03 Streaming Text was ported as "composition + new leaf" and the combined look left to a Nexus demo (`.trellis/tasks/archive/2026-08/08-15-beautiful-ui-port/design.md:11`); the 09-21 parity audit records it as never compared on a single surface (`.trellis/tasks/archive/2026-09/09-21-bui-parity-audit/audit-result.md:13`).
- The StreamMarkdown gallery cell renders a static two-item sample with no `streaming` (`apps/nexus/app/components/docs/DocsComponentsGallery.vue:580`, `:3914-3920`).
- Motion references, recorded frame by frame (`research/motion-references.md`): kobra = per word, opacity + blue→violet→pink→ink hue sweep, 180 ms, one word per 16 ms, final layout held by an invisible copy; BUI = per word, opacity + blur(4px), 420 ms, static caret; forgeui = per word, opacity + blur(8px), 500 ms, 200 ms stagger.
- Binding rules (`research/prior-decisions.md` → Binding rules): full registration chain with the exhaustive ai gallery band and the docs-coverage test; every colour from a `--tx-*` token; reduced-motion escape that leaves the finished frame; no colour easing on hover; a second keyframe name for replays; looping effects on the compositor with parameters outside keyframes; one writer per custom property; strings as props; ready content must not wait on reveal motion.

## Decisions

- **D1 — Layered new family; `TxStreamMarkdown` only changes its motion.** New `TxStreamText` (word-level reveal, inline Vue components) and `TxStreamElement` (an ordered list of typed parts on one cadence; also accepts a markdown string), with `TxStreamCode` per D5. `TxStreamMarkdown` keeps its `v-html` pipeline and its API; only its arrival reveal and caret switch to the shared family look (D2, D8). `HomePage.vue` code is not touched, but its chat look changes with `TxStreamMarkdown` and must be verified in the running app. Moving HomePage onto `TxStreamElement` is a later, separate task.
- **D2 — Default reveal = hue sweep + light blur (prototype B).** Each word fades in over 460 ms `cubic-bezier(.22,.61,.25,1)` while resolving out of `blur(4px)`, its colour sweeping three reveal stops (blue h250 → violet h295 → pink h350; kobra's lightness per theme) to the ink, linearly over the same 460 ms. Selectable presets: kobra as recorded (opacity + hue, 180 ms, no blur), grey blur (opacity + blur(4px), 420 ms), Home languid (blur(8px) + 4 px rise, 900 ms, out-quint), none. A word stops being an animated element once its animation has run, so the number of animating nodes is bounded by duration ÷ cadence (~20 at the default), not by reply length. Chosen side by side in `/tmp/stream-proto/index.html`.
- **D3 — Content-driven input with a built-in pacer.** Hosts pass everything received so far (`content`) plus `streaming`, as with `TxStreamMarkdown`. The family queues newly arrived words, releases them at `wordMs`, speeds up when the backlog grows so the display never lags far behind, and drains the rest quickly once `streaming` turns false. Known content (demos, stored answers) is passed whole and played with `replay()`; with `reserve`, an invisible copy holds the final layout so nothing reflows. `TxStreamMarkdown` keeps revealing each delta as it lands.
- **D4 — Markdown: a common subset rendered natively, the rest delegated whole.** `TxStreamElement` renders headings, paragraphs, strong / emphasis / strikethrough, inline code, links, lists (nested, task), blockquotes, thematic breaks and fenced code itself, word by word, turning `[n]` markers into citation chips resolved against `sources`. Tables, math, mermaid, raw HTML and images go whole to a `TxStreamMarkdown` block (its sanitising and remote-image policy included) and reveal as blocks.
- **D5 — StreamCode = `TxCodeStream`, upgraded in place.** It gains the content-driven mode (growing `code` + `streaming`), the pacer and word-by-word reveal inside lines (code words fade without the hue sweep); `revealedLines` stays for backward compatibility; `code-stream/index.ts` also exports it as `TxStreamCode`. No breaking change; the docs page stays `code-stream`.
- **D6 — Showcase: docs hero + three gallery cells + a full-page template.** (1) The `TxStreamElement` page opens with the full "AI answer" case (heading, paragraph with citation chips, list and code block stream in; when done the action row fades in, the source stack expands into the list, follow-ups rise in; preset + word-speed switches and replay). (2) Gallery: new `TxStreamElement` and `TxStreamText` cells, and the screenshotted StreamMarkdown cell becomes a live, replayable stream. (3) A Templates page "AI answer" streams a multi-turn Q&A through `TxStreamElement` inside a real `TxConversationStream`.
- **D7 — Thumbs up / down are composed through `TxMessageActions`' default slot in the showcase; `TxMessageActions` does not change.**
- **D8 — A new caret from the Tuff logo: core + orbit (prototype C3).** The logo's ring becomes a rotating gradient arc (logo blue #199FFE → violet #810DC6, 1.6 s ease-in-out loop) around the logo's core glyph (the core path of `apps/nexus/public/logo.svg`, 45° gradient fill, soft glow) breathing at 1.8 s. About 1 em, sits on the text line without changing how it wraps, stays alive while the model pauses, retracts (scale .4 + fade, 260 ms) when the stream ends. It replaces `TxStreamMarkdown`'s orb, so HomePage's caret changes. Compositor-only; still arc + core under reduced motion. Chosen from four logo-derived candidates in `/tmp/stream-proto/caret.html` after the user rejected the orb, BUI's bar and kobra's no-caret.
- **D9 — Everything built in is replaceable, and the stream state is public.** Scoped slots replace the caret, citation chips, code blocks and any part type, and each receives the stream state; the state (idle, streaming, paused, draining, done) is emitted, exposed on the instance and passed to a footer slot, so hosts can drive their own UI from it.

## Requirements

### Shared foundation
- **R1 Reveal presets.** `aurora` (default, D2), `hue` (kobra), `blur` (grey), `languid` (Home), `none`. Stop colours are new tokens `--tx-stream-reveal-1/2/3` with light and dark values; code words use the preset's opacity/blur without the hue. Each preset has a reduced-motion escape that leaves the finished frame; a replay restarts on a second keyframe name.
- **R2 Word units.** Text splits into word units with `Intl.Segmenter` (word granularity; CJK and Latin), whitespace and trailing punctuation riding on the preceding unit; a fallback splitter when `Intl.Segmenter` is missing; inline components (citations, custom inline parts) are atomic units.
- **R3 Pacer.** Releases units every `wordMs` (default 24), accelerates so the backlog never exceeds `maxLagMs` (default 600), drains the remainder within `drainMs` (default 320) once `streaming` is false, reports `paused` after `pauseMs` (default 400) with an empty backlog while still streaming, supports `replay()` and `skip()`, runs on `requestAnimationFrame`, and reveals immediately (no pacing) under reduced motion or on the server.
- **R4 Caret.** `TxStreamCaret` implements D8 with gradient tokens `--tx-stream-caret-start/end`; zero inline size (does not change wrapping); `aria-hidden`; compositor-only loops with parameters outside keyframes; retracts on `done`; still under reduced motion.
- **R5 State and slots (D9).** Every family component emits `state-change`, exposes `state`, `replay()` and `skip()`, and offers a `caret` slot receiving `{ state }`.

### Components
- **R6 `TxStreamText`.** Props `content`, `streaming`, `wordMs`, `maxLagMs`, `reveal`, `caret`, `reserve`, `tag`; renders settled text as plain text and only in-flight words as animated elements; animates only units past the longest common prefix when content is rewritten rather than appended; SSR renders the content without animation; `aria-busy` while streaming or draining.
- **R7 `TxCodeStream` content-driven mode (D5).** A growing `code` + `streaming` streams word by word through the pacer inside highlighted lines (fresh-chunk wrapping, no hue sweep), with the family caret at the end of the last line; `revealedLines` mode and its tests unchanged; `TxStreamCode` exported as an alias.
- **R8 `TxStreamElement`.** Accepts `content` (markdown) or `parts`; renders the D4 subset natively and delegates the rest to `TxStreamMarkdown` blocks; resolves `[n]` against `sources` into `TxInlineCitation` chips (never inside code or links); paces all parts on one clock in document order; completes inline markup at the streaming tail (`completeInlineMarkup`); supports `reserve` + `replay()`; slots for caret, citation, code, custom parts and a footer (D9); emits `cite` when a chip is opened.
- **R9 `TxStreamMarkdown` motion (D1).** Fresh-chunk and block reveals use the shared presets (default `aurora`; an optional additive `reveal` prop), the caret becomes the logo caret; otherwise API and `v-html` pipeline unchanged; all existing tests green.

### Docs and showcase
- **R10 Registration and docs.** `TxStreamText` and `TxStreamElement` complete the registration chain (directory, `components.ts`, `ai` barrel, taxonomy, sidebar order, hub links, zh/en pages meeting the docs-coverage contract, demos, `demo-registry.ts`); `stream-markdown` and `code-stream` pages document the new motion, caret, content-driven mode and alias.
- **R11 Showcase hero (D6-1, D7).** The `stream-element` page opens with the AI answer case: preset and word-speed switches, replay, action row (`TxMessageActions` + thumbs via slot), `TxSources` stack, `TxSuggestionChips` list, all appearing only when the stream is done.
- **R12 Gallery (D6-2).** Cells for `TxStreamElement` and `TxStreamText` in the ai band; the StreamMarkdown cell streams and replays; stateful cells live under `docs/gallery/` and restart on the specimen reset.
- **R13 Template (D6-3).** A Templates page "AI answer" following `.trellis/spec/frontend/nexus-docs-templates.md`: a multi-turn Q&A streaming through `TxStreamElement` inside `TxConversationStream`.

### Quality
- **R14 Performance.** At default settings no more than ~30 words animate at once; the per-tick main-thread cost stays under 2 ms for a 5,000-character answer; replay with `reserve` causes no layout shift.
- **R15 Accessibility.** `aria-busy` while streaming or draining; reserve layer `aria-hidden` + `inert`; caret `aria-hidden`; citation chips keyboard-reachable with accessible names; copy actions use the full content, never the revealed prefix.

## Acceptance Criteria

- [ ] AC1 (R1) Unit and style-contract tests pin the five presets, the token names with light and dark values, the code-word variant, the reduced-motion finished frame and the second-keyframe replay.
- [ ] AC2 (R2) Segmenter tests cover Chinese, English, mixed text, emoji, punctuation, whitespace and the no-`Intl.Segmenter` fallback.
- [ ] AC3 (R3) Pacer tests with fake timers / rAF pin cadence, catch-up bound (lag ≤ `maxLagMs`), drain (≤ `drainMs`), paused detection, `replay`, `skip`, reduced motion and server behaviour.
- [ ] AC4 (R4, R5) Caret tests: zero inline size, `aria-hidden`, retract on done, reduced-motion still frame; a custom caret slot receives `{ state }`; `state-change` sequence idle → streaming → paused → streaming → draining → done is asserted.
- [ ] AC5 (R6) `TxStreamText` tests: only new words mount animated, settled words collapse into text, a rewrite animates only the changed suffix, SSR output has no animated spans.
- [ ] AC6 (R7) `TxCodeStream` existing tests pass unchanged; new tests cover content-driven streaming, fresh-word wrapping inside highlighted lines, caret placement and the `TxStreamCode` alias.
- [ ] AC7 (R8) `TxStreamElement` tests: each D4 element renders natively, table / math / mermaid / html / image spans delegate to `TxStreamMarkdown`, `[n]` becomes a chip only in text, one clock across parts, `reserve` + `replay`, every slot renders with state, `cite` emits the source.
- [ ] AC8 (R9) `TxStreamMarkdown` tests stay green; style-contract tests pin the shared preset and logo caret; HomePage in the running core-app streams, pauses and finishes with the new reveal and caret (verified in the app, not just tests).
- [ ] AC9 (R10) `apps/nexus` vitest docs suite (including `tuffex-component-docs-coverage.test.ts`), `check-mdc-fences`, `check-doc-translation-parity`, `check-demo-registry-orphans`, and tuffex `suite-barrels.test.ts` pass.
- [ ] AC10 (R11–R13) The hero case, the three gallery cells and the template page are verified in a real browser (ego) in dark and light: streaming, pause, done states, replay, preset switch, chip → source.
- [ ] AC11 (R14) Measured in a real browser: concurrent animating words and per-tick scripting time recorded against the budget; no layout shift during a `reserve` replay.
- [ ] AC12 (R15) Accessibility checks: `aria-busy` toggles, reserve layer is hidden from the accessibility tree, chips are focusable with names, copy yields the full answer.
- [ ] AC13 tuffex vitest (affected suites), tuffex `vue-tsc`, ESLint on changed files, and a Nexus `vue-tsc` filtered to changed files are clean, each with a positive control.

## Out of Scope

- Moving HomePage (or any core-app surface) onto `TxStreamElement` (D1).
- Changing `TxMessageActions` (D7).
- Rendering tables, math, mermaid, raw HTML or images natively in `TxStreamElement` (D4 delegates them).
- Pacing inside `TxStreamMarkdown` (D3).

## Open Questions

- None. Confirmed by the user on 2026-09-30 ("confirm 做吧"): preset names `aurora` (default) / `hue` / `blur` / `languid` / `none`; pacer defaults `wordMs` 24, `maxLagMs` 600, `drainMs` 320, `pauseMs` 400; the optional additive `reveal` prop on `TxStreamMarkdown` (R9).
