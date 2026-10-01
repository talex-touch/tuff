# Implement — StreamElement family

Execution plan for `prd.md` / `design.md`. Work lands as five child tasks in dependency order; each child is planned, implemented, checked and archived on its own. This file is the ordered master checklist plus the shared procedures every child uses.

## 0. Child tasks and order

| # | Child (slug) | Delivers | Depends on |
|---|---|---|---|
| 1 | `stream-text-foundation` | R1–R6: presets + tokens, segmenter, pacer, `TxStreamCaret`, `TxStreamText`; its docs page, demos, gallery cell | — |
| 2 | `code-stream-live` | R7: `TxCodeStream` content-driven mode + `TxStreamCode` alias; code-stream docs + live demo | 1 |
| 3 | `stream-markdown-motion` | R9: `TxStreamMarkdown` presets + logo caret; live StreamMarkdown gallery cell; stream-markdown docs; HomePage verification | 1 |
| 4 | `stream-element-core` | R8, R11, R12 (element cell): `TxStreamElement`; its docs page with the hero answer case, demos, gallery cell | 1, 2 (3 recommended first so delegated blocks match) |
| 5 | `ai-answer-template` | R13: Templates page "AI answer" | 4 |

2 and 3 can run in parallel after 1. The parent owns cross-child acceptance (AC9–AC13) and the final integration review.

## 1. Per-child checklist

### 1. `stream-text-foundation`
- [x] Tokens `--tx-stream-reveal-1/2/3`, `--tx-stream-caret-start/end` in `style/variables.scss` (light, `.dark`, both high-contrast blocks).
- [x] `style/mixins.scss`: `stream-reveal-keyframes` (a/b pairs) + `stream-reveal($preset, $variant: text|code)`, animations declared only under `prefers-reduced-motion: no-preference`. *Landed as `stream-reveal-keyframes($variant)` + `stream-reveal-presets($word, $variant)`, no a/b pairs (replay remounts the words) — child `design.md`.*
- [x] `stream-text/src/types.ts`, `segment.ts`, `use-stream-pacer.ts`, `TxStreamCaret.vue`, `TxStreamText.vue`; `stream-text/index.ts` (exports `TxStreamText`, `StreamText`, `TxStreamCaret`, `segmentWords`, `useStreamPacer`, types, `*Instance`).
- [x] Register: `components.ts`, `ai/index.ts`; `instance-drift.contract.ts` entry for `TxStreamTextInstance`. *No drift entry: the instance type is `InstanceType<typeof TxStreamText>`, not hand-written, so there is nothing to drift; expose checked by a vue-tsc probe — child `design.md`.*
- [x] Tests: `stream-text/__tests__/{segment,pacer,caret,stream-text,stream-text-style}.test.ts` (AC1–AC5). *Caret cases live in `stream-text` + `stream-text-style`; no separate `caret.test.ts`.*
- [x] Docs: `stream-text.{zh,en}.mdc`; demos `StreamTextStreamTextDemo`, `StreamTextPresetsDemo`, `StreamTextSlotsDemo`; registry lines; TAXONOMY + SECTION_ORDER + both hub indexes; gallery `docs/gallery/GalleryStreamText.vue` + cell in the ai band.
- [x] Shared procedures §2–§4; browser check: presets, pause state, caret retract, reduced motion, dark + light. *Evidence: child `implement.md`.*

### 2. `code-stream-live`
- [x] Content-driven mode per design §4 (mode selection, units, 120 ms coalesced tail highlight, `createFreshChunks` wrapping, caret in this mode only, no height pre-reservation unless `reserve`).
- [x] `TxStreamCode` alias in `code-stream/index.ts`.
- [x] Tests: existing `code-stream*.test.ts` untouched and green; new `code-stream-live.test.ts` (AC6). *Plus `code-stream-style.test.ts` (one reduced-motion form for the whole component).*
- [x] Docs: `code-stream.{zh,en}.mdc` (content-driven mode, alias, caret); demo `CodeStreamLiveDemo` + registry.
- [x] Shared procedures §2–§4. *Evidence: child `implement.md`.*

### 3. `stream-markdown-motion`
- [x] Replace fresh-chunk and block keyframes with the shared preset classes; optional `reveal` prop; remove the `::after` orb; mount one `TxStreamCaret` positioned from a `Range` over the last text-bearing node in the existing post-flush watcher (block-cursor position for fences).
- [x] Tests: all existing stream-markdown tests green; new style-contract + caret-position tests (AC8 part 1).
- [x] Gallery: `docs/gallery/GalleryStreamMarkdown.vue` (live, replays on reset) replacing the static cell at `DocsComponentsGallery.vue:3914-3920`.
- [x] Docs: `stream-markdown.{zh,en}.mdc` (motion, caret, `reveal`); wrappers found by import path per `tuffex-docs-sync.md` blast-radius step (e.g. template demos embedding it need no prose change unless they describe the orb).
- [x] HomePage verification (§5) — AC8 part 2. *Scripted stream via `conversation.restore`; dark, light, reduced motion — child `implement.md`.*
- [x] Shared procedures §2–§4. *Caret positioned with `translate`, not `transform` (see child `design.md`).*

### 4. `stream-element-core`
- [ ] `stream-element/src/{types.ts, parse.ts, slice.ts, TxStreamElement.vue}`, `index.ts`; register in `components.ts`, `ai/index.ts`, drift contract.
- [ ] Parser (design §5.2) incl. delegation grouping and citation resolution; one clock + prefix slicing (§5.3); slots and footer (§5.1, D9); `reserve` + `replay()`.
- [ ] Tests: `stream-element/__tests__/{parse,slice,stream-element,stream-element-slots}.test.ts` (AC7).
- [ ] Docs: `stream-element.{zh,en}.mdc` opening with `StreamElementAnswerDemo` (R11: presets + speed + replay; `TxMessageActions` with thumbs via slot; `TxSources variant="stack"`; `TxSuggestionChips layout="list"`; all shown on `done`); `StreamElementMarkdownDemo`, `StreamElementSlotsDemo`; registry; TAXONOMY/SECTION_ORDER/hubs; gallery `GalleryStreamElement.vue` + cell.
- [ ] Shared procedures §2–§4; browser checks AC10, AC11 (budget measurement), AC12.

### 5. `ai-answer-template`
- [ ] `template-ai-answer.{zh,en}.mdc` + `TemplateAiAnswerDemo.vue` per `nexus-docs-templates.md` §2 registration chain and §3 page contract; multi-turn Q&A in `TxConversationStream` (`item-key` globally unique ids, `component-guidelines.md` "Virtual List Keys"), each assistant turn a `TxStreamElement`, streaming starts on `@enter`.
- [ ] Verification per `nexus-docs-templates.md` §8; browser check dark + light.

## 2. Validation commands (run from the repo root unless noted)

```bash
# tuffex tests (affected dirs)
( cd packages/tuffex && node "$(ls -d ../../node_modules/.pnpm/vitest@3.2.7_*/node_modules/vitest | head -1)/vitest.mjs" run <dirs or files> )
# tuffex typecheck — plant a probe error first to prove coverage, then remove it
( cd packages/tuffex && node ../../node_modules/.pnpm/vue-tsc@3.3.7_typescript@5.9.3/node_modules/vue-tsc/bin/vue-tsc.js --noEmit -p tsconfig.json )
# ESLint per workspace, never --fix (the autofix merges value imports into `import type`);
# from the repo root the root config parses .vue as plain JS and every SFC fails to parse
( cd packages/tuffex && npx eslint --format json <changed files> )
( cd apps/nexus && npx eslint --format json <changed files> )
# nexus gates + docs suite
( cd apps/nexus && node build/check-mdc-fences.mjs && node build/check-doc-translation-parity.mjs && node build/check-demo-registry-orphans.mjs )
( cd apps/nexus && node "$(ls -d ../../node_modules/.pnpm/vitest@3.2.7_*/node_modules/vitest | head -1)/vitest.mjs" run test/docs app/pages/docs/docs-page-performance.test.ts app/layouts/docs.performance.test.ts )
# nexus typecheck that leaves .nuxt alone; filter to changed files (nuxt.config.ts `pwa` error predates this work)
( cd apps/nexus && node ../../node_modules/.pnpm/vue-tsc@3.3.7_typescript@5.9.3/node_modules/vue-tsc/bin/vue-tsc.js --noEmit -p tsconfig.json ) | grep -E '<changed files>'
```

```bash
# tuffex publish chain, on a fresh dist (CI runs it on every master push touching packages/tuffex)
( cd packages/tuffex && for s in audit-package-exports audit-package-types audit-readme-inventory audit-package-size; do node ./scripts/$s.mjs || echo "FAILED $s"; done )
# core-app compiles tuffex source under noUnusedLocals. Run only the vue-tsc half of `typecheck:web`:
# the script's first half rebuilds tuffex dist without the lock, and Nexus 503s while it runs.
( cd apps/core-app && node ../../node_modules/.pnpm/vue-tsc@3.3.7_typescript@5.9.3/node_modules/vue-tsc/bin/vue-tsc.js --noEmit -p tsconfig.web.json --composite false )
```

A **new component** (children 1 and 4) also owes these, per `bui-component-family.md` › Registration chain:
- the README pair: count line plus category line, gated by `audit-readme-inventory`;
- an `audit-package-size` re-baseline note, if its sheet pushes the full bundle over. Check first that the sheet carries only its own root class.

Child 1 missed both until the family's own check; they are listed here so child 4 does not.

Never run `pnpm typecheck`, `nuxt typecheck`, `nuxt prepare`, `pnpm install` or any `pnpm <script>` in `apps/nexus` while :3200 is up.

## 3. Rebuilding tuffex dist (Nexus reads dist)

```bash
pgrep -fl "gulp -f packages/script/build" && exit 1       # someone else is building
mkdir /tmp/tuffex-build.lock || exit 1                     # shared lock
BK=/tmp/tuffex-dist-backup-$(date +%H%M%S) && cp -R packages/tuffex/dist "$BK"
( cd packages/tuffex && PATH="$HOME/.local/share/mise/shims:$PATH" \
  npm_config_verify_deps_before_run=false pnpm_config_verify_deps_before_run=false \
  node ./node_modules/gulp/bin/gulp.js -f packages/script/build/index.ts ) || { rm -rf packages/tuffex/dist && cp -R "$BK" packages/tuffex/dist; }
rmdir /tmp/tuffex-build.lock
ls packages/tuffex/dist/es | wc -l                          # ~177+; then grep the new exports in dist/es/<dir>/index.js
```

Other agents edit tuffex concurrently: a build publishes the whole working tree. Before building, check `git status packages/tuffex` for half-finished foreign changes; if a build fails on someone else's file, restore the backup and report instead of fixing their code.

## 4. Restarting the Nexus dev server (supervised)

`pnpm run nexus:dev` runs `scripts/nexus-dev-supervisor.mjs`, which respawns `nuxt dev` when it exits and reclaims :3200. Never start a second server. After a dist rebuild: find the `nuxt.mjs dev --port 3200` PID (`ps -Ao pid,ppid,command | grep 'nuxt.mjs dev'`), `kill -TERM` it, and poll until `lsof -nP -iTCP:3200 -sTCP:LISTEN -t` shows a new PID and `/favicon.ico` answers 200 (~25 s observed). Then compare a changed component's `data-v-*` with `dist/es/<dir>/style.css` before judging a page.

## 5. HomePage verification (child 3)

- Isolated core-app dev instance per memory `tuff-dev-cdp-verification-gotchas` (wrapper start, own `TUFF_DEV_SERVER_PORT`, `REMOTE_DEBUGGING_PORT`, isolated `TUFF_STARTUP_BENCHMARK_USER_DATA_DIR`, background-throttling flags, onboarding gate via `storage:app:save`, theme via `theme-style.ini`).
- Risk: an isolated profile has no AI provider, so HomePage cannot stream a real reply. First choice: drive a scripted stream through the renderer (feed a growing reply into the conversation state over CDP). If that is not reachable, ask the user whether to copy only the provider config into the isolated profile. Never touch the user's own running instance or clipboard.
- Check: streaming reveal (preset `aurora`), caret during a pause, caret retract at the end, dark + light, reduced motion.

## 6. Risky files and rollback points

- `apps/nexus/app/components/DocsSidebar.vue` and `DocsComponentsGallery.vue` are being edited by other agents: use exact `Edit` replacements only, re-read before each edit, never rewrite the file.
- `packages/tuffex/packages/components/style/{variables,mixins}.scss` are shared by every component: additive changes only; run the style guard tests (`bui-*`, `dark-fill-tints`, `unscoped-deep-selectors`) after touching them.
- `stream-markdown/src/TxStreamMarkdown.vue` affects production chat: its child (3) is the only one that changes HomePage's look and can be reverted alone.
- Rollback: each child is one commit series; revert the series, rebuild dist (§3), restart (§4).

## 6b. Release (the user's decision, pending)

The `stream-text` addition (and `stream-element` in child 4) makes `component-lifecycle-gate.test.ts` red until tuffex gets a new version. That means:
- `package.json` version;
- CHANGELOG `[Unreleased]` becomes a version chapter;
- `components-lifecycle.json`: `currentVersion`, `totalComponents`, a `versions` entry with `newComponents` and `updatedComponents` (code-stream and stream-markdown for children 2–3), and a `components` entry per new slug with `since` equal to that version;
- both Nexus `changelog.{zh,en}.mdc` pages;
- each new doc's `since`.

0.6.2 is already on npm, so the next is 0.6.3 unless the user picks otherwise. The docs say 0.6.3 now. Ask; never bump silently. A master push publishes.

## 6a. Spec update (Phase 3.3) — deferred to the family's finish

Rules learned in the children, to fold into `.trellis/spec/frontend/` once the family lands (one update, not one per child):
- Rendering an `href` from content: allow only `http(s)`, `mailto`, `tel` and relative / query / hash URLs. A scheme-relative `//host` or `/\host` is not relative, because it takes the page's scheme, and core-app pages are `file:`. Strip tabs and newlines before testing (child 1, `TxStreamText` `safeHref`).
- ESLint runs per workspace; from the repo root every SFC fails to parse (§2).
- Streaming state: the pause clock starts when the source starts, not at mount (child 1 pacer).

## 7. Before `task.py start` on each child

- [ ] Child `prd.md` names its requirements and acceptance subset and its dependencies.
- [ ] Parent `implement.jsonl` / `check.jsonl` hold the spec and research context (see the files).
- [ ] The user has reviewed the parent `prd.md`, `design.md` and this file.
