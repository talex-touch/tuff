import { Buffer } from 'node:buffer'
import { readdir, readFile, stat } from 'node:fs/promises'
import { dirname, extname, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const root = resolve(__dirname, '..')
const repoRoot = resolve(root, '../..')
const distEs = resolve(root, 'dist/es')
const distLib = resolve(root, 'dist/lib')
const coreRendererRoot = resolve(repoRoot, 'apps/core-app/src/renderer/src')
const rootImportBudgets = [
  {
    label: 'Core App renderer',
    root: coreRendererRoot,
    limit: 0,
    // The plugin sandbox hands whole modules to untrusted plugin code, so it has to hold
    // the namespace: resolveTalexTouchModule serves '@talex-touch/tuffex' and every
    // '@talex-touch/tuffex/*' request from it. There is nothing to tree-shake in a
    // registry whose keys are decided at runtime, and raising the limit to 1 instead
    // would let the next accidental root import in unnoticed.
    allow: ['modules/plugin/widget-registry.ts'],
  },
  {
    label: 'Nexus app',
    root: resolve(repoRoot, 'apps/nexus/app'),
    limit: 0,
  },
  {
    label: 'Tuff business package',
    root: resolve(repoRoot, 'packages/tuff-business/src'),
    limit: 0,
  },
  {
    label: 'Intelligence UI kit package',
    root: resolve(repoRoot, 'packages/intelligence-uikit/src'),
    limit: 0,
  },
]
const fullStyleImportBudgets = [
  {
    label: 'Core App renderer',
    root: coreRendererRoot,
    limit: 0,
  },
  {
    label: 'Nexus app',
    root: resolve(repoRoot, 'apps/nexus/app'),
    limit: 0,
  },
  {
    label: 'Nexus config',
    root: resolve(repoRoot, 'apps/nexus'),
    limit: 0,
  },
  {
    label: 'Tuff business package',
    root: resolve(repoRoot, 'packages/tuff-business/src'),
    limit: 0,
  },
  {
    label: 'Intelligence UI kit package',
    root: resolve(repoRoot, 'packages/intelligence-uikit/src'),
    limit: 0,
  },
]

// Ratchets, not targets. The 16/330 pair was set on 2026-06-05 against 107 components; there are
// now 126, and nothing re-measured them since. They were also never enforced -- no workflow ran
// this script at all -- so they protected nothing while drifting out of date.
//
// These are today's sizes plus a little headroom, which is the smallest change that makes the gate
// mean something: growth from here fails, and lowering them later is a one-line edit. It is not an
// endorsement of the current figures. Whether the CSS itself should shrink is open on #1555, along
// with the measurement behind it: base.css is 14.9 KiB of design tokens (102 `--tx-*` vars) and
// carries only 0.2 KiB of component styles, so it is not leaking -- it simply outgrew a two-month
// -old number.
const LIMITS = {
  // 32 -> 40 on 2026-08-15 for the Beautiful UI port (retired task 08-15-beautiful-ui-port):
  // base.css gains the `--tx-bui-*` token layer (33 tokens x 2 themes + shadow/radius/mono
  // entries, ~2.7 KiB) against 2.4 KiB of headroom. Re-measure and trim the slack once the
  // BUI component family lands.
  baseCssBytes: 40 * 1024,
  // 448 -> 488 and 64 -> 96 on 2026-08-13, re-baselined for the app-shell-v2 convergence (#1742):
  // CI measured full CSS at 481.6 KiB and stream-markdown at 92.0 KiB after that branch's
  // conversation/markdown product styles landed. Same contract as the note above -- today's size
  // plus minimal headroom, growth from here fails, and #1555 still owns whether it should shrink.
  // 488 -> 640 on 2026-08-15: the Beautiful UI port adds 24 component directories. Measured
  // 623.8 KiB after the full family landed (the BUI styles run well above the old 2.8 KiB
  // median — pixel-matched surfaces are style-heavy), so this is actuals plus minimal
  // headroom, same contract as the notes above: growth from here fails.
  // 640 -> 656 on 2026-08-31: the 16.2 KiB of headroom left in August was already spent —
  // master measured 639.8 KiB against the 640 limit, so any style change at all failed the
  // gate, not just a large one. Switch loading (breathing fill, travelling border line) and
  // the slider's dissolve add 4.8 KiB on top, measured at 644.6 KiB. Same contract as every
  // note above: actuals plus minimal headroom, growth from here fails, and #1555 still owns
  // whether the total should be coming down instead.
  // 656 -> 664 on 2026-09-07: three surfaces grew at once — the date picker gained month and
  // year quick-switch grids, a range band with its own end/middle geometry and direction-aware
  // step transitions (+4.3 KiB, after moving its style block to SCSS so its comments stop
  // shipping, which gave 1.4 KiB back); the cascader split into per-level anchored panels with
  // their own row and level styles (+0.1 KiB net, the old column layout came out); and card-item
  // gained the hover-over-active rule. Measured 660.8 KiB. Same contract as every note above:
  // actuals plus minimal headroom, growth from here fails.
  // 664 -> 552 on 2026-09-07: CSS is now minified on the way out (`cssMinify`,
  // with the JS deliberately left readable), which took the same stylesheets
  // from 663.5 KiB to 541.2. Re-baselined against the smaller artifact so the
  // saving cannot be quietly spent.
  //
  // Note what this number is and is not. `components.css` is the full-import
  // entry, which nothing in this repo loads: both apps import `base.css` plus
  // per-component stylesheets. It is a ceiling on the library's total surface,
  // not a measure of what any page downloads — `pageStyleBudgets` below are
  // what track a real cost.
  // 552 -> 560 on 2026-09-12: the vendored GitHub markdown sheet is now scoped
  // (`:where(.tx-md) ` on each of its 314 selectors) because, imported as a
  // global stylesheet, its `.markdown-body` rules were landing on any host page
  // that uses that very generic class — the Nexus docs body does. The scope is
  // 15 bytes x 320 selectors = 4.7 KiB and cannot be backed out without
  // restoring the leak; `:where()` is already the cheapest form that keeps every
  // rule's original specificity, and the marker class is what makes it short
  // (naming both component roots cost 24 bytes more per selector). Toast's
  // stacking and swipe styles add the rest. Measured 556.2 KiB. Same contract as
  // every note above: actuals plus minimal headroom, growth from here fails.
  // 560 -> 576 on 2026-09-15: the TuffEx chart family landed (ECharts host, legend,
  // decoration, and the option presets), and its stylesheets are 12.8 KiB that did
  // not exist before. Measured 571.2 KiB. The gate never reported this because
  // `audit:types` runs first in the CI `&&` chain and was failing on the same
  // commit, so the size run never started. Same contract as every note above:
  // actuals plus minimal headroom, growth from here fails.
  // 576 -> 584 on 2026-09-15: `icon-picker` adds its panel, grid, trigger and shape
  // controls (5.1 KiB measured at dist/es/icon-picker/style.css), which took the full
  // entry to 576.3 KiB against a 576.0 limit. Same contract as every note above:
  // actuals plus minimal headroom, growth from here fails.
  // 584 -> 600 on 2026-09-22: the Beautiful UI parity round
  // (retired task 09-21-bui-parity-and-interaction) adds three
  // component stylesheets — flowchart 2.3 KiB, agent-screen 1.8, toast-panel 1.3 —
  // and grows the ones it reworked: status-badge's chip, diff-table's accept
  // layer, code-stream's diff rows, approval-card's skip, recommendation-card's
  // inline entity, card's press and selection-actions' spring keyframes.
  // Measured 595.4 KiB. Same contract as every note above: actuals plus minimal
  // headroom, growth from here fails.
  // 600 -> 608 on 2026-09-24: two tasks landed together, measured together at 606.0 KiB.
  // Retired task 09-23-composer-motion-reference adds `mode-chip` (4.0 KiB, new) and
  // reworks `chat`'s composer into a shell/card with a tray and icon buttons (~2.9 KiB
  // more), plus the text transformer's setup-state and reduced-motion rules (~0.2 KiB).
  // 09-23-nexus-base-gallery-sidebar grows `empty-state` (+2.6 KiB: the error
  // illustration redrawn, reduced motion for every illustration), `layout-skeleton`
  // (+0.8) and trims `stat-card` (-0.2). Same contract as every note above: actuals
  // plus minimal headroom, growth from here fails.
  // 608 -> 612 on 2026-09-25: `TxBottomDialog` was restyled from a centred
  // button stack into the reference bottom sheet (title/close header, full-width
  // action rows with an optional leading glyph, destructive tone, panel height
  // cap). The component's own style block goes 1.1 -> 3.6 KiB compiled, and the
  // shared `dialog/style.css` it is emitted into goes 3.8 -> 7.9 KiB. Checked for
  // the inlining this limit exists to catch: that sheet carries only
  // `.tx-bottom-dialog*` plus the sibling variant rules that already shared it.
  // Measured 610.1 KiB. Same contract as every note above: actuals plus minimal
  // headroom, growth from here fails.
  // 612 -> 618 on 2026-09-26: three components shipped sheets in one round — `prism-glow`
  // (4.9 KiB), `choice-card` (3.9) and `fusion-surface` (0.7) — and the full bundle went
  // 610.1 -> 615.9 KiB with them. Checked for the inlining this limit exists to catch: the same
  // round *removed* one, the vendored GitHub sheet that `stream-markdown` was carrying as a
  // second copy of `markdown-view`'s (39.0 KiB, the largest single line the on-demand budget
  // counted); it now borrows that sheet through a declared style dependency
  // (`borrowedStyleDeps` in packages/script/build/component-styles.ts). So the full bundle grew
  // by the new components alone while the on-demand set came down. Measured 615.9 KiB. Same
  // contract as every note above: actuals plus minimal headroom, growth from here fails.
  // 618 -> 623 on 2026-09-27: `status-hint` (TxStatusHint, retired task 09-27-corebox-action-
  // feedback-hint) ships its own stylesheet, 4.9 KiB (5054 B), and the full bundle went 616.1 ->
  // 621.0 KiB with it and nothing else (the on-demand set moved by the same 4.9 KiB, 163 -> 164
  // stylesheets, and stays under its limit). Checked for the inlining this limit exists to catch:
  // the sheet carries only `.tx-status-hint*` rules and its own `tx-status-hint-*` keyframes, none
  // of the text-transformer, text-morph or icon rules it reaches through style-deps. It slimmed
  // before asking, 5.7 -> 4.9 KiB: unscoped as TxChoiceCard is, and no `-webkit-` mask duplicate.
  // Same contract as every note above: actuals plus minimal headroom, growth from here fails.
  // 623 -> 626 on 2026-09-30: `stream-text` (TxStreamText and TxStreamCaret,
  // retired task 09-29-stream-text-foundation) ships its own stylesheet, 3.2 KiB (3231 B), all
  // of it present verbatim in components.css. The full bundle measured 624.7 KiB with it and
  // 621.5 without (the 09-28 effect ports had used 0.5 KiB of the headroom left above). Checked
  // for the inlining this limit exists to catch: the sheet carries only `.tx-stream-text*` and
  // `.tx-stream-caret*` rules and its own `tx-stream-*` keyframes, none of the inline-citation or
  // liquid rules it reaches through style-deps. Same contract as every note above: actuals plus
  // minimal headroom, growth from here fails.
  // 626 -> 629 on 2026-09-30: `stream-element` (TxStreamElement, retired task 09-29-stream-element-
  // core) ships its own stylesheet, 2.4 KiB (2484 B), all of it present verbatim in components.css.
  // The full bundle went 625.7 -> 628.1 KiB with it and nothing else; it grew by 2422 B because the
  // bundler folds the one keyframes the sheet shares with its siblings. Checked for the inlining this
  // limit exists to catch: the sheet carries only `.tx-stream-element*` rules and the
  // `tx-stream-fade-blur` keyframes its blocks enter with, none of the stream-text, code-stream or
  // stream-markdown rules it reaches through style-deps. It slimmed before asking, 2.7 -> 2.4 KiB:
  // it no longer copies the word keyframes it never plays. Same contract as every note above:
  // actuals plus minimal headroom, growth from here fails.
  // 629 -> 631 on 2026-10-02: the admin primitives (.trellis/tasks/10-02-tuffex-admin-primitives)
  // add one stylesheet and grow two. `descriptions` (TxDescriptions / TxDescriptionsItem) is new
  // at 1.3 KiB (1374 B); `data-table` grows 641 B for the skeleton loading variant (placeholder
  // rows held to one line box, and the refresh bar with its motion-gated animation), and
  // `pagination` 260 B for the page-size row. The full bundle went 628.0 -> 630.2 KiB with them and
  // nothing else: 2275 B, exactly the three sheets' growth. Checked for the inlining this limit
  // exists to catch: `descriptions/style.css` carries only `.tx-descriptions*` rules, and the two
  // grown sheets add only their own `.tx-data-table__*` / `.tx-pagination*` rules; the skeleton
  // and select styles they now reach stay in their own sheets through style-deps. It slimmed
  // before asking: the descriptions sheet is unscoped (as TxStatusHint's is) and drives both size
  // tiers from two custom properties, and the refresh cell's two declarations are inline. Same
  // contract as every note above: actuals plus minimal headroom, growth from here fails.
  // 631 -> 736 on 2026-10-05: Amicro fusion adds 14 source modules plus two SVG/pixel
  // chart families. The built full entry measured 731.8 KiB; the new root sheets total
  // 89,836 B (87.7 KiB), with chart additions and the scoped Slider lifecycle surface
  // accounting for the rest. Primitive overrides remain beneath their owning Motion
  // roots; they do not inline the input/tabs/select/Skeleton sheets. Measured actuals
  // plus minimal headroom; root/full-style import bans and per-file ceilings stay fixed.
  // 736 -> 738 on 2026-10-08: the TxCopyButton redesign (failure state, `iconOnly` with a
  // width FLIP, drawn check/cross glyphs, colour eased only across a state change) grows
  // `button/style.css` 14,708 -> 16,774 B, and TxCodeStream's copy override gains its ring
  // and failure rules, `code-stream/style.css` 6,383 -> 6,588 B. Those two sheets are the
  // only ones that moved; the full entry went 735.0 -> 737.3 KiB. It slimmed before asking:
  // the copy button is unscoped (-0.6 KiB of data-v attributes) and its two tones share one
  // rule through custom properties. Actuals plus minimal headroom, growth from here fails.
  // 738 -> 740 on 2026-10-08, the motion primitives round: `morph` (TxMorph) ships its own
  // stylesheet, 1,318 B, and three existing sheets grow by 826 B together. `transition`
  // 1,638 -> 2,272 B: the `blur` preset's rules, and TxTransitionSmoothSize's own box/measure
  // layer now that it no longer renders TxAutoSizer. `switch` 4,763 -> 4,863 B: the thumb's
  // `transition: all` became the explicit property list its spring-drawn travel needs. `charts`
  // 26,884 -> 26,976 B: TxLineSeries' draw-enter symbol fade. The full bundle went 737.3 ->
  // 739.4 KiB, exactly that growth. Checked for the inlining this limit exists to catch: the
  // morph sheet carries only the `--tx-morph-radius` registration and `.tx-morph*` rules, and
  // each grown sheet only its own component's rules. Actuals plus minimal headroom, growth
  // from here fails.
  // 740 -> 745 on 2026-10-10: FlowLight and VoiceClip add two independent sheets
  // (2,118 B and 2,549 B). CI at ff09f8a67 measured 744.0 KiB, versus 739.4 before
  // these components. Both sheets contain only their own selectors and keyframes;
  // FlowLight's surface wrappers reach its sheet through style-deps, not inlining.
  // Actuals plus minimal headroom; per-file and root/full-style import gates stay fixed.
  // 745 -> 748 on 2026-10-11: TxButton progress-bar and status state support (background
  // progress track/fill, numeric readout, drawn status glyphs, and `.is-morphing` colour
  // transitions) grows `button/style.css` after un-scoping `TxIconButton` (-0.5 KiB of
  // `data-v` attributes). Measured 746.8 KiB. Checked for inlining: `button/style.css`
  // carries only `.tx-button*`, `.tx-split-button*`, `.tx-icon-button*` and
  // `.tx-copy-button*` rules; `text-morph` stays in its own sheet through style-deps.
  // 748 -> 750 on 2026-10-14: DataTable semantic cells and column-filter panels
  // add component-owned styles; Select/form border-box corrections land alongside.
  // The final isolated 0.8.0 build measures 749.0 KiB after removing DataTable's
  // scoped-selector payload and merging duplicate declarations (751.4 before).
  // data-table/style.css contains only its BEM rules and refresh keyframes, not
  // Popover/Skeleton dependency rules. Component JS is split at the data-state
  // boundary (42.9 KiB, under the unchanged 48 KiB limit). Actuals plus minimal
  // headroom; per-file and root/full-style import gates remain unchanged.
  // 750 -> 750.5 on 2026-10-15: TxAttachmentTray's preview now opens TxImageGallery's
  // viewer instead of keeping its own lightbox, and the viewer gains a load skeleton and
  // a failed-image placeholder. `attachment-tray/style.css` 4,024 -> 3,268 B,
  // `image-gallery/style.css` 1,204 -> 2,240 B; no other sheet moved. Checked for
  // inlining: each sheet carries only its own `.tx-attachment-tray*` / `.tx-attachment-chip*`
  // or `.tx-image-gallery*` rules, the shimmer keyframes come from the shared
  // `skeleton-keyframes` mixin as in agent-screen and layout-skeleton, and the tray reaches
  // the viewer's rules through style-deps (`attachment-tray -> image-gallery, modal`).
  // Measured 768,050 B (750.05 KiB). Actuals plus minimal headroom, growth from here fails.
  // 850 -> 858 on 2026-10-23. The limit had gone 750.5 -> 835 -> 850 without notes
  // (b463002ab, da5eb243f); HEAD measures 864,126 B (843.87 KiB) against it. TxImagePreview
  // ships its own stylesheet, 13,758 B, and TxImageGallery's viewer moves into it
  // (`image-gallery/style.css` 2,240 -> 447 B, 9 B of it so its thumbnails ignore the margins
  // host typography gives pictures). The rest is fixes in sheets that already existed:
  // progress-bar +835 B (label rows above or below the track, where an inside label goes when
  // the track is too thin for it), tree +207 (long labels truncate), button +218 (so does a
  // block button's), group-block +183 (controls in a group keep their own corners),
  // segmented-slider +159 (the end stops stay on the track), flat-radio +105 (a group wider
  // than its row shrinks its items), attachment-tray +24, spinner +22, prompt-bar +13; and
  // terminal +29 from other work in the same checkout. Checked for inlining:
  // `image-preview/style.css` is unscoped and carries only `.tx-image-preview*` rules, its
  // shimmer keyframes come from the shared `skeleton-keyframes` mixin, the tray and the gallery
  // reach it through style-deps (`attachment-tray, image-gallery -> image-preview`, which no
  // longer pulls in modal; later the same day that edge moved to `style-lazy-deps.json`, see the
  // chat page budget), and no rule repeats across sheets. Measured 877,887 B (857.31 KiB).
  // Actuals plus minimal headroom, growth from here fails.
  // 858 -> 865 the same day for TxForm's layouts and the controls that join a form item: the
  // auto / side / stacked / inline layouts with their container query and subgrid label column,
  // TxFormRow, TxFormErrorSummary, the message states and the width tiers (`form/style.css`
  // 1,047 -> 7,202 B); a block row that joins a form marks itself required and shows its
  // message in place of the description (`group-block/style.css` 9,549 -> 10,077 B); and the
  // danger border and focus ring an input and a number input take while their item shows an
  // error (`input/style.css` 2,892 -> 3,217 B, `number-input/style.css` 2,481 -> 2,751 B). No
  // other sheet moved: HEAD measures 878,315 B here and this 885,593 B, exactly that growth.
  // Checked for inlining: the new rules sit on `.tx-form*`, `.tx-block-slot*`, `.tx-input` and
  // `.tx-number-input` selectors alone. Actuals plus minimal headroom, growth from here fails.
  // 865 -> 865.5 the same day: TxForm's draft notice, a line of text with Restore and Discard
  // buttons, grows `form/style.css` 7,202 -> 7,733 B; no other sheet moved, and the full entry
  // went 885,593 -> 886,124 B, exactly that growth. Checked for inlining: the new rules are
  // `.tx-form__draft*` alone. Actuals plus minimal headroom, growth from here fails.
  // 865.5 -> 866.5 the same day for TuffForm's templates and read-only state: two new sheets,
  // TxDrawerForm's footer (`drawer-form/style.css`, 104 B) and TxStepsForm's step grid and footer
  // (`steps-form/style.css`, 289 B), and checkbox, radio, select and switch dropping their hover
  // and press feedback while read-only (+439 B across the four). The full entry went 886,124 ->
  // 886,956 B, exactly that growth. Checked for inlining: the new sheets carry only
  // `.tx-drawer-form*`, `.tx-steps-form*` and `.tx-form-step` rules, and the read-only rules sit
  // on each control's own selectors. Actuals plus minimal headroom, growth from here fails.
  // 866.5 -> 870 on 2026-10-24 for TxImagePreview's minimap: the whole picture in the corner
  // while it is zoomed in, with the part on the stage framed, kept clear of the strip, the
  // toolbar and the next-page button on the desktop and placed for the phone layout, with smooth
  // corners (`tx-squircle`) that the frame's come round to as it reaches them
  // (`image-preview/style.css` 13,758 -> 17,300 B). The full entry went 886,956 -> 890,498 B,
  // exactly that growth. Checked for inlining: the new rules are `.tx-image-preview__minimap*`
  // alone. Actuals plus minimal headroom, growth from here fails.
  // 870 -> 870.5 the same day for TxImagePreview's zoom menu: the readout opens the whole picture
  // and the zooms past it in a menu laid over the preview, above the minimap and the page
  // buttons, with room for the check on every item and the readout lit while it is open
  // (`image-preview/style.css` 17,300 -> 17,790 B). No other sheet moved, and the full entry
  // went 890,498 -> 890,988 B, exactly that growth. Checked for inlining: the new rules sit on
  // `.tx-image-preview__menu*` and `.tx-image-preview__readout` alone. Actuals plus minimal
  // headroom, growth from here fails.
  // 870.5 -> 872 on 2026-10-29 for TxGlassSurface's lens engine (`engine="lens"`): the refraction
  // layer, the rim light and the lifted-press shading (`glass-surface/style.css` 819 -> 2,353 B).
  // No other sheet moved, and the full entry went 891,385 -> 892,919 B, exactly that growth.
  // Checked for inlining: the new rules sit on `.tx-glass-surface--lens` and
  // `.tx-glass-surface__svg--lens` alone. It slimmed before asking: the forced-colours rule for
  // the lens keeps only what the base rule does not already paint (2,461 -> 2,353 B). Actuals
  // plus minimal headroom, growth from here fails.
  fullCssBytes: 872 * 1024,
  // 96 -> 56 on 2026-09-12: the largest stylesheet was `stream-markdown` at
  // 103.3 KiB carrying a duplicated copy of the markdown sheet; at 50.1 KiB it
  // is back under, and the next largest is `markdown-view` at 40.8. Actuals plus
  // minimal headroom, as above.
  componentCssBytes: 56 * 1024,
  componentJsBytes: 48 * 1024,
  // Per-file exceptions to `componentJsBytes`, keyed by the path under `dist/es`.
  // A global raise was the wrong lever here: border-beam is a lone outlier at
  // 76.7 KiB while the next largest component JS is 38.5 KiB, so lifting the
  // shared limit would hand ~10 KiB of new slack to all 492 files to
  // accommodate one. Each entry is a measurement plus the reason it is not
  // simply bloat, and it still fails when it grows past the number recorded.
  componentJsOverrides: {
    // 76.7 KiB measured 2026-08-20. `border-beam/src/styles.ts` is a 2,163-line
    // MIT port kept deliberately close to upstream so upstream fixes stay
    // diffable (see the header of that file); trimming it to fit is a call for
    // whoever owns that contract, not for this gate. It arrived in c5e6660d9 on
    // 2026-08-18 and has failed tuffex CI on every commit since — which cost
    // every tuffex change its build signal, this file's own audits included.
    'border-beam/src/styles.js': 80 * 1024,
  },
  emptyStateAliasCssBytes: 128,
}

// What a page loads: `base.css` (`baseCssBytes` above) plus the style closure of the components
// it imports. The closure is the shipped on-demand plugin's own walk over `style-deps.json`, so
// each number is what a consumer running the plugin gets, not an estimate of it.
//
// Set on 2026-10-15 in place of `onDemandCssBytes`, which added up every component stylesheet:
// 188 of them, the library's whole surface a second time, so it moved byte for byte with
// `fullCssBytes` and every round bumped both. A page never loads that set. The one job it had
// of its own, catching a sheet that inlines another's rules, is `auditDuplicateRules` now,
// which names the rule and both sheets instead of leaving a total to explain by hand.
// Measured 48,165 / 74,730 / 125,248 / 146,233 B in 13 / 21 / 28 / 26 sheets. Actuals plus
// minimal headroom, same contract as every limit above: growth from here fails.
const pageStyleBudgets = [
  // TxButton alone reaches the anchor and surface stack, the icon, and the copy button's text
  // engine, so every page below starts from these 13 sheets.
  {
    label: 'button',
    components: ['button'],
    // 58 -> 59 on 2026-10-29 for TxGlassSurface's lens engine, the only sheet of the 13 that
    // moved (`glass-surface/style.css` 819 -> 2,353 B): 58,501 -> 60,035 B. Every page below
    // reaches that sheet through the surface stack, so each one grows by the same 1,534 B.
    // Actuals plus minimal headroom, growth from here fails.
    limit: 59 * 1024,
  },
  {
    label: 'form',
    components: ['form', 'input', 'select', 'checkbox', 'switch', 'button', 'modal'],
    // 88 -> 93.5 on 2026-10-23 for TxForm's layouts, in two sheets: the auto / side / stacked /
    // inline layouts with their container query and subgrid label column, TxFormRow,
    // TxFormErrorSummary, the message states and the width tiers (`form/style.css` 1,047 ->
    // 7,202 B), and the danger border and focus ring an input takes while its item shows an
    // error (`input/style.css` 2,892 -> 3,217 B). HEAD measured 88,753 B against the 90,112 B
    // limit; this measures 95,233 B. Actuals plus minimal headroom, growth from here fails.
    // 93.5 -> 94 the same day for the draft notice (`form/style.css` 7,202 -> 7,733 B), the
    // only sheet of the 21 that moved: 95,764 B.
    // 94 -> 95.5 on 2026-10-29 for TxGlassSurface's lens engine, the only sheet of the 21 that
    // moved (`glass-surface/style.css` 819 -> 2,353 B): 96,042 -> 97,576 B. Actuals plus minimal
    // headroom, growth from here fails.
    limit: 95.5 * 1024,
  },
  {
    label: 'admin list',
    components: ['data-table', 'pagination', 'tabs', 'input', 'select', 'button', 'drawer'],
    // 135 -> 136.5 on 2026-10-29 for TxGlassSurface's lens engine, the only sheet of the 28 that
    // moved (`glass-surface/style.css` 819 -> 2,353 B): 138,106 -> 139,640 B. Actuals plus
    // minimal headroom, growth from here fails.
    limit: 136.5 * 1024,
  },
  {
    label: 'chat',
    components: ['chat', 'conversation-stream', 'stream-markdown', 'prompt-bar', 'attachment-tray', 'image-gallery', 'message-actions', 'thinking-orb', 'modal'],
    // 155 -> 155.5 on 2026-10-21 for 0.9.1's refraction fix, in two sheets every page here
    // reaches: TxCard goes back to round corners while it hosts a glass layer, because Chromium
    // drops the SVG backdrop filter under a superellipse clip (`card/style.css` +268 B), and the
    // glass layer takes its strength from a variable the layer fade zeroes (`base-surface/style.css`
    // +73 B). 0.9.0 measured 158,569 B against the 158,720 B limit; this measures 158,910 B.
    // Actuals plus minimal headroom, growth from here fails.
    // 155.5 -> 167.5 on 2026-10-23: the tray and the gallery open TxImagePreview, which they
    // import statically, so its sheet joins the page (+13,758 B, 26 -> 27 sheets) as the
    // gallery's viewer leaves `image-gallery/style.css` (-1,793 B); button +218 (block labels
    // truncate), attachment-tray +24, spinner +22 and prompt-bar +13 make up the rest. Measured
    // 171,152 B, gzip 26,132 B, against HEAD's 158,910 B. Loading the preview lazily would keep its
    // sheet off the page until a picture opens, at the cost of the first opening waiting for a
    // chunk before it can fly out. Actuals plus minimal headroom, growth from here fails.
    // 167.5 -> 168 later the same day: TxBaseSurface paints solid under forced colours, a Canvas
    // fill with a CanvasText edge and no layers, in a sheet every page here reaches through the
    // surface stack (`base-surface/style.css` +380 B). Measured 171,532 B against 171,520.
    // Actuals plus minimal headroom, growth from here fails.
    // 168 -> 154.5 later still: the tray and the gallery import TxImagePreview once a picture is
    // about to open (pointing at or focusing them starts it, as does pressing a thumbnail). The
    // build records that edge in `style-lazy-deps.json` instead of `style-deps.json`, and the
    // on-demand plugin hands the preview's closure to that import, so its sheet arrives with its
    // chunk and leaves the page (-13,758 B, 27 -> 26 sheets; the rest of its closure is already
    // here). Measured 157,774 B, gzip 24,073 B. Actuals plus minimal headroom, growth from here
    // fails.
    // 154.5 -> 156 on 2026-10-29 for TxGlassSurface's lens engine, the only sheet of the 26 that
    // moved (`glass-surface/style.css` 819 -> 2,353 B): 157,945 -> 159,479 B. Actuals plus
    // minimal headroom, growth from here fails.
    limit: 156 * 1024,
  },
]

/**
 * A built file's path relative to `dist/es`, with `/` separators on every platform.
 *
 * `componentJsOverrides` keys are exact relative paths, so they have to be compared against one.
 * A suffix test also matches `x/border-beam/src/styles.js` -- a different component that happens
 * to end the same way -- and would hand it the 80 KiB budget without anyone noticing. `relative()`
 * also emits `\` on Windows, which no key contains.
 */
function toDistRelativePath(file) {
  return relative(distEs, file).split(sep).join('/')
}

function componentJsLimitFor(file) {
  const limit = LIMITS.componentJsOverrides[toDistRelativePath(file)]
  return limit === undefined ? LIMITS.componentJsBytes : limit
}
const emptyStateStyleAliases = [
  'blank-slate',
  'empty',
  'error-state',
  'guide-state',
  'loading-state',
  'no-data',
  'no-selection',
  'offline-state',
  'permission-state',
  'search-empty',
]
// FlowLight is opt-in at runtime but statically imported by BaseSurface and Card.
// Declare that exact new edge for the existing consumers of the surface stack.
const onDemandImportBudgets = [
  {
    // TxAvatarGroup's overflow popover is opt-in at runtime but statically imported,
    // so `avatar` now carries the whole anchor stack. Declared rather than left
    // implicit: this is the edge that would otherwise grow unnoticed.
    subpath: 'avatar',
    allowedComponentDirs: ['avatar', 'base-anchor', 'base-surface', 'card', 'flow-light', 'glass-surface', 'icon', 'popover', 'spinner', 'tooltip'],
    forbiddenStaticSpecifierPrefixes: ['gsap'],
  },
  {
    subpath: 'base-anchor',
    allowedComponentDirs: ['base-anchor', 'base-surface', 'card', 'flow-light', 'glass-surface', 'spinner'],
    forbiddenStaticSpecifierPrefixes: ['gsap'],
  },
  {
    subpath: 'base-surface',
    allowedComponentDirs: ['base-surface', 'flow-light', 'glass-surface'],
  },
  {
    subpath: 'button',
    // `tooltip` rides in behind `popover`: TxPopover is now a TxTooltip
    // specialisation, so anything reaching the popover reaches the tooltip too.
    // `icon` rides in behind TxIconButton, which renders its glyph via TxIcon.
    // `text-transformer`, `text-morph` and `liquid` ride in behind TxCopyButton, whose
    // label morphs through TxTextTransformer (the text-morph engine, sprung by liquid's
    // compiler) — the one text engine the library allows, as TxSwitch and TxModeChip use it.
    allowedComponentDirs: ['base-anchor', 'base-surface', 'button', 'card', 'flow-light', 'glass-surface', 'icon', 'liquid', 'popover', 'spinner', 'text-morph', 'text-transformer', 'tooltip'],
    forbiddenStaticSpecifierPrefixes: ['gsap', 'v-wave'],
  },
  {
    subpath: 'input',
    allowedComponentDirs: ['input'],
  },
  {
    subpath: 'select',
    // `tooltip` rides in behind `popover` — see the button entry above.
    allowedComponentDirs: ['base-anchor', 'base-surface', 'card', 'card-item', 'flow-light', 'glass-surface', 'input', 'popover', 'search-input', 'select', 'spinner', 'tooltip'],
    forbiddenStaticSpecifierPrefixes: ['gsap'],
  },
  {
    // TxPagination's page-size selector is opt-in at runtime (`pageSizes`) but
    // statically imported, so `pagination` now carries TxSelect and its anchor
    // stack. Declared for the same reason as the avatar entry: this is the edge
    // that would otherwise grow unnoticed.
    subpath: 'pagination',
    allowedComponentDirs: ['base-anchor', 'base-surface', 'card', 'card-item', 'flow-light', 'glass-surface', 'icon', 'input', 'pagination', 'popover', 'search-input', 'select', 'spinner', 'tooltip'],
    forbiddenStaticSpecifierPrefixes: ['gsap'],
  },
  {
    subpath: 'code-editor',
    allowedComponentDirs: ['code-editor', 'icon'],
    forbiddenStaticSpecifierPrefixes: ['@codemirror/', '@lezer/', 'yaml'],
  },
  {
    subpath: 'flip-overlay',
    allowedComponentDirs: ['base-surface', 'button', 'flip-overlay', 'flow-light', 'glass-surface', 'icon', 'spinner'],
    forbiddenStaticSpecifierPrefixes: ['gsap'],
  },
  {
    subpath: 'radio',
    allowedComponentDirs: ['glass-surface', 'radio'],
  },
  {
    subpath: 'scroll',
    allowedComponentDirs: ['scroll'],
  },
]
const tuffexRootImportPatterns = [
  /(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]@talex-touch\/tuffex['"]/,
  /import\(\s*['"]@talex-touch\/tuffex['"]\s*\)/,
]

async function collectFiles(dir, predicate) {
  const dirents = await readdir(dir, { withFileTypes: true })
  const files = await Promise.all(
    dirents.map(async (dirent) => {
      const filePath = resolve(dir, dirent.name)
      if (dirent.isDirectory())
        return collectFiles(filePath, predicate)
      return predicate(filePath) ? [filePath] : []
    }),
  )
  return files.flat()
}

async function sizeOf(filePath) {
  return (await stat(filePath)).size
}

function relativeToRepo(filePath) {
  return filePath.replace(`${repoRoot}/`, '')
}

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`
}

function toSortedEntries(entries) {
  return entries.sort((a, b) => b.bytes - a.bytes)
}

async function getSizedFiles(files) {
  return Promise.all(
    files.map(async file => ({
      file,
      bytes: await sizeOf(file),
    })),
  )
}

function printTop(label, entries, limit = 10) {
  console.log(`[audit-package-size] ${label}`)
  for (const entry of entries.slice(0, limit)) {
    console.log(`- ${formatBytes(entry.bytes)} ${relativeToRepo(entry.file)}`)
  }
}

async function collectDistComponentDirs() {
  const dirents = await readdir(distEs, { withFileTypes: true })
  return new Set(
    dirents
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name)
      // 'utils' is shared code, not a component -- audit-package-exports.mjs excludes it
      // from its own component enumeration for the same reason. Counting it here made
      // every on-demand entry report "reaches unexpected component dirs: utils", which
      // is true of all of them by design and told nobody anything.
      .filter(name => !['_virtual', 'node_modules', 'packages', 'utils'].includes(name)),
  )
}

function collectRuntimeSpecifiers(source) {
  const specifiers = []
  const importPattern = /(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g
  for (let match = importPattern.exec(source); match !== null; match = importPattern.exec(source)) {
    specifiers.push(match[1])
  }
  return specifiers.filter(Boolean)
}

function resolveRuntimeSpecifier(fromFile, specifier) {
  if (!specifier.startsWith('.'))
    return null
  if (specifier.endsWith('.css'))
    return null

  const resolved = resolve(dirname(fromFile), specifier)
  if (!resolved.startsWith(distEs))
    return null
  if (resolved.includes('/node_modules/'))
    return null
  return resolved
}

async function collectRuntimeImportGraph(entryFile) {
  const pending = [entryFile]
  const visited = new Set()

  while (pending.length > 0) {
    const file = pending.pop()
    if (!file || visited.has(file))
      continue
    visited.add(file)

    const source = await readFile(file, 'utf-8')
    for (const specifier of collectRuntimeSpecifiers(source)) {
      const resolved = resolveRuntimeSpecifier(file, specifier)
      if (resolved && !visited.has(resolved))
        pending.push(resolved)
    }
  }

  return visited
}

async function auditOnDemandImports(errors) {
  const componentDirs = await collectDistComponentDirs()
  const rootEntrypoints = new Set([
    resolve(distEs, 'index.js'),
    resolve(distEs, 'components.js'),
  ])

  for (const budget of onDemandImportBudgets) {
    const entryFile = resolve(distEs, budget.subpath, 'index.js')
    const graph = await collectRuntimeImportGraph(entryFile)
    const visitedRootEntrypoints = [...graph].filter(file => rootEntrypoints.has(file))
    const visitedComponentDirs = new Set()
    const forbiddenSpecifiers = new Set()

    for (const file of graph) {
      const relativePath = file.replace(`${distEs}/`, '')
      const [dir] = relativePath.split('/')
      if (componentDirs.has(dir))
        visitedComponentDirs.add(dir)

      if (budget.forbiddenStaticSpecifierPrefixes?.length) {
        const source = await readFile(file, 'utf-8')
        for (const specifier of collectRuntimeSpecifiers(source)) {
          if (budget.forbiddenStaticSpecifierPrefixes.some(prefix => specifier === prefix || specifier.startsWith(prefix)))
            forbiddenSpecifiers.add(specifier)
        }
      }
    }

    const allowedComponentDirs = new Set(budget.allowedComponentDirs)
    const unexpectedComponentDirs = [...visitedComponentDirs]
      .filter(dir => !allowedComponentDirs.has(dir))
      .sort()

    if (visitedRootEntrypoints.length > 0) {
      errors.push(
        `${budget.subpath} on-demand entry reaches root package entrypoints: ${visitedRootEntrypoints.map(relativeToRepo).join(', ')}`,
      )
    }

    if (unexpectedComponentDirs.length > 0) {
      errors.push(
        `${budget.subpath} on-demand entry reaches unexpected component dirs: ${unexpectedComponentDirs.join(', ')}`,
      )
    }

    if (forbiddenSpecifiers.size > 0) {
      errors.push(
        `${budget.subpath} on-demand entry statically imports forbidden specifiers: ${[...forbiddenSpecifiers].sort().join(', ')}`,
      )
    }

    console.log(
      `[audit-package-size] ${budget.subpath} on-demand component dirs: ${[...visitedComponentDirs].sort().join(', ') || '(none)'}`,
    )
  }
}

async function auditRootImports(errors) {
  for (const budget of rootImportBudgets) {
    const sourceFiles = await collectFiles(budget.root, filePath =>
      ['.ts', '.tsx', '.vue'].includes(extname(filePath)),
    )
    const rootImportFiles = []

    await Promise.all(
      sourceFiles.map(async (filePath) => {
        const source = await readFile(filePath, 'utf-8')
        if (!tuffexRootImportPatterns.some(pattern => pattern.test(source))) return
        const relativePath = relative(budget.root, filePath)
        if ((budget.allow ?? []).some(allowed => relativePath === allowed)) return
        rootImportFiles.push(filePath)
      }),
    )

    if (rootImportFiles.length > budget.limit) {
      errors.push(
        `${budget.label} TuffEx root imports grew to ${rootImportFiles.length}; limit is ${budget.limit}`
        + ` (${rootImportFiles.map(filePath => relative(budget.root, filePath)).join(', ')})`,
      )
    }

    console.log(`[audit-package-size] ${budget.label} root import files: ${rootImportFiles.length}/${budget.limit}`)
  }
}

async function auditFullStyleImports(errors) {
  for (const budget of fullStyleImportBudgets) {
    const sourceFiles = await collectFiles(budget.root, filePath =>
      ['.ts', '.tsx', '.vue', '.js', '.mjs', '.scss', '.css'].includes(extname(filePath)),
    )
    const fullStyleImportFiles = []

    await Promise.all(
      sourceFiles.map(async (filePath) => {
        const source = await readFile(filePath, 'utf-8')
        if (source.includes('@talex-touch/tuffex/style.css'))
          fullStyleImportFiles.push(filePath)
      }),
    )

    if (fullStyleImportFiles.length > budget.limit) {
      errors.push(
        `${budget.label} TuffEx full style imports grew to ${fullStyleImportFiles.length}; limit is ${budget.limit}: ${fullStyleImportFiles.map(relativeToRepo).join(', ')}`,
      )
    }

    console.log(`[audit-package-size] ${budget.label} full style import files: ${fullStyleImportFiles.length}/${budget.limit}`)
  }
}

async function auditDistSizes(errors) {
  const baseCss = resolve(distEs, 'base.css')
  const baseCssBytes = await sizeOf(baseCss)
  if (baseCssBytes > LIMITS.baseCssBytes) {
    errors.push(
      `Base CSS is ${formatBytes(baseCssBytes)}; limit is ${formatBytes(LIMITS.baseCssBytes)}`,
    )
  }

  const fullCss = resolve(distEs, 'components.css')
  const fullCssBytes = await sizeOf(fullCss)
  if (fullCssBytes > LIMITS.fullCssBytes) {
    errors.push(
      `Full CSS is ${formatBytes(fullCssBytes)}; limit is ${formatBytes(LIMITS.fullCssBytes)}`,
    )
  }

  const componentCssFiles = await collectFiles(distEs, filePath => filePath.endsWith('/style.css'))
  const componentCssSizes = toSortedEntries(await getSizedFiles(componentCssFiles))
  // Category entry barrels (base/pro/ai, added in 98e5d5327) aggregate every member
  // component's CSS by construction, so the per-component budget can never hold
  // them; each is a subset of the full bundle, so hold it to the full-bundle limit
  // instead. Member components stay under the per-component budget individually.
  const suiteAggregateCss = new Set(['ai', 'base', 'pro'].map(dir => resolve(distEs, dir, 'style.css')))
  const cssLimitFor = file => (suiteAggregateCss.has(file) ? LIMITS.fullCssBytes : LIMITS.componentCssBytes)
  const oversizedCss = componentCssSizes.filter(entry => entry.bytes > cssLimitFor(entry.file))
  for (const entry of oversizedCss) {
    errors.push(
      `Component CSS ${relativeToRepo(entry.file)} is ${formatBytes(entry.bytes)}; limit is ${formatBytes(cssLimitFor(entry.file))}`,
    )
  }

  // Printed, not gated: this is what installing the package costs, and `fullCssBytes`
  // already holds it. The suite barrels aggregate their members by construction, so
  // counting them would charge for the same rules twice.
  const memberCssSizes = componentCssSizes.filter(entry => !suiteAggregateCss.has(entry.file))
  const memberCssBytes = memberCssSizes.reduce((total, entry) => total + entry.bytes, 0)
  // Alias packages re-export another component and add no rules of their own, so
  // their stylesheet is empty and `style-deps.json` is what carries them to the
  // real one. The failure this guards against is an alias quietly going back to
  // holding a full copy of empty-state.
  const styleDepsFile = resolve(distEs, 'style-deps.json')
  let styleDeps = {}
  try {
    styleDeps = JSON.parse(await readFile(styleDepsFile, 'utf-8'))
  }
  catch {
    errors.push(`${relativeToRepo(styleDepsFile)} is missing; the on-demand style plugin has no dependency graph to walk`)
  }

  for (const distDir of [distEs, distLib]) {
    for (const componentName of emptyStateStyleAliases) {
      const styleFile = resolve(distDir, componentName, 'style.css')
      const bytes = await sizeOf(styleFile)
      if (bytes > LIMITS.emptyStateAliasCssBytes) {
        errors.push(
          `${relativeToRepo(styleFile)} is ${formatBytes(bytes)}; an alias carries no rules of its own`,
        )
      }
    }
  }

  for (const componentName of emptyStateStyleAliases) {
    if (!(styleDeps[componentName] ?? []).includes('empty-state')) {
      errors.push(
        `style-deps.json does not route ${componentName} to empty-state; the alias would render unstyled`,
      )
    }
  }

  const componentJsFiles = await collectFiles(distEs, filePath =>
    filePath.endsWith('.js')
    && !filePath.endsWith('/index.js')
    && !filePath.includes('/node_modules/')
    && !filePath.includes('/packages/tuffex/packages/utils/')
    && !filePath.includes('/packages/utils/'),
  )
  const componentJsSizes = toSortedEntries(await getSizedFiles(componentJsFiles))
  const oversizedJs = componentJsSizes.filter(entry => entry.bytes > componentJsLimitFor(entry.file))
  for (const entry of oversizedJs) {
    errors.push(
      `Component JS ${relativeToRepo(entry.file)} is ${formatBytes(entry.bytes)}; limit is ${formatBytes(componentJsLimitFor(entry.file))}`,
    )
  }

  // An override that outlives its reason is an exception nobody re-reads. Fail while deleting it is
  // still cheap: either the file came back under the shared limit, or it no longer exists at all.
  for (const [key, limit] of Object.entries(LIMITS.componentJsOverrides)) {
    const entry = componentJsSizes.find(candidate => toDistRelativePath(candidate.file) === key)
    if (!entry) {
      errors.push(`Component JS override ${key} matches no built file; remove it from componentJsOverrides`)
      continue
    }
    if (entry.bytes <= LIMITS.componentJsBytes) {
      errors.push(
        `Component JS override ${key} (${formatBytes(limit)}) is no longer needed: the file is `
        + `${formatBytes(entry.bytes)}, within the ${formatBytes(LIMITS.componentJsBytes)} shared limit. Remove it.`,
      )
    }
  }

  console.log(`[audit-package-size] Base CSS: ${formatBytes(baseCssBytes)}/${formatBytes(LIMITS.baseCssBytes)}`)
  console.log(`[audit-package-size] Full CSS: ${formatBytes(fullCssBytes)}/${formatBytes(LIMITS.fullCssBytes)} (full-import entry; nothing in this repo loads it)`)
  console.log(`[audit-package-size] Component CSS: ${formatBytes(memberCssBytes)} across ${memberCssSizes.length} stylesheets (what installing costs; no page loads them all)`)
  printTop('Largest component CSS files:', componentCssSizes)
  printTop('Largest component JS files:', componentJsSizes)
}

// -- Component stylesheets as rules -----------------------------------------------------------

/** Index just past the string literal that opens at `start`. */
function skipCssString(css, start) {
  const quote = css[start]
  let i = start + 1
  while (i < css.length && css[i] !== quote)
    i += css[i] === '\\' ? 2 : 1
  return Math.min(i + 1, css.length)
}

/** `css` without its comments. Strings are stepped over, so a quoted `/*` stays. */
function stripCssComments(css) {
  let out = ''
  let from = 0
  for (let i = 0; i < css.length;) {
    if (css[i] === '"' || css[i] === '\'') {
      i = skipCssString(css, i)
    }
    else if (css[i] === '/' && css[i + 1] === '*') {
      const close = css.indexOf('*/', i + 2)
      out += css.slice(from, i)
      i = close < 0 ? css.length : close + 2
      from = i
    }
    else {
      i += 1
    }
  }
  return out + css.slice(from)
}

/** Index just past the `}` closing the block whose `{` is at `open`. */
function skipCssBlock(css, open) {
  let depth = 0
  let paren = 0
  for (let i = open; i < css.length; i += 1) {
    const c = css[i]
    if (c === '"' || c === '\'')
      i = skipCssString(css, i) - 1
    else if (c === '(')
      paren += 1
    else if (c === ')')
      paren = Math.max(0, paren - 1)
    else if (paren === 0 && c === '{')
      depth += 1
    else if (paren === 0 && c === '}' && --depth === 0)
      return i + 1
  }
  return css.length
}

function atRuleName(prelude) {
  return /^@([-\w]+)/.exec(prelude)?.[1].toLowerCase() ?? null
}

// At-rules whose block holds rules rather than declarations. Their rules are compared together
// with the preludes around them, so `.a{}` inside `@media print` is not the top-level `.a{}`.
const GROUPING_AT_RULES = new Set(['container', 'document', 'layer', 'media', 'scope', 'starting-style', 'supports'])

/**
 * A stylesheet as its leaf rules, each with the grouping at-rules around it.
 *
 * Only as much of CSS as minified build output needs: strings and parentheses are stepped
 * over, so a `{`, `}` or `;` inside them is not structure, and grouping blocks are entered
 * rather than kept whole. Anything else -- a style rule, `@font-face`, `@keyframes`, a
 * statement -- is one leaf with its exact text.
 */
function splitCssRules(css, context = []) {
  const rules = []
  let i = 0
  while (i < css.length) {
    let boundary = -1
    let paren = 0
    for (let j = i; j < css.length; j += 1) {
      const c = css[j]
      if (c === '"' || c === '\'') {
        j = skipCssString(css, j) - 1
      }
      else if (c === '(') {
        paren += 1
      }
      else if (c === ')') {
        paren = Math.max(0, paren - 1)
      }
      else if (paren === 0 && (c === '{' || c === ';' || c === '}')) {
        boundary = j
        break
      }
    }
    if (boundary < 0) {
      const tail = css.slice(i).trim()
      if (tail)
        rules.push({ context, text: tail, atRule: atRuleName(tail) })
      break
    }

    const prelude = css.slice(i, boundary).trim()
    if (css[boundary] !== '{') {
      // A statement such as `@import`, or a stray `}`, which minified output does not have.
      if (css[boundary] === ';' && prelude)
        rules.push({ context, text: `${prelude};`, atRule: atRuleName(prelude) })
      i = boundary + 1
      continue
    }

    const end = skipCssBlock(css, boundary)
    const name = atRuleName(prelude)
    if (name !== null && GROUPING_AT_RULES.has(name))
      rules.push(...splitCssRules(css.slice(boundary + 1, end - 1), [...context, prelude]))
    else
      rules.push({ context, text: css.slice(i, end).trim(), atRule: name })
    i = end
  }
  return rules
}

// Emitted into each sheet that uses them, on purpose: a consumer that imports one component's
// stylesheet may never load `base.css`, so a shared definition would leave the animation
// undefined for it (`skeleton-keyframes` in style/mixins.scss says the same). `@charset` is a
// statement about the file, not a rule.
const PER_SHEET_AT_RULES = new Set(['charset', 'keyframes', '-webkit-keyframes'])

/**
 * Rules found, character for character and under the same at-rules, in more than one sheet.
 *
 * Each component stylesheet carries its own component's rules and reaches the rest through
 * `style-deps.json`, so a repeat means one sheet copied another's: a page loading both pays
 * twice, and the copy goes stale the next time the original changes. `sheets` is any iterable
 * of `[name, css]` pairs; the largest repeat comes first.
 */
function findDuplicateRules(sheets) {
  const seen = new Map()
  for (const [sheet, css] of sheets) {
    for (const rule of splitCssRules(stripCssComments(css))) {
      if (rule.atRule !== null && PER_SHEET_AT_RULES.has(rule.atRule))
        continue
      const key = `${rule.context.join('\u0001')}\u0000${rule.text}`
      const entry = seen.get(key) ?? { rule, sheets: new Set() }
      entry.sheets.add(sheet)
      seen.set(key, entry)
    }
  }
  return [...seen.values()]
    .filter(entry => entry.sheets.size > 1)
    .map(({ rule, sheets: found }) => ({
      ...rule,
      sheets: [...found].sort(),
      bytes: Buffer.byteLength(rule.text) * (found.size - 1),
    }))
    .sort((a, b) => b.bytes - a.bytes)
}

/**
 * The size of a page's style closure, and any member of it with no stylesheet behind it: a
 * budget naming a component that was renamed or removed, which would leave the page measured
 * short, or a `style-deps.json` entry pointing the plugin at a file it cannot import.
 */
function measurePageStyles(closure, sheetBytes) {
  return {
    bytes: closure.reduce((total, name) => total + (sheetBytes.get(name) ?? 0), 0),
    missing: closure.filter(name => !sheetBytes.has(name)),
  }
}

/** Every `dist/es/<component>/style.css` except the suite barrels, by component name. */
async function readComponentSheets() {
  const files = await collectFiles(distEs, filePath => filePath.endsWith('/style.css'))
  const suites = new Set(['ai', 'base', 'pro'])
  const entries = await Promise.all(files.map(async file => [toDistRelativePath(file).split('/')[0], await readFile(file)]))
  return new Map(entries.filter(([name]) => !suites.has(name)).sort(([a], [b]) => a.localeCompare(b)))
}

/** Component subpaths a source tree imports for their runtime, the imports the plugin follows. */
async function collectSubpathImports(sourceRoot) {
  const files = await collectFiles(sourceRoot, filePath => ['.ts', '.tsx', '.vue'].includes(extname(filePath)))
  const pattern = /import\s+(?!type\s)(?:[^'"]*?\s+from\s+)?['"]@talex-touch\/tuffex\/([a-z0-9-]+)['"]/g
  const names = new Set()
  for (const file of files) {
    for (const match of (await readFile(file, 'utf-8')).matchAll(pattern))
      names.add(match[1])
  }
  return [...names].sort()
}

async function auditPageStyles(errors, sheets) {
  let styleDeps
  try {
    styleDeps = JSON.parse(await readFile(resolve(distEs, 'style-deps.json'), 'utf-8'))
  }
  catch {
    // `auditDistSizes` has already reported the missing graph.
    return
  }
  // The shipped plugin's own walk, so a page is measured the way a consumer loads it.
  const { expandStyleClosure } = await import(pathToFileURL(resolve(root, 'dist/vite/index.js')).href)
  const sheetBytes = new Map([...sheets].map(([name, css]) => [name, css.length]))
  const describe = (closure, bytes) => {
    const gzip = gzipSync(Buffer.concat(closure.filter(name => sheets.has(name)).map(name => sheets.get(name)))).length
    return `${formatBytes(bytes)} in ${closure.length} sheets, gzip ${formatBytes(gzip)}`
  }

  for (const budget of pageStyleBudgets) {
    const closure = expandStyleClosure(budget.components, styleDeps)
    const { bytes, missing } = measurePageStyles(closure, sheetBytes)
    if (missing.length > 0)
      errors.push(`Page styles for ${budget.label} reach ${missing.join(', ')}, which has no dist/es/<name>/style.css`)
    if (bytes > budget.limit)
      errors.push(`Page styles for ${budget.label} are ${formatBytes(bytes)} across ${closure.length} sheets; limit is ${formatBytes(budget.limit)}`)
    console.log(`[audit-package-size] Page styles · ${budget.label}: ${describe(closure, bytes)}; limit ${formatBytes(budget.limit)} (+ base.css)`)
  }

  // Not a budget: CoreApp's imports move with CoreApp, not with this package, and its CI does
  // not run this script. Printed so a real app's number sits next to the budgets.
  const coreSubpaths = (await collectSubpathImports(coreRendererRoot)).filter(name => sheets.has(name))
  const coreClosure = expandStyleClosure(coreSubpaths, styleDeps)
  console.log(`[audit-package-size] Page styles · Core App renderer, ${coreSubpaths.length} subpaths (info): ${describe(coreClosure, measurePageStyles(coreClosure, sheetBytes).bytes)}`)
}

function auditDuplicateRules(errors, sheets) {
  const duplicates = findDuplicateRules([...sheets].map(([name, css]) => [name, css.toString('utf-8')]))
  // One line per set of sheets: a sheet that copied another whole repeats hundreds of rules.
  const groups = new Map()
  for (const duplicate of duplicates) {
    const key = duplicate.sheets.join(',')
    const group = groups.get(key) ?? { sheets: duplicate.sheets, rules: [], bytes: 0 }
    group.rules.push(duplicate)
    group.bytes += duplicate.bytes
    groups.set(key, group)
  }
  for (const group of [...groups.values()].sort((a, b) => b.bytes - a.bytes)) {
    const [first] = group.rules
    const sample = first.text.length > 120 ? `${first.text.slice(0, 120)}…` : first.text
    const where = first.context.length > 0 ? ` inside ${first.context.join(' ')}` : ''
    errors.push(
      `${group.sheets.map(name => `${name}/style.css`).join(', ')} repeat ${group.rules.length} identical rule(s), `
      + `${formatBytes(group.bytes)} repeated, e.g. \`${sample}\`${where}. A sheet carries only its own `
      + `component's rules and reaches the rest through style-deps.json.`,
    )
  }
  console.log(`[audit-package-size] Rules repeated across component stylesheets: ${duplicates.length} (@keyframes are per sheet by design)`)
}

const errors = []

if (process.argv.includes('--self-test')) {
  process.exit(selfTest() > 0 ? 1 : 0)
}

await auditDistSizes(errors)
const componentSheets = await readComponentSheets()
await auditPageStyles(errors, componentSheets)
auditDuplicateRules(errors, componentSheets)
await auditOnDemandImports(errors)
await auditRootImports(errors)
await auditFullStyleImports(errors)

if (errors.length > 0) {
  console.error('[audit-package-size] Size audit failed:')
  for (const error of errors) {
    console.error(`- ${error}`)
  }
  process.exit(1)
}

console.log('[audit-package-size] package size and Core App root import budgets are within limits')

/**
 * Proves the functions the on-demand budgets rest on still discriminate.
 *
 * `collectRuntimeSpecifiers` is a regex over emitted JS: if a change in output shape stops it
 * matching, every on-demand entry reports an empty import graph and the budget passes over
 * nothing. `resolveRuntimeSpecifier` decides what counts as an in-package runtime edge, so an
 * over-eager filter has the same effect. Neither failure is visible from a green run (#1589).
 * The stylesheet side has the same shape: `splitCssRules` and `findDuplicateRules` decide what
 * counts as a repeated rule, and `measurePageStyles` what a page budget is charged.
 */
function selfTest() {
  const inDist = file => `${distEs}/${file}`
  const cases = [
    {
      name: 'a default import is collected',
      run: () => collectRuntimeSpecifiers("import a from './a'"),
      expect: './a',
    },
    {
      name: 'a side-effect import is collected',
      run: () => collectRuntimeSpecifiers("import './a.css'"),
      expect: './a.css',
    },
    {
      name: 'a re-export is collected',
      run: () => collectRuntimeSpecifiers("export * from './b/index'"),
      expect: './b/index',
    },
    {
      name: 'a named re-export is collected',
      run: () => collectRuntimeSpecifiers("export { x } from './c'"),
      expect: './c',
    },
    {
      name: 'several specifiers are all collected',
      run: () => collectRuntimeSpecifiers("import a from './a'\nexport * from './b'\n"),
      expect: './a,./b',
    },
    {
      name: 'source with no imports collects nothing',
      run: () => collectRuntimeSpecifiers('const x = 1'),
      expect: '',
    },
    {
      name: 'a relative sibling resolves to an in-package edge',
      run: () => [resolveRuntimeSpecifier(inDist('button/index.js'), './style') ?? 'null'],
      expect: `${distEs}/button/style`,
    },
    {
      name: 'a bare specifier is not an in-package edge',
      run: () => [resolveRuntimeSpecifier(inDist('button/index.js'), 'vue') ?? 'null'],
      expect: 'null',
    },
    {
      name: 'a css specifier is not a runtime edge',
      run: () => [resolveRuntimeSpecifier(inDist('button/index.js'), './style.css') ?? 'null'],
      expect: 'null',
    },
    {
      name: 'an edge leaving dist/es is not followed',
      run: () => [resolveRuntimeSpecifier(inDist('button/index.js'), '../../../outside') ?? 'null'],
      expect: 'null',
    },
    {
      name: 'a node_modules edge is not followed',
      run: () => [resolveRuntimeSpecifier(inDist('button/index.js'), './node_modules/x') ?? 'null'],
      expect: 'null',
    },
    // The override map decides which files may exceed the shared budget. A matcher that hit
    // everything, or nothing, would both read as a green run.
    {
      name: 'a file with no override gets the shared component JS limit',
      run: () => [String(componentJsLimitFor(inDist('button/src/TxButton.vue.js')))],
      expect: String(LIMITS.componentJsBytes),
    },
    {
      name: 'an overridden file gets its own limit',
      run: () => [String(componentJsLimitFor(inDist('border-beam/src/styles.js')))],
      expect: String(LIMITS.componentJsOverrides['border-beam/src/styles.js']),
    },
    {
      // `endsWith('/' + key)` matched this too, so a different component nested one level down
      // silently inherited the 80 KiB budget. `x/not-border-beam/...` does NOT exercise it -- the
      // `-` breaks the suffix on its own, so that shape passes against the bug.
      name: 'a deeper path that ends the same way is not the overridden file',
      run: () => [String(componentJsLimitFor(inDist('x/border-beam/src/styles.js')))],
      expect: String(LIMITS.componentJsBytes),
    },
    {
      name: 'a same-named file in another component does not inherit the override',
      run: () => [String(componentJsLimitFor(inDist('liquid/src/styles.js')))],
      expect: String(LIMITS.componentJsBytes),
    },
    {
      name: 'the override key is matched as a whole dist-relative path',
      run: () => [toDistRelativePath(inDist('border-beam/src/styles.js'))],
      expect: 'border-beam/src/styles.js',
    },
    {
      name: 'every override raises its limit, so none is a silent no-op',
      run: () => [String(Object.values(LIMITS.componentJsOverrides).every(v => v > LIMITS.componentJsBytes))],
      expect: 'true',
    },
    // The duplicate check sees stylesheets only through `splitCssRules`: a splitter that
    // returned nothing, or one leaf per sheet, would report no repeats over any input.
    {
      name: 'top-level rules split apart',
      run: () => splitCssRules('.a{color:red}.b{color:blue}').map(rule => rule.text),
      expect: '.a{color:red},.b{color:blue}',
    },
    {
      name: 'a rule inside @media keeps the prelude as its context',
      run: () => splitCssRules('@media (min-width:1px){.a{color:red}}').map(rule => `${rule.context.join(' ')} ${rule.text}`),
      expect: '@media (min-width:1px) .a{color:red}',
    },
    {
      name: 'a brace or semicolon in a string or parentheses is not structure',
      run: () => splitCssRules('.a{content:"}{;"}.b:not(.c){background:url(x{y)}[title="{;}"]{color:red}@import url(a;b);').map(rule => rule.text),
      expect: '.a{content:"}{;"},.b:not(.c){background:url(x{y)},[title="{;}"]{color:red},@import url(a;b);',
    },
    {
      name: 'a comment goes and a quoted /* stays',
      run: () => splitCssRules(stripCssComments('/*! license */.a{content:"/*"}')).map(rule => rule.text),
      expect: '.a{content:"/*"}',
    },
    {
      name: 'a rule in two sheets is reported with both',
      run: () => findDuplicateRules([['a', '.x{color:red}'], ['b', '.y{color:red}.x{color:red}']]).map(rule => `${rule.sheets.join('+')} ${rule.text}`),
      expect: 'a+b .x{color:red}',
    },
    {
      name: 'the same rule under a different @media is not a repeat',
      run: () => findDuplicateRules([['a', '.x{color:red}'], ['b', '@media print{.x{color:red}}']]).map(rule => rule.text),
      expect: '',
    },
    {
      name: 'keyframes emitted per sheet are not reported',
      run: () => findDuplicateRules([['a', '@keyframes k{to{opacity:0}}'], ['b', '@keyframes k{to{opacity:0}}']]).map(rule => rule.text),
      expect: '',
    },
    {
      name: 'a rule twice in one sheet is not a cross-sheet repeat',
      run: () => findDuplicateRules([['a', '.x{color:red}.x{color:red}'], ['b', '.y{color:red}']]).map(rule => rule.text),
      expect: '',
    },
    {
      name: 'a page is the sum of the sheets in its closure',
      run: () => [String(measurePageStyles(['a', 'b'], new Map([['a', 10], ['b', 5], ['c', 99]])).bytes)],
      expect: '15',
    },
    {
      name: 'a closure member with no stylesheet is reported, not skipped',
      run: () => measurePageStyles(['a', 'gone'], new Map([['a', 10]])).missing,
      expect: 'gone',
    },
  ]

  let failures = 0
  for (const testCase of cases) {
    const actual = testCase.run().join(',')
    if (actual === testCase.expect) {
      console.log(`  \u001B[32m\u2713\u001B[0m ${testCase.name}`)
    }
    else {
      console.error(`  \u001B[31m\u2717\u001B[0m ${testCase.name}: expected ${JSON.stringify(testCase.expect)}, got ${JSON.stringify(actual)}`)
      failures += 1
    }
  }
  console.log(failures === 0
    ? '\naudit-package-size self-test passed.\n'
    : `\naudit-package-size self-test failed: ${failures} case(s).\n`)
  return failures
}
