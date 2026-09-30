# Implement — TxCodeStream content-driven mode + TxStreamCode alias

Follow Parent `implement.md` §1.2, §2, §3, §4. Tick the parent checklist items for this child as they land, and record verification evidence (commands, screenshots, measurements) below.

## Verification evidence (2026-09-30)

Commands are those of parent `implement.md` §2.

### Tests

- The existing `code-stream.test.ts` (22) and `code-stream-diff.test.ts` (12) pass **unchanged**, which is AC6.
- New `code-stream-live.test.ts` (15):
  - mode selection;
  - code present at mount;
  - word-by-word streaming with indentation arriving with the first word;
  - a burst spread over time;
  - entrances inside highlighted markup, and their folding back once done;
  - the 120 ms highlight cadence;
  - the persistent line and caret, with no remount across new lines;
  - the caret retract and `caret: false`;
  - the caret slot and state events (`paused → streaming → draining → done`);
  - `replay` and `skip`;
  - rewrites;
  - `reserve`;
  - reduced motion;
  - SSR;
  - the `TxStreamCode` alias.
- New `code-stream-style.test.ts` (4):
  - every non-`none` animation or transition sits under `no-preference`;
  - the line entrance applies only outside streaming mode;
  - the code variant of the reveal, with no `tx-stream-hue` anywhere;
  - a zero-width caret box.
  - Negative control: moving the copy button's transition out of the block fails it.
- `fresh-chunks.test.ts` gains `seed` (8/8).
- **Affected set:** `code-stream`, `stream-markdown`, `stream-text`, plus the `suite-barrels`, `global-install`, `unscoped-deep-selectors`, `dark-fill-tints`, `bui-dark-neutral-ramp` and `bui-scope-specificity` guards: 25 files, 276 tests, all passing.

### Types and lint

- **tuffex vue-tsc:** 0 errors.
- **ESLint** (per workspace): 0 errors and 0 warnings on the `code-stream` directory, `use-fresh-chunks.ts` and `fresh-chunks.test.ts`. Nexus: the demo and the registry.

### Nexus gates

`check-mdc-fences` 0, `check-doc-translation-parity` 0, `check-demo-registry-orphans` "ok".

### Publish chain on the fresh dist

- `audit-package-exports`, `audit-package-types` and `audit-readme-inventory` pass. `audit-package-size` passes: full bundle 625.9/626.0 KiB, on-demand 596.0/620.0 KiB.
- `dist/es/code-stream/style.css` is 6383 B. Its deps are `button`, `liquid`, `stream-markdown` and `stream-text` (before: `button`, `stream-markdown`). `TxStreamCode` is in `dist/es/code-stream/index.js`.

### Browser (ego, TaskSpace 127, `localhost:3200/zh/docs/dev/components/code-stream`)

- **`CodeStreamLiveDemo` trace**, from a MutationObserver plus 30 ms sampling:
  - States: 输出中 at +4 ms → 模型停顿 at 2431 ms → 输出中 at 3498 ms → 收尾 at 4657 ms → 完成 at 4688 ms.
  - **The caret element was never swapped across all 8 lines.**
  - At most 41 wrapper spans were entering at once. Samples also found fresh spans outside a coloured token, which is the newest text past the last highlight pass, as designed.
  - The pause tail is 「…return null」.
  - At the end: 0 fresh spans, no caret, 31 coloured tokens.
- **Dark filmstrip** (`/tmp/cs-verify/strip.png`, frames at 350, 900, 1700, 2600, 3900 and 5600 ms):
  - words resolve out of a blur in their syntax colour;
  - a new line arrives with its indentation and first word;
  - the caret rides the line being written;
  - the box height stays constant with `min-height`;
  - the final frame shows all 8 lines, 完成, and no caret.
- **Light** (`/tmp/cs-verify/light-pair.png`): the mid-stream line 3 `if (!b…` enters in keyword colour with the caret; the final listing is fully highlighted.
- **`revealedLines` demo, unchanged:** no `is-live`; lines animate with `tx-bui-fade-up`; the still caret shows on lines 1–5 and is gone at 6; the stream caret never appears.
- **Reduced motion** (emulated):
  - Streaming mode: `is-reveal-none`, 0 fresh spans, and the caret has 0 animations.
  - Line `animationName` is `none` in both modes.
