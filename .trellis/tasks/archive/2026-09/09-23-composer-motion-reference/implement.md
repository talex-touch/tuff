# Implement — Composer 动效：托盘换位 / 墨色悬停 / 芯片模糊变身

Order is by dependency: C (the chip needs it) → B → A → D → build/audits → E → cross-package checks → visual verification. Each `▣` is a rollback point: the tree is consistent there if later steps are abandoned.

Shared-tree rules for the whole run:
- Stage only this task's files.
- No commit unless 老板 asks.
- Before building tuffex dist, acquire `mkdir /tmp/tuffex-build.lock` and `rmdir` it after (the lock talex-touch-87 uses).
- Before touching `DocsSidebar.vue` or `DocsComponentsGallery.vue`, message talex-touch-87 and the pro-gallery session (`09-23-nexus-pro-gallery-polish`, whose R0 may rewrap every cell). Edit only after they say where they are.
- Do not run `nuxt typecheck` / `pnpm -C apps/nexus typecheck` / core-app `typecheck:web` while the shared :3200 dev server is up (`tuffex-docs-sync.md` › Gates). Use the direct entries below; the full wrappers run once, at the end, with the server owner's agreement.

## 0. Pre-flight

- [ ] `trellis-before-dev` for tuffex + nexus. Read `tuffex-design-rules.md`, `tuffex-text-motion.md`, `tuffex-docs-sync.md`, and `bui-component-family.md` › Registration chain & Traps.
- [ ] `pnpm -C packages/tuffex audit:vocab`: confirm `StatusTone` is the tone union to reuse.

## 1. C — TxTextTransformer reduced motion

- [ ] Add `@media (prefers-reduced-motion: reduce) { .tx-text-transformer__layer { transition: none; } }`.
- [ ] Test in `text-transformer/__tests__/text-transformer.test.ts`: the SFC style carries the rule.
- [ ] `text-transformer.{zh,en}.mdc` Review Notes: one line each.
- Validate: `pnpm -C packages/tuffex exec vitest run packages/components/src/text-transformer`. ▣

## 2. B — TxModeChip (new)

- [ ] `mode-chip/index.ts`, `src/TxModeChip.vue`, `src/types.ts`: API and DOM per design §B.
  - Colour transitions exist only under `.is-morphing`.
  - Icon box has a fixed size.
  - Label goes through `TxTextTransformer mode="fade"`.
  - `displayLabel` leads by 50ms.
  - Width FLIP via WAAPI; matchMedia + no-`animate` guards.
- [ ] Measure ink-on-fill contrast for every tone in light, dark and both high-contrast blocks; record the numbers in the SFC comment. Any tone < 4.5:1 → `-dark-2` ink where defined; otherwise stop and report.
- [ ] Register:
  - `components.ts` (full-path ASCII order);
  - `ai/index.ts` barrel;
  - `README.md` + `README_ZHCN.md` count and category lines.
- [ ] Tests `mode-chip/__tests__/`:
  - native button, tone classes, attr fallthrough (`aria-pressed`);
  - icon keyed swap;
  - label delay (fake timers);
  - `.is-morphing` lifecycle;
  - reduced-motion path (no delay, no `animate`);
  - compiled-style contract: no `color`/`background-color` in any transition outside `.is-morphing`, reduced-motion media rule present.
- Validate: `pnpm -C packages/tuffex exec vitest run packages/components/src/mode-chip packages/components/src/__tests__/suite-barrels.test.ts packages/components/src/__tests__/shadow-light-source.test.ts`. ▣

## 3. A — TxChatComposer

- [ ] Stable shell/card DOM with every existing internal class kept; `footer` slot stays inside the card.
- [ ] Restyle per design §A:
  - shell radius var and `.has-tray` fill;
  - card inset ring + `--tx-elevation-1` + `:focus-within`;
  - textarea `font: inherit`, borderless, `field-sizing: content` bounded by min/max rows;
  - icon-only `+` and round send button with aria-labels from the existing text props;
  - ink-only immediate hover;
  - drag-over ring + wash.
- [ ] `types.ts`: `trayPlacement?: 'top' | 'bottom'`, `trayLabel?: string`; default `'bottom'`.
- [ ] Choreography per design §A:
  - `watch([trayPlacement, hasTray])` with pre-flush FIRST reads;
  - leave `Transition` pinned absolute;
  - enter with no transition;
  - WAAPI card slide 450ms / 70ms delay / `cubic-bezier(0.65, 0.16, 0.1, 0.88)`;
  - shell height animation with `.is-resizing`;
  - focus handoff to the textarea;
  - reduced-motion / no-`animate` / SSR guards.
  - Timing constants named and commented with a pointer to `research/reference-motion.md`.
- [ ] Tests:
  - the existing 11 in `chat-composer*.test.ts` stay green (adjust only assertions that encoded the old DOM, and say which);
  - new: tray side rendering, `has-tray`, placement flip leaves the old tray and enters the new;
  - `animate` stub called with the fitted timing and the correct Δ;
  - reduced motion skips it;
  - focus handoff;
  - `renderToString` SSR smoke.
- Validate: `pnpm -C packages/tuffex exec vitest run packages/components/src/chat`. ▣

## 4. D — intelligence-uikit

- [ ] `src/style/index.scss`:
  - drop the `.tx-ai-composer` root-surface and textarea-border overrides;
  - keep the `is-submitting` glow on the root;
  - prune spacing overrides that no longer apply.
- [ ] Playground check: `pnpm -C packages/intelligence-uikit dev` (:3405), light and dark.
- Validate: `pnpm -C packages/intelligence-uikit exec vitest run` and `pnpm -C packages/intelligence-uikit exec vue-tsc --noEmit -p tsconfig.json`. ▣

## 5. Build and publish audits

- [ ] Take the lock, then `pnpm -C packages/tuffex build`, then release the lock.
- [ ] `pnpm -C packages/tuffex audit:exports && pnpm -C packages/tuffex audit:readme && pnpm -C packages/tuffex audit:types && pnpm -C packages/tuffex audit:size && pnpm -C packages/tuffex audit:cursor`.
  - If `audit:size` trips on the new sheet, first confirm the sheet carries only its own root class, then re-baseline `LIMITS` in `scripts/audit-package-size.mjs` to actuals plus minimal headroom with a dated note.

## 6. E — Nexus docs and registration

- [ ] Coordinate first (see the shared-tree rules at the top).
- [ ] `chat-composer.{zh,en}.mdc`: two demo sections next to 基础用法, Props/Slots rows placed by meaning, Interaction Contract, Best Practices, Review Notes (reference, numbers, rejected options, root→shell retarget note).
- [ ] New demos:
  - `ChatComposerTrayDemo.vue` (bottom "Connect apps" ↔ top "Select a project" toggle);
  - `ChatComposerModeChipDemo.vue`;
  - `ModeChipBasicDemo.vue`;
  - each with `useI18n` copy, timers cleared on unmount.
- [ ] `mode-chip.{zh,en}.mdc` (8-field frontmatter, `since`, zh/en equal sections, `## API`, `Best Practices` / `最佳实践`, hub links).
- [ ] `demo-registry.ts` (alphabetical); hubs `index.{zh,en}.mdc` and `ai-suite.{zh,en}.mdc`; `DocsSidebar.vue`; gallery AI band (ModeChip cell, ChatComposer cell showing tray + chip).
- [ ] Wrapper and mention sweep: `chat`, `prompt-bar`, `ai-suite` docs, `AiSuiteChatShowcaseDemo.vue`. Fix any claim the restyle falsified.
- Validate:
  - `node apps/nexus/build/check-demo-registry-orphans.mjs`;
  - `node apps/nexus/build/check-mdc-fences.mjs`;
  - `node apps/nexus/build/check-doc-translation-parity.mjs`;
  - nexus vitest via the real entry (`node node_modules/.pnpm/vitest@*/node_modules/vitest/vitest.mjs run` inside `apps/nexus`).
  - Pages render: fetch both locales and assert the new section titles appear, re-polling for the .mdc lag. ▣

## 7. Cross-package checks

- [ ] eslint per package: `pnpm -C packages/tuffex exec eslint <changed>`, `pnpm -C packages/intelligence-uikit exec eslint <changed>`, `pnpm -C apps/nexus exec eslint <changed>`.
- [ ] `pnpm -C packages/tuffex typecheck`.
- [ ] core-app renderer compile of tuffex source under `noUnusedLocals`: run the direct `vue-tsc --noEmit -p tsconfig.web.json --composite false` entry in `apps/core-app`, not `npm run typecheck:web`, which rebuilds dist.
- [ ] Full wrappers (`pnpm -C apps/nexus typecheck`, core-app `typecheck:all`): once, with the dev-server owner's agreement; grep the output for `error TS`.
- [ ] `git diff --check`; `git diff --cached --numstat` shows no `-` rows.

## 8. Visual and motion verification (ego TaskSpace 7)

- [ ] Light and dark:
  - ChatComposer docs demos, the ModeChip page, gallery cells;
  - the intelligence-uikit playground, plus the Nexus dashboard workspace if reachable.
- [ ] Tray swap: sample the card's rect each rAF in-page during a flip, then compare against the reference samples (duration and curve within ±15%, no overshoot). Confirm the incoming tray is uncovered rather than faded, and the shell height is constant for equal trays.
- [ ] Chip morph: sample chip width and the transformer layers' opacity/filter per rAF. Check the icon leads the label, the ~370ms total within ±15%, and no colour transition on plain hover (computed `transition-property` outside `.is-morphing`).
- [ ] Reduced motion via `Emulation.setEmulatedMedia({ features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })`: final state lands immediately, no layout jump.
- [ ] No new console errors on the pages touched.
- [ ] `task.finish({ keep: [] })` once, at the very end.

## 9. Finish

- [ ] Spec update (Trellis 3.3):
  - `tuffex-design-rules.md` › Motion: the "colour transitions only while a state morphs" pattern (`.is-morphing`) as the sanctioned way to animate a state colour change without animating hover;
  - `tuffex-text-motion.md` › What each component uses: add `TxModeChip`.
- [ ] Report to 老板 with evidence (test counts, gate output, frame traces). Commit only on request.
