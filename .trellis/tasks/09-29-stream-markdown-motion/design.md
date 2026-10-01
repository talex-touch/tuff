# Design — TxStreamMarkdown: shared reveal presets + logo caret + live gallery cell

The design lives in the parent: Parent `design.md` §2 (presets, caret), §6 (StreamMarkdown motion), §7 (gallery cell row). Record child-specific decisions or deviations below as they arise.

## Decisions and deviations

Where the parent `design.md` §6 and this list disagree, this list is what the code does. The pipeline (block lexing, the `v-html` markup, fence dispatch, the tail ink mask) is unchanged; so is every existing test.

### The caret

- **One element.** A single `TxStreamCaret` is rendered once in the component, outside `.markdown-body`, in a zero-size absolutely positioned box (`tx-stream-md__caret`). The root gained `position: relative` to be its containing block.
- **Anchor.** Where the caret goes depends on the tail:
  - **Inline** (the existing `INLINE_CURSOR_RE`: the tail ends in `</p>`, `</h1-6>` or `</blockquote>`): the caret goes after the rect of the last visible character of `.tx-stream-md__markup--tail`. That rect comes from a `Range` over the last non-blank text node, trimmed of trailing whitespace; an astral character is kept whole.
  - **Otherwise:** the caret goes on the block cursor line. `.tx-stream-md__cursor` survives as a zero-height anchor, and its orb is gone.
  - The `--tail` class and the `__cursor` element keep their old conditions, so the existing assertions hold.
- **Position is the `translate` property, not `transform`** (parent §6 said `transform`). The individual transform properties compose translate → rotate → scale → transform.
  - With the offset inside `transform`, the enter and leave Transition's `scale` multiplied the offset too, and the caret flew in from the root's corner. ego measured up to 34 px off during the enter.
  - With `translate`, the scale grows the caret in place.
  - There is still one writer, `placeCaret`.
- **Scheduling.** Placement is coalesced to one `requestAnimationFrame` per frame. The patch lands in the same frame's task, so the caret moves before that frame paints. A `ResizeObserver` on the root, live only while the caret shows, re-places it after reflows with no delta (container resize, mermaid layout).
- **Visibility.** The caret shows while `streaming` and at least one block exists (the old cursor's rule), and retracts through a Transition (300 ms enter, 260 ms leave, `no-preference` only).
- **The prior decision "streaming cursor is pure CSS"** (`research/prior-decisions.md:36`) is superseded by the approved D8 (logo caret C3) and parent §6.

### Reveal

- **`reveal` prop.** `reveal?: StreamRevealPreset` defaults to `'aurora'`. Reduced motion (`useReducedMotion`) forces `none`. The root carries `is-reveal-<preset>` and `--tx-stream-reveal-duration`, written through `:style` only (one writer).
- **Fresh chunks** use `stream-reveal-presets('.tx-stream-md__fresh')`, the text variant with the colour sweep. The tracker is created with the preset's duration and recreated when it changes; what is on screen is finished (`fresh.finish`) first.
  - **`languid` keeps chunks inline** (`display: inline` after the mixin). A streamed chunk runs across words, and the preset's `inline-block` would make it unwrappable. `languid` therefore keeps its slow 8 px blur but not its rise (documented).
- **New blocks** enter with the shared `tx-stream-fade-blur` at the preset duration, while `is-streaming` and not `is-reveal-none`, once per block id as before.
  - This replaces `tx-stream-md-reveal` (opacity .4, 4 px rise, 3 px blur).
  - It is written directly rather than through the mixin, because `languid`'s `display: inline-block` would break block layout.
- **Removed:** the `tx-stream-md-reveal`, `tx-stream-md-fresh` and `tx-stream-md-orb` keyframes, and the `::after` / `::before` orb rules with their radial gradient.

### Reduced motion: one form for the whole component

Every animation and transition is now declared only under `prefers-reduced-motion: no-preference`, pinned by `stream-markdown-motion.test.ts`. Two pre-existing transitions had no reduced-motion escape and now have one:

- the tail mask's `--tx-stream-md-ink` easing;
- the table copy button's opacity.

Under reduced motion both now snap instead of easing.

### Gallery

`GalleryStreamMarkdown.vue` replaces the static cell in `DocsComponentsGallery.vue`:

- **Content.** zh and en copy (`streamMarkdown`); the resting state is the finished answer.
- **Loop.** It replays through `useGalleryLoop(play, 7500, 600)`, and no loop runs under reduced motion.
- **Height.** `min-height: 10.5rem` holds the finished height (168 px).
- **Lists.** The gallery stage zeroes list padding for every specimen, which pushed the bullets out of the box. The specimen restores its lists' padding in its own scoped style, rather than touching the stage.
- `markdownSample` is now unused and was removed.

### Size and style dependencies

- `stream-markdown/style.css` goes from 12574 to 12743 B; its deps gain `liquid` and `stream-text`.
- The full bundle is 625.7 KiB against the 626 limit, down 0.2 KiB: the shared keyframes dedupe and the removed ones are gone. The on-demand total is 596.2/620.

### Observed, not changed (outside this child)

HomePage's markdown lists render without bullets. core-app's preflight `@layer base { ol, ul, menu { list-style: none } }` wins, because the vendored GitHub sheet declares no `list-style`. This predates this work; reported to the user.
