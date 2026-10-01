# Design — TxCodeStream content-driven mode + TxStreamCode alias

The design lives in the parent: Parent `design.md` §2 (shared pieces used here), §4 (content-driven mode, alias, install note). Record child-specific decisions or deviations below as they arise.

## Decisions and deviations

Where the parent `design.md` §4 and this list disagree, this list is what the code does. The docs call the mode "streaming mode".

### Mode and pacing

- **Selection.** `streaming` must be set (either value) with no `revealedLines` and no non-empty `diff`. The explicit `streaming: undefined` default is load-bearing: Vue casts an absent boolean to `false`, which would put every listing in streaming mode (`bui-component-family.md` › Traps).
- **Word units.** A unit is `/\s*\S+|\s+$/`: each word carries the whitespace before it, and trailing whitespace is a final unit. A line break and its indentation therefore arrive with the next line's first word, and the caret never waits alone on an empty line. There is no tail hold: code has no word segmentation to protect, and a token that grows after it shows simply extends in place, the way typing looks.
- **Clock.** The pacer is TxStreamText's (`useStreamPacer`) with `settleMs` 0. Entrance lifetimes are tracked per line by the fresh-chunk trackers, not by the pacer's settled count.
- **Rewrites.** A sync watcher on `code` computes the common character prefix, keeps the units that end at or before it, and calls `pacer.rewind(keep)`. Pure appends take the fast path (`startsWith`) and never rewind.

### BUI hard rule 1 ("pure controlled primitives")

Streaming mode puts a reveal cadence inside a BUI component. That is the rule's own exception: the machine *is* the component's semantic in this mode (D5, approved by the user). `revealedLines` mode stays a pure controlled primitive, unchanged.

### Colour while streaming

- **Highlighting cadence.** Growing code is highlighted on TxCodeBlock's 120 ms trailing timer. Settled code (not streaming, or streaming just turned false) highlights immediately.
- **Line check.** `splitHighlightedLines` now takes the expected line count. Streaming mode passes the highlighted source's own count, because that source is ahead of or behind what is shown; the other modes pass `totalLines`, exactly as before.
- **Mapping shown lines to markup.** `highlightedFrom` records the source that produced `highlighted`, and each shown line maps against it:
  - covered exactly → the line's markup;
  - covered further than shown → markup truncated to the shown length (`truncateHtml`, a template plus a TreeWalker; plain text where there is no DOM);
  - grown past the source → markup plus the new tail escaped (plain until the next pass);
  - anything else → escaped plain text.

### Entrances

- **Every line in streaming mode renders through `v-html`,** so Vue never owns a text node that the wrapping would split.
- **One `createFreshChunks` tracker per line,** keyed by line index with class `tx-bui-code-stream__fresh`. After each post-flush patch, only lines whose element or markup changed are updated.
- **`use-fresh-chunks.ts` gained `seed(el, id)`** (additive; tested in `fresh-chunks.test.ts`). Lines present at mount, everything after `skip()`, and every line after a preset change are *adopted* as already shown. Without it, the first update of a line that was already on screen would animate the whole line.
- **Once `done`,** a timer of one reveal duration re-adopts every line, folding the finished wrappers back into plain markup.

### The line being written is one persistent element

- **Structure.** The template renders the finished lines in a keyed `v-for` and the line being written as a separate unkeyed row. A new line moves the finished text into a new row, while the writing row, its `<code>` and its caret stay the same DOM nodes.
- **Why.** An inline caret rendered in the last `v-for` row would remount on every line break. That restarts `TxStreamCaret`'s orbit at 0° (a visible snap) and replays the Transition's enter and leave on each line.
- **Considered and not taken:**
  - a `Teleport` with a moving target (anchor bookkeeping inside Vue internals);
  - an absolutely positioned caret measured per frame (layout reads each frame). Child 3 does that for StreamMarkdown, where there is no line structure.
- **Evidence.** The browser trace in `implement.md` shows 0 caret remounts across 8 lines.

### Caret, state and API

- **The stream caret** is `TxStreamCaret` in a zero-width `tx-bui-code-stream__stream-caret` box with its own `tx-bui-code-stream-caret` Transition. The CSS is duplicated from TxStreamText, keeping the `tx-bui-code-stream__*` prefix (BUI hard rule 3) rather than borrowing `.tx-stream-text__caret`.
- **The still bar** `tx-bui-code-stream__caret` remains the `revealedLines`-mode marker, untouched.
- **Events.** New: `state-change` and `done`. `complete` stays `revealedLines`-only: in streaming mode, `revealCount` equals `totalLines`, so the old watcher would fire on every new line, and it is now guarded.
- **Slot:** `caret: { state }`. **Expose:** `{ state, replay, skip }`, where `state` is `idle` outside streaming mode.
- **Root:** `is-live`, `is-reveal-<preset>` and `--tx-stream-reveal-duration`, plus `aria-busy="true"` while live.
- **Height.** `--tx-bui-code-stream-lines` follows the shown lines in streaming mode unless `reserve` (with `streaming` off) holds the full count. The demo passes `min-height` for the finished height.
- **`TxStreamCode`** is exported from `code-stream/index.ts` as the same object, with no new type exports.

### Reduced motion: one form for the whole component

- **Every animation and transition** in TxCodeStream is now declared only under `prefers-reduced-motion: no-preference`: the line fade-up, the copy button's transition, the stream presets and the caret Transition.
- **Before,** the component used the reduce-stop form: `bui-fade-up` plus a `reduce` block. The spec asks for one form per component, asserted by a compiled-style test (`tuffex-design-rules.md` › Every transition has a reduced-motion escape). Behaviour is identical: the copy button's override is `transition: none` outside the block, because TxCopyButton's own 0.2 s transition would otherwise run under reduced motion.
- **The line fade-up** now reads `.tx-bui-code-stream:not(.is-live) .tx-bui-code-stream__line`, because in streaming mode the words carry the entrance.
- **The reveal** uses the code variant of the shared mixins, with no colour sweep. So for code, `aurora` equals `blur`, and `hue` is a plain fade (documented).

### Size and style dependencies

- `code-stream/style.css` grows from 4939 to 6383 B.
- `style-deps` gains `liquid` (`useReducedMotion`) and `stream-text` (`TxStreamCaret`). `stream-markdown` was already a dependency, through `shiki-runtime` and `use-auto-theme`.
- The full bundle measured 625.9 KiB against the 626 limit set in child 1, so no re-baseline was needed.
