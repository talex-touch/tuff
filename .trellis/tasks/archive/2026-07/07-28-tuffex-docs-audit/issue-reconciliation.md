# GitHub Issue 对账表（审计快照 vs 实际落盘）

> 生成于 2026-07-28，**纯只读产物**：不改任何 `.mdc`/`.vue`/`.ts`，不触碰 GitHub。
> 供用户决定这批 issue 的去留——关 issue 是对外动作，等用户定夺。
>
> **数量口径**：`created-issues.tsv` 实录 **112** 个 issue，编号 `#363–#474` 连续无缺。
> 任务简报与 `p0-progress.md` 里的「113」是审计早期约数，以 tsv 的 112 为准。
>
> **快照性质**：批次/任务状态随工作推进变动，本表为生成时刻的切片。「进」「未」两列只会随批次收尾**变少不变多**——可视作「仍需处理」的上界。

## 这份表是怎么算出来的

四个数据源，逐列可靠度不同，**已按可靠度分级、不确定处标「未知」而非脑补**：

| 列 | 数据源 | 可靠度 |
|---|---|---|
| 原 finding 数 | `findings.json`（421 条，按 `component` 聚合）| **精确** |
| 判定不成立（驳）| `findings.json` 的 `refutedReason`（30 条，实修 agent 写的驳回理由）| **精确**（另有非正式驳回散在台账，见「已知不确定性」3）|
| 组件文件是否改动 | `git diff HEAD` + 未跟踪文件，映射到 `src/<组件>/`、`<组件>.{zh,en}.mdc`、demo 前缀 | **精确**（demo 走最长前缀匹配，极少数可能误归属）|
| 已修 / 进行中 / 未知 | 每条 finding 映射到所属批次，再取批次状态 | **推导**——见「已知不确定性」1 |

**批次状态**（据 Trellis 任务表 #28–#52 + `p0-progress.md` 台账，截至 2026-07-28）：

- **已完成** → 记「已修」：P0 全部 high（59 条，台账逐条 ✅ DONE）、m1、m2、m3、m4a、m4b、m5、m6a、m6b1、m7、m8、L1、L2（含 #51）、L4（含尾项 #52）
- **进行中/阻塞** → 记「进」（仍未处理）：**L3** 文档截断 #47、**m4c** a11y role/焦点 #49、**m6b** 类型阻塞 #50
- **无状态** → 记「未」（未知）：**L5-misc-tail**（32 条杂项低优，任务表无对应条目）+ 未进任何批次的低优尾项

## 已知不确定性（读表前必看）

1. **「已修」是按批次状态推导，不是逐 issue 复跑测试。** 组件文件的改动可能只服务其中一条 finding，不代表同 issue 每条都处理了。**同一 issue 内「已修 + 进 + 未」并存是常态。**
2. **`sortable-list` #450 是唯一「已修 vs 判定不成立」冲突**：其 high/logic-bug 带 `refutedReason`（复核认为 disabled 竞态不可达），但台账明确记录 agent 已防御性补了 disabled guard。本表按 `refutedReason` 计入「驳」列并在备注标注台账记为已修——**两说都为真，取舍留用户**。
3. **正式驳回 30 条之外仍有非正式驳回**，散在台账/报告、未进 `refutedReason`：`chat-composer` dead-code（建议是净新增 API）、`cascader` i18n-hardcoded（跨组件设计取舍非 bug）、`flex` unlinked-demo（静态围栏是既定标准，与兄弟组件 stack 结构一致）、P0 阶段 4 条低/信息级问题的「接受不改」裁决。这些在本表落在「未」而非「驳」，**因未被正式记为 WONTFIX**——关这些 issue 前值得回台账确认理由。
4. **4 个组件有 finding 但没建 issue**（不在这 112 内）：`flex`(2)、`offline-state`(2)、`text-transformer`(2)、`tuff-logo-stroke`(1)，全 low。列在表末。
5. finding→批次靠 `(component, summary[:80])` 匹配；已验证 m4/m6 母批与子批集合完全相等，匹配可靠。

## 列说明

原=原始 finding 数；修=已修；驳=判定不成立；进=进行中批次里仍未处理；未=状态未知（L5/未分批低优）。改动：src=组件源码 · doc=zh+en 文档 · demo=演示文件 · —=该组件零改动。

| issue | 组件 | 原 | 修 | 驳 | 进 | 未 | 改动 | 判定 | 备注 |
|---|---|--:|--:|--:|--:|--:|---|---|---|
| #363 | `agents` | 3 | 2 | 0 | 1 | 0 | src+doc | 进行中 | m4c (进行中 #49) |
| #364 | `ai-elements` | 2 | 1 | 1 | 0 | 0 | src | 已处理 |  |
| #365 | `alert` | 3 | 2 | 0 | 0 | 1 | src+doc | 低优尾项待定 |  |
| #366 | `auto-sizer` | 4 | 3 | 0 | 1 | 0 | src+doc+demo | 进行中 | L3 (进行中 #47) |
| #367 | `avatar` | 5 | 4 | 0 | 0 | 1 | src+demo | 低优尾项待定 |  |
| #368 | `avatar-variants` | 5 | 3 | 0 | 1 | 1 | doc | 进行中 | L3 (进行中 #47) |
| #369 | `badge` | 1 | 1 | 0 | 0 | 0 | src | 已修复 |  |
| #370 | `base-anchor` | 7 | 5 | 0 | 2 | 0 | src+doc | 进行中 | L3 (进行中 #47) / m4c (进行中 #49) |
| #371 | `base-surface` | 6 | 4 | 0 | 2 | 0 | src+doc | 进行中 | m6b (阻塞 #50) |
| #372 | `blank-slate` | 2 | 1 | 0 | 1 | 0 | src+doc | 进行中 | L3 (进行中 #47) |
| #373 | `breadcrumb` | 2 | 2 | 0 | 0 | 0 | src | 已修复 |  |
| #374 | `button` | 5 | 3 | 0 | 1 | 1 | src+doc | 进行中 | m6b (阻塞 #50) |
| #375 | `card` | 7 | 5 | 0 | 1 | 1 | src+doc | 进行中 | L3 (进行中 #47) |
| #376 | `card-item` | 4 | 4 | 0 | 0 | 0 | src+doc | 已修复 |  |
| #377 | `cascader` | 4 | 1 | 2 | 0 | 1 | src+doc+demo | 低优尾项待定 | L5 (未派工) |
| #378 | `chat` | 2 | 2 | 0 | 0 | 0 | src | 已修复 |  |
| #379 | `chat-composer` | 3 | 2 | 0 | 0 | 1 | — | 低优尾项待定 | L5 (未派工) |
| #380 | `checkbox` | 1 | 1 | 0 | 0 | 0 | doc | 已修复 |  |
| #381 | `code-editor` | 2 | 2 | 0 | 0 | 0 | src+doc | 已修复 |  |
| #382 | `collapse` | 3 | 3 | 0 | 0 | 0 | src | 已修复 |  |
| #383 | `command-palette` | 6 | 5 | 0 | 1 | 0 | src+doc | 进行中 | m4c (进行中 #49) |
| #384 | `container` | 5 | 4 | 0 | 1 | 0 | src+doc | 进行中 | L3 (进行中 #47) |
| #385 | `context-menu` | 8 | 7 | 0 | 1 | 0 | src+doc | 进行中 | L3 (进行中 #47) |
| #386 | `copy-button` | 2 | 1 | 1 | 0 | 0 | src | 已处理 |  |
| #387 | `corner-overlay` | 1 | 0 | 0 | 1 | 0 | src+doc | 进行中 | m4c (进行中 #49) |
| #388 | `data-table` | 5 | 5 | 0 | 0 | 0 | src+doc | 已修复 |  |
| #389 | `date-picker` | 4 | 3 | 1 | 0 | 0 | src+doc | 已处理 |  |
| #390 | `dialog` | 5 | 4 | 1 | 0 | 0 | src | 已处理 |  |
| #391 | `divider` | 1 | 1 | 0 | 0 | 0 | src | 已修复 |  |
| #392 | `drawer` | 4 | 2 | 0 | 1 | 1 | src+doc | 进行中 | m6b (阻塞 #50) |
| #393 | `dropdown-menu` | 7 | 7 | 0 | 0 | 0 | src+doc | 已修复 |  |
| #394 | `empty-state` | 1 | 0 | 1 | 0 | 0 | doc | 全不成立 |  |
| #395 | `error-state` | 2 | 2 | 0 | 0 | 0 | src+doc | 已修复 |  |
| #396 | `file-uploader` | 2 | 2 | 0 | 0 | 0 | src | 已修复 |  |
| #397 | `flat-button` | 3 | 2 | 0 | 1 | 0 | src+doc+demo | 进行中 | m4c (进行中 #49) |
| #398 | `flat-dropdown` | 3 | 2 | 0 | 1 | 0 | src+doc+demo | 进行中 | m4c (进行中 #49) |
| #399 | `flat-input` | 3 | 2 | 1 | 0 | 0 | src+doc | 已处理 |  |
| #400 | `flat-radio` | 4 | 4 | 0 | 0 | 0 | src+demo | 已修复 |  |
| #401 | `flat-select` | 6 | 6 | 0 | 0 | 0 | src+doc+demo | 已修复 |  |
| #402 | `flip-overlay` | 5 | 3 | 0 | 2 | 0 | src+doc | 进行中 | L3 (进行中 #47) / m4c (进行中 #49) |
| #403 | `floating` | 3 | 1 | 0 | 1 | 1 | doc | 进行中 | L5 (未派工) / m6b (阻塞 #50) |
| #404 | `form` | 4 | 3 | 0 | 1 | 0 | src+doc | 进行中 | m4c (进行中 #49) |
| #405 | `foundations` | 1 | 1 | 0 | 0 | 0 | doc | 已修复 |  |
| #406 | `fusion` | 4 | 1 | 1 | 1 | 1 | src+doc | 进行中 | L3 (进行中 #47) / L5 (未派工) |
| #407 | `glass-surface` | 3 | 2 | 0 | 1 | 0 | doc | 进行中 | L3 (进行中 #47) |
| #408 | `glow-text` | 3 | 0 | 1 | 0 | 2 | doc | 低优尾项待定 |  |
| #409 | `gradient-border` | 2 | 0 | 0 | 1 | 1 | src+doc | 进行中 | m4c (进行中 #49) |
| #410 | `gradual-blur` | 7 | 7 | 0 | 0 | 0 | src+doc+demo | 已修复 |  |
| #411 | `grid` | 5 | 4 | 0 | 1 | 0 | src+doc | 进行中 | L3 (进行中 #47) |
| #412 | `grid-layout` | 1 | 1 | 0 | 0 | 0 | src | 已修复 |  |
| #413 | `group-block` | 6 | 3 | 0 | 3 | 0 | src+doc | 进行中 | L3 (进行中 #47) / m6b (阻塞 #50) |
| #414 | `guide-state` | 1 | 0 | 1 | 0 | 0 | src | 全不成立 |  |
| #415 | `icon` | 5 | 3 | 1 | 1 | 0 | src+doc | 进行中 | m4c (进行中 #49) |
| #416 | `icon-button` | 4 | 2 | 1 | 1 | 0 | src+doc | 进行中 | m6b (阻塞 #50) |
| #417 | `image-gallery` | 3 | 2 | 0 | 0 | 1 | src | 低优尾项待定 |  |
| #418 | `image-uploader` | 2 | 2 | 0 | 0 | 0 | src+doc | 已修复 |  |
| #419 | `index` | 3 | 2 | 0 | 1 | 0 | doc | 进行中 | L3 (进行中 #47) |
| #420 | `input` | 3 | 2 | 0 | 1 | 0 | src+doc | 进行中 | m4c (进行中 #49) |
| #421 | `kbd` | 2 | 1 | 1 | 0 | 0 | src+doc | 已处理 |  |
| #422 | `keyframe-stroke-text` | 2 | 2 | 0 | 0 | 0 | src+doc | 已修复 |  |
| #423 | `layout-skeleton` | 4 | 1 | 0 | 2 | 1 | src+doc | 进行中 | L3 (进行中 #47) / m4c (进行中 #49) |
| #424 | `loading-overlay` | 4 | 3 | 1 | 0 | 0 | src+doc | 已处理 |  |
| #425 | `loading-state` | 3 | 3 | 0 | 0 | 0 | src+doc | 已修复 |  |
| #426 | `markdown-editor` | 3 | 2 | 0 | 1 | 0 | src | 进行中 | m4c (进行中 #49) |
| #427 | `markdown-view` | 4 | 4 | 0 | 0 | 0 | src+doc | 已修复 |  |
| #428 | `modal` | 2 | 1 | 0 | 1 | 0 | src | 进行中 | m4c (进行中 #49) |
| #429 | `nav-bar` | 3 | 1 | 1 | 1 | 0 | src | 进行中 | m4c (进行中 #49) |
| #430 | `no-data` | 1 | 1 | 0 | 0 | 0 | src | 已修复 |  |
| #431 | `no-selection` | 1 | 0 | 1 | 0 | 0 | src | 全不成立 |  |
| #432 | `number-input` | 3 | 3 | 0 | 0 | 0 | src | 已修复 |  |
| #433 | `outline-border` | 3 | 3 | 0 | 0 | 0 | doc | 已修复 |  |
| #434 | `pagination` | 4 | 3 | 1 | 0 | 0 | src+doc | 已处理 |  |
| #435 | `permission-state` | 1 | 0 | 1 | 0 | 0 | src | 全不成立 |  |
| #436 | `picker` | 6 | 6 | 0 | 0 | 0 | src+doc | 已修复 |  |
| #437 | `popover` | 4 | 3 | 0 | 0 | 1 | src+doc | 低优尾项待定 |  |
| #438 | `progress` | 1 | 0 | 1 | 0 | 0 | src | 全不成立 |  |
| #439 | `progress-bar` | 3 | 1 | 1 | 0 | 1 | src+doc | 低优尾项待定 |  |
| #440 | `radio` | 5 | 5 | 0 | 0 | 0 | src+doc | 已修复 |  |
| #441 | `rating` | 7 | 6 | 0 | 1 | 0 | src+doc+demo | 进行中 | m4c (进行中 #49) |
| #442 | `scroll` | 6 | 5 | 0 | 0 | 1 | src+doc | 低优尾项待定 |  |
| #443 | `search-empty` | 2 | 1 | 1 | 0 | 0 | src+doc | 已处理 |  |
| #444 | `search-input` | 4 | 4 | 0 | 0 | 0 | src+doc+demo | 已修复 |  |
| #445 | `search-select` | 5 | 3 | 1 | 0 | 1 | src+doc | 低优尾项待定 |  |
| #446 | `segmented-slider` | 7 | 7 | 0 | 0 | 0 | src+doc+demo | 已修复 |  |
| #447 | `select` | 6 | 3 | 0 | 2 | 1 | src+doc | 进行中 | L3 (进行中 #47) / L5 (未派工) / m4c (进行中 #49) |
| #448 | `skeleton` | 5 | 1 | 1 | 1 | 2 | src+doc | 进行中 | L5 (未派工) / m4c (进行中 #49) |
| #449 | `slider` | 5 | 4 | 0 | 1 | 0 | src+doc+demo | 进行中 | L3 (进行中 #47) |
| #450 | `sortable-list` | 3 | 2 | 1 | 0 | 0 | src+demo | 已处理 | high 项台账记为已修（防御性加 disabled guard），审计复核认为不可达 |
| #451 | `spinner` | 5 | 2 | 0 | 0 | 3 | doc | 低优尾项待定 | L5 (未派工) |
| #452 | `splitter` | 5 | 4 | 0 | 1 | 0 | src+doc | 进行中 | m4c (进行中 #49) |
| #453 | `stack` | 4 | 0 | 2 | 0 | 2 | src+doc | 低优尾项待定 |  |
| #454 | `stagger` | 4 | 4 | 0 | 0 | 0 | src | 已修复 |  |
| #455 | `stat-card` | 6 | 5 | 0 | 1 | 0 | src+doc | 进行中 | m6b (阻塞 #50) |
| #456 | `status-badge` | 2 | 1 | 1 | 0 | 0 | src+doc | 已处理 |  |
| #457 | `steps` | 4 | 4 | 0 | 0 | 0 | src+doc | 已修复 |  |
| #458 | `switch` | 5 | 3 | 0 | 0 | 2 | doc | 低优尾项待定 | L5 (未派工) / m6b (阻塞 #50) |
| #459 | `tab-bar` | 4 | 2 | 0 | 1 | 1 | src+doc | 进行中 | m4c (进行中 #49) |
| #460 | `tabs` | 8 | 5 | 0 | 3 | 0 | src+doc | 进行中 | L3 (进行中 #47) / m6b (阻塞 #50) |
| #461 | `tag` | 3 | 2 | 0 | 1 | 0 | src+doc | 进行中 | m4c (进行中 #49) |
| #462 | `tag-input` | 4 | 4 | 0 | 0 | 0 | src+doc | 已修复 |  |
| #463 | `textarea` | 1 | 1 | 0 | 0 | 0 | src | 已修复 |  |
| #464 | `timeline` | 5 | 4 | 0 | 1 | 0 | src+doc | 进行中 | m6b (阻塞 #50) |
| #465 | `toast` | 5 | 3 | 0 | 1 | 1 | src+doc | 进行中 | m4c (进行中 #49) |
| #466 | `tooltip` | 5 | 4 | 1 | 0 | 0 | src+doc | 已处理 |  |
| #467 | `transfer` | 3 | 1 | 1 | 0 | 1 | src+doc | 低优尾项待定 |  |
| #468 | `transition` | 5 | 4 | 0 | 1 | 0 | src+doc | 进行中 | m4c (进行中 #49) |
| #469 | `tree` | 3 | 2 | 0 | 1 | 0 | src+doc | 进行中 | m4c (进行中 #49) |
| #470 | `tree-select` | 4 | 3 | 0 | 1 | 0 | src+doc+demo | 进行中 | m4c (进行中 #49) |
| #471 | `typing-indicator` | 3 | 2 | 0 | 0 | 1 | doc | 低优尾项待定 |  |
| #472 | `utils` | 1 | 1 | 0 | 0 | 0 | doc | 已修复 |  |
| #473 | `version-capsule` | 5 | 4 | 0 | 1 | 0 | src+doc | 进行中 | m6b (阻塞 #50) |
| #474 | `virtual-list` | 3 | 2 | 0 | 0 | 1 | src | 低优尾项待定 |  |

### 有 finding 但未建 issue（不计入 112）

| 组件 | finding | 说明 |
|---|---|---|
| `flex` | low d5-shallow-api · low unlinked-demo | unlinked-demo 属非正式驳回（静态围栏既定标准）|
| `offline-state` | low type-leak · low d5-no-purpose | 未建 issue |
| `text-transformer` | low d5-bloat · low d5-frontmatter | 未建 issue |
| `tuff-logo-stroke` | low d5-frontmatter | 未建 issue |

## 判定不成立的理由（30 条正式 `refutedReason`，关 issue 时可直接引用）

- **`ai-elements` (#364)** — medium/a11y：The two evidence facts are real (TxAiMessage.vue:63 `aria-hidden="true"` on the avatar wrapper, and :78 `aria-label="AI is typing"` on a role-less div), but the stated consequence does not hold.
- **`cascader` (#377)** — medium/missing-export：The premise does not survive a full-text search.
- **`cascader` (#377)** — medium/lang-parity：The two contracts the finding says are "dropped" are both present elsewhere in the same zh page.
- **`copy-button` (#386)** — medium/logic-bug：The quote is real (TxCopyButton.vue:59-60) but the cited code refutes the stated mechanism.
- **`date-picker` (#389)** — medium/missing-export：The doc never references DatePickerVariant in the variant prop row - date-picker.en.mdc:101 spells out the literal union `'picker' | 'field' | 'adaptive'`, so consumers need no import.
- **`dialog` (#390)** — medium/type-mismatch：The quote is accurate (types.ts:205 `buttons: TouchTipButton[]`, no `?`), but the conclusion that this misleads readers is wrong — `buttons` IS omittable, exactly as the docs say.
- **`empty-state` (#394)** — medium/lang-parity：The first half checks out — empty-state.zh.mdc:13 is byte-identical to its frontmatter description on line 3, while empty-state.en.mdc:13 is a two-sentence intro.
- **`flat-input` (#399)** — medium/missing-export：The conclusion does not hold.
- **`fusion` (#406)** — medium/a11y：The mechanical part is accurate — TxFusion.vue:78-84 is a plain `<div class="tx-fusion" ...
- **`glow-text` (#408)** — medium/lang-drift：The evidence line is real (glow-text.zh.mdc:13 repeats the frontmatter description verbatim), but the conclusion — that zh readers lose the mode-selection guidance the en intro adds — does not hold: glow-text.zh.mdc:15, the blockquote im…
- **`guide-state` (#414)** — medium/type-leak：TxGuideState.vue:9 indeed has no defineEmits, but the conclusion that the events are broken/absent from the public contract fails both checks I ran.
- **`icon` (#415)** — medium/type-mismatch：The finding's load-bearing claim is that `ITuffIcon` is "an unrelated type".
- **`icon-button` (#416)** — medium/missing-export：The factual half checks out (icon-button has no src/types.ts and index.ts:6 exports only the component), but the stated harm is refuted by the very next line of the file the finding quotes: index.ts:7 exports `TxIconButtonInstance = Inst…
- **`kbd` (#421)** — medium/missing-export：The literal facts check out (kbd/index.ts exports only `TxKbd` + `TxKbdInstance` and there is no kbd/src/types.ts; props are declared inline in TxKbd.vue lines 6-14), but the defect conclusion rests on a convention that does not exist.
- **`loading-overlay` (#424)** — medium/a11y：The code facts are right (TxLoadingOverlay.vue:38-48 is a plain teleported div with no role/aria-busy/focus trap), but the conclusion — that this contradicts the docs — is refuted by the docs themselves.
- **`nav-bar` (#429)** — medium/logic-bug：The documented contract is only the variable assignment, and the code honors it: en doc :77 "`zIndex` is exposed through `--tx-nav-bar-z-index`" and Props :90 "Value assigned to `--tx-nav-bar-z-index`" (zh:77/90 identical), which rootSty…
- **`no-selection` (#431)** — medium/type-leak：This is the attrs-passthrough / base-component-inheritance false positive.
- **`pagination` (#434)** — medium/type-mismatch：The quote is real (pagination.zh.mdc:60 `    default: '0'` for `total`) and withDefaults (TxPagination.vue:13-20) indeed omits `total`.
- **`permission-state` (#435)** — medium/missing-emits-declaration：This is exactly the attrs-passthrough/base-component-inheritance case, and the finding itself concedes the mechanism works.
- **`progress` (#438)** — medium/missing-export：The literal read is right — progress/index.ts is 9 lines, ends at `export { TuffProgress }` / `export default TuffProgress`, and TxProgress.vue:8-24 declares props inline with no src/types.ts — but the "unlike every sibling" premise that…
- **`progress-bar` (#439)** — medium/logic-bug：The code fact is right (TxProgressBar.vue:198-210, `watch(() => resolvedPercentage.value, cb)` with no options object, so no `immediate`), but the 'contradicts the docs' conclusion is an over-read.
- **`search-empty` (#443)** — medium/type-leak：This is the attrs-fallthrough/inheritance case, and the docs already describe it as such.
- **`search-select` (#445)** — medium/a11y：Two of the four claimed dead keys are actually handled by the composed children.
- **`skeleton` (#448)** — medium/missing-export：The asserted contradiction does not exist.
- **`sortable-list` (#450)** — high/logic-bug：The evidence is literally true (TxSortableList.vue:69-88 has no `props.disabled` check) but the stated failure — "a drop that lands while `disabled` is true still emits" — is not reachable and rests on an unverified assumption.
- **`stack` (#453)** — medium/invalid-demo-usage：The evidence is right (stack.zh.mdc:49-59 nests `<TxStack inline>` in a `<p>`, and TxStack.vue:30 roots on a `<div>`), but the stated failure mechanism is wrong for a Vue SFC.
- **`stack` (#453)** — medium/missing-export：Same misreading as [9].
- **`status-badge` (#456)** — medium/a11y：The code facts are right (TxStatusBadge.vue:112-118 is a div with role="status" and @click="handleClick", no tabindex/keydown), but the conclusion 'click-mode badge is keyboard-unreachable' rests on the unverified assumption that the bad…
- **`tooltip` (#466)** — medium/missing-export：The factual premises are right (types.ts:3 declares it; tooltip/index.ts:8 exports only TooltipProps), but the conclusion "consumers cannot type an anchor config object without reaching into internal paths" is false.
- **`transfer` (#467)** — medium/a11y：The evidence is right (TxTransfer.vue:135-139 passes no label/slot/ariaLabel, so TxCheckbox.vue:38-44 effectiveAriaLabel is undefined and the `<button role="checkbox">` at line 54 renders no aria-label), but the conclusion ignores the pa…

## 结论性判断

112 个 issue 大致分**三类**（下表按处理状态细分为五档，三类是它们的归并）：

| 大类 | 数量 | 细分 | 含义与建议 |
|---|--:|---|---|
| **可直接关** | **45** | 已修 33 + 已修&部分不成立 12 | 主诉已在已完成批次落盘、组件有改动佐证；关前复跑该组件 vitest 即可 |
| **从一开始就不成立** | **5** | 全部 finding 判定不成立 | 以「非缺陷/误报」关闭，附下方驳回理由，无需任何代码改动 |
| **改写后保留** | **62** | 尚有进行中批次 46 + 仅剩低优尾项 16 | 别原样关也别原样留：**把已修 + 已判不成立的条目从 issue 描述划掉，只留真正未处理的**，等 L3/m4c/m6b 收尾 |

**理由与口径：**

- **可直接关 45 个**：这些 issue 的 high/medium 主诉已在已完成批次里落盘，且组件文件确有改动佐证。关前对该组件 `pnpm exec vitest run` 复跑即可，不必逐条复核。
- **从一开始就不成立 5 个**（#394 empty-state、#414 guide-state、#431 no-selection、#435 permission-state、#438 progress）是最干净的关闭对象：各仅 1 条 finding，且同属一类**误报**——attrs-passthrough/继承型 type-leak 与「文档从未承诺该导出」的 missing-export。不需任何代码改动，应以「非缺陷」关闭。
- **改写后保留 62 个**：绝大多数是**同一 issue 里主诉已修、但仍挂着进行中批次（L3 文档截断 / m4c a11y / m6b 类型）或 low 文档尾项**。正确动作是**把已修与已判不成立的条目从 issue 描述里划掉，只留真正未处理的那几条**，等对应批次收尾。
- 另需注意「已知不确定性 3」的**非正式驳回**：`chat-composer`/`cascader`/`flex` 等几条本质是误报，但因未正式记为 WONTFIX，本表算进「改写后保留」的「未」而非「不成立」。关这些 issue 前回台账确认理由，可能实际归入「不成立」。
- **本表不替用户关任何 issue，也未改任何代码/文档。** 「已修」是批次级推导，逐 issue 的最终确认（尤其复跑测试）仍需在关闭前执行。

> finding 级口径：112 个 issue 名下原 finding 合计 414 —— 已修 295 / 判定不成立 30 / 进行中 55 / 未知低优 34。另有 4 个无 issue 组件的 7 条 low 未计入。
