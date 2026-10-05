# Design — TxStreamElement: markdown subset, delegation, citations, one clock, slots + hero showcase

The design lives in the parent: Parent `design.md` §5 (API, parser, one clock, stability), §3 (text rendering reused), §7 (docs, demos, gallery). Record child-specific decisions or deviations below as they arise.

## Decisions and deviations

Where the parent `design.md` §5 and this list disagree, this list is what the code does.

### API (§5.1)

- **`renderers` renders custom parts only**, by name, and the `part-<name>` slot wins over it. There is no per-type or `code:<lang>` lookup.
  - Code is replaced through the `code` slot instead.
  - That slot's scope gains `code`: what has been revealed so far.
- **Additions:**
  - an `inline({ name, props })` slot for custom inlines inside text;
  - `label` in the `citation` scope;
  - a `locale` prop for `Intl.Segmenter`;
  - `tight` on paragraph parts: a tight list item renders its text in a `div` with no paragraph margin.
- **Files:** `types.ts`, `parse.ts`, `plan.ts`, `TxStreamElement.vue`. There is no `slice.ts`.
  - Slicing a text part is `sliceStreamContent`, from the unit model shared with `TxStreamText` (`stream-text/src/model.ts`).
  - `plan.ts` lays the parts out on the clock.
- **No drift-contract entry.** `TxStreamElementInstance` is `InstanceType<typeof TxStreamElement>`, as `TxStreamTextInstance` is in child 1.

### Parsing (§5.2)

- **Delegated parts count by lines, not as one unit.** A `markdown` part is cut at its line ends, and `TxStreamMarkdown` receives a line prefix. A table or a run of formulas therefore comes in row by row on the same clock, with `TxStreamMarkdown`'s own fresh-chunk entrance, instead of popping in whole.
- **A `mermaid` fence is delegated** with the other non-native blocks. Every other fence is native code.

### One clock (§5.3)

- **Parts that mount mid-answer use `appear`.**
  - **The problem.** The plan was that children animate whatever arrives. But a part mounts with the words already due, and content present at mount shows as it is. A burst that crossed into a new paragraph therefore popped its first words in.
  - **New props.** `TxStreamText` and `TxCodeStream` gained `appear`: content present at mount enters too. `TxCodeStream` also gained `paced` (`false` when a parent paces it).
  - **When the element sets it.** Only after the element itself has mounted, never for the reserve copy, and never under reduced motion.
- **A lead caret** waits on an empty line while the stream is live and nothing is revealed yet.
- **Caret handoff.** Only the part holding the last revealed unit streams. The rule:
  - every other part has its caret switched off;
  - switching the caret off now removes it at once in all three parts (`<Transition :css="caret">`), while a stream that ends still retracts it;
  - once the answer is done, the last part keeps its caret switched on, so that caret retracts.

  Before this, each handoff had two costs:
  - the old caret retracted beside the new one, so ego saw two or three carets for about 260 ms;
  - each retract forced a full-page layout from Vue's leave hook, which made the 2–12 ms ticks behind AC11.

### Stability and performance (§5.4)

- **Keys** are `${generation}:${path}${index}:${type}`. `replay()` and `skip()` bump `generation`:
  - a replay remounts every part from empty;
  - a skip mounts them complete, without entrances.
- **The plan cache** keys a text part's model by `JSON.stringify(inlines)`. An unchanged part therefore keeps its model and its content array across parses.
- **Stable slots.**
  - **The cost.** A hand-written render function force-updates every child it passes a slots object to, unless the object is marked `$stable`. Passing fresh forwarders on every render re-rendered every part on every tick: p95 2.6 ms per tick at the tail of a 5,000-character answer.
  - **The fix.** The element now keeps one `$stable` set per layer, whose forwarders look up the host's slot when called.
  - **Following the host.** `useSlotVersion` (in `stream-text/src`, also used by `TxStreamText`) counts changes to the host's slots. The count is a prop of the functional bodies, so a host that swaps, adds or removes a slot still reaches every part.
  - **A latent bug fixed on the way:** the functional bodies never re-rendered on a slot change by themselves.
- **No `raw` caching was needed.** R14 is met without caching settled parts (AC11).

### Reserve

- **The copy plus the current height.**
  - The copy's delegated parts render a frame or two late, so a replay collapsed by 238 px for two frames.
  - `replay()` now also holds the live layer at the height the complete answer has. It reads `getBoundingClientRect` (fractional) and releases the hold when the copy is no longer needed.
- **Margins are trimmed at both ends** of the live layer and of the copy. A grid item keeps its children's margins, while in block layout the last one collapsed through, so the two layouts measured differently.

### Styles

- **Only the block fade.** `stream-reveal-keyframes(block)` emits `tx-stream-fade-blur` alone, because the element animates no words itself. The sheet went 2.7 → 2.4 KiB.
- **Task checkboxes** sit in the marker's place.
  - They are absolutely positioned and centred on the first line: `top: calc(0.5lh - 0.5em)`, inheriting the item's font.
  - An inline checkbox had sat on a line of its own, above the item's block text.
- **`toRaw` on a renderer.** A `renderers` object kept in reactive state would otherwise hand `h()` a proxy.

### Fixes in `TxStreamText` found here

Both are fixed in the shared model and in `renderRun`:
- the space after a chip was dropped ("See [1]for more");
- the space after inline code or a link rendered inside the code pill or the underline.

### Showcase

- **Hero.**
  - Replay plays the finished answer back with `replay()`, at the chosen pace (`wordMs`). It is enabled once the answer is done.
  - Regenerate and the follow-ups stream a new answer.
  - Re-streaming through Replay had made the pace switch almost invisible: 6.1–6.7 s at every setting. A live source sets the overall speed, and `maxLagMs` bounds the difference.
- **Footers** give themselves top spacing, since the answer's box now ends at its last part.
- **The gallery cell** uses `min-height: 6.75rem`, the height of the English answer (the taller one).

### Size

- `stream-element/style.css` is 2484 B.
- The full bundle went 625.7 → 628.1 KiB with it and nothing else.
- Its limit was re-baselined 626 → 629, with a dated note in `scripts/audit-package-size.mjs`.
