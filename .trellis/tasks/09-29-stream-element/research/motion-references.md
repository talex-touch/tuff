# Motion references (recorded 2026-09-29 with ego)

Frames: `/tmp/stream-research/kobra-frames/f001–f287.jpg` (CDP screencast, 2580×2076 device px, 4.5 s at 44 ms/word, ~64 fps), filmstrips `/tmp/stream-research/kobra-filmstrip.png` / `kobra-filmstrip-end.png`, front zoom `kobra-front.png`. `/tmp` is ephemeral; the numbers below are the durable record.

## 1. kobra.systems — Streaming Text (the primary reference)

Source of truth: the page's own stylesheet, read through `document.styleSheets` (the "source files" dock is a paywalled decoy).

```css
@keyframes streaming-word-fade { 0% { opacity: 0; } }
@keyframes streaming-word-hue {
  0%   { color: var(--stream-reveal-1); }
  30%  { color: var(--stream-reveal-2); }
  60%  { color: var(--stream-reveal-3); }
  100% { color: inherit; }
}
.streaming-word {
  animation:
    streaming-word-fade var(--stream-reveal-duration) var(--stream-reveal-fade-ease) both,
    streaming-word-hue  var(--stream-reveal-duration) linear both;
}
@media (prefers-reduced-motion: reduce) { .streaming-word { animation: none; } }

:root { --stream-reveal-duration: .18s; --stream-reveal-fade-ease: cubic-bezier(.25, .1, .25, 1); }
:root { --stream-reveal-1: oklch(70% .14 250); --stream-reveal-2: oklch(58% .17 295); --stream-reveal-3: oklch(62% .13 350); }
.dark { --stream-reveal-1: oklch(78% .13 250); --stream-reveal-2: oklch(72% .16 295); --stream-reveal-3: oklch(76% .12 350); }
```

- **No blur, no transform.** Each word only fades in (180 ms, `ease`) while its colour sweeps blue (h 250) → violet (295) → pink (350) → the inherited ink, linearly over the same 180 ms. Dark mode lifts the three stops' lightness (70/58/62 % → 78/72/76 %).
- **Cadence:** one word every `wordMs` (default 16 ms; the demo offers 10 / 16 / 28 / 44). At 16 ms about 11 words are mid-animation at once, so the stream front trails a blue→violet→pink gradient ("aurora tail") into settled ink. Zoomed frame (`kobra-front.png`): `train takes` settled white · `its time,` pink · `and` violet · `Ctrl-C` faint blue.
- **Zero layout shift:** the reply renders twice in one grid cell (`div.grid > div.col-start-1.row-start-1` ×2). The first copy is `invisible` + `aria-hidden="true"` and holds the final text, so every word's position is fixed from the first frame; the visible copy streams on top. Both copies had 71 `span.streaming-word` when settled.
- **Unit = word.** Markup is `<span><span class="streaming-word">Miss</span> <span class="streaming-word">the</span> …</span>`; the spaces are plain text nodes between word spans.
- **Structure streams too:** heading → paragraph → inline citation → bulleted list → code block, in document order. Blocks appear when their first word arrives; no block-level animation except the code block.
- **Inline citation = one token:** the source chip (`button` "2 sources: GitHub, Debian": favicon avatar, first source name, `+1`, pill `rounded-full bg-foreground/[0.07] text-[11px]`, popover on click) is wrapped in a single `span.streaming-word`, so it fades and hue-sweeps in as one word (f120).
- **Code block:** the chrome (header "Terminal" + copy button + frame) fades in as a unit (f244 faint → f250 solid) and the code streams word by word in monospace (`brew install` → `brew install sl &&` → `brew install sl && sl -Fal`, f244–f262); the code words show no visible hue tint.
- **Replay** clears the reply (f020 empty) and restarts from the first word; the whole 71-word reply takes ~3.1 s at 44 ms/word.
- Public API on the page: `children: string` ("the reply so far"), `className`, `wordMs = 16`.

## 2. The user's pasted `StreamingText` (React)

From the chat (a different library's source, same idea): `WORD_MS = 55`, `HOLD_MS = 3400`, loops; tokens `{ text, cite? }`, a `cite` token renders a source chip with `pop-in 250ms cubic-bezier(0.23,1,0.32,1) both`; a caret (`fade-in 150ms`) while streaming; when done: an action row (copy / retry / thumbs up / down + sources toggle with avatar stack; `opacity` transition 400 ms), an expandable sources list (`grid-template-rows 0fr→1fr` + opacity, 300 ms, `cubic-bezier(0.23,1,0.32,1)`), follow-ups with `fade-up 350ms cubic-bezier(0.23,1,0.32,1)` staggered 90 ms. Header comment: "Words resolve out of blur" (the per-word keyframe itself is not in the pasted source). Props: `content`, `sources`, `followUps`, `labels`, `loop`, `fill`, `onDone`, `onFollowUp`.

## 3. forgeui — Text Reveal

WAAPI (Motion). Unit = word. Each word runs two 500 ms `ease-out` animations: `opacity 0→1` and `filter: blur(8px)→blur(0)`; words start 200 ms apart (delays 0, 200, 400, …). A page-load reveal: far slower than streaming (a 12-word line takes ~2.7 s).

## 4. forgeui — Text Morph

A rotating word ("20 • designed") whose characters swap with a blur crossfade, driven by Motion. TuffEx already has `TxTextMorph` / `TxTextTransformer` for this family.

## Takeaways for the design

1. The kobra look is **opacity + a three-stop hue sweep** per word, not blur. forgeui's is **opacity + blur(8px)**. Both are per word; they can be two presets of one reveal.
2. 180 ms per word at a 16 ms cadence means ~11 concurrent CSS animations per stream front — cheap, and bounded by duration ÷ cadence, not by reply length.
3. The invisible measuring layer is what makes streaming feel calm (no reflow, no line jumps). It needs the final text up front, which a real LLM stream does not have — for live streams only the "already arrived" text can be laid out.
4. Atomic inline tokens (a citation chip) and whole blocks (a code block's chrome) take the same reveal as a word; the code body streams without the colour sweep.
