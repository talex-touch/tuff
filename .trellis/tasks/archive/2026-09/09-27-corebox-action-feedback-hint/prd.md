# CoreBox 操作反馈提示组件：左侧涌现色带 + 文字变换动效

## Goal

CoreBox 执行动作后的一行反馈（「已固定」「已取消固定」「已复制」「操作失败」…）目前只是图标加纯文字，
瞬间替换底栏左侧的条目信息，观感平淡（老板截图：底栏左侧「✓ 已取消固定」）。本任务新增 TuffEx 组件
`TxStatusHint`，承载「从左缘向右渐隐、带颗粒、会涌现的语气色带」和「用 `TxTextTransformer` 做、带缩放强调的
文字变换」，再由 CoreApp 薄封装把 CoreBox 底栏、顶栏两份反馈都换成它。

老板原始要求（原文）：

1. 抽离为一个新的提示组件 左侧
2. 文字用 text 的那个动效组件 transformer 啥的
3. 比如是成功 左侧可以逐渐向右有一个渐变 transparent 的绿色 涌现的感觉 加一丢丢颗粒感 这个颜色不要太显眼
4. 文字变换可以显眼一点 比如加一些放大啥的提示 你看着办

## Decisions

- D1（老板拍板）做成 **TuffEx primitive + CoreApp 薄封装**。色带、颗粒、文字强调属于 TuffEx；CoreBox 的放置、
  唯一播报区、动效总闸留在 CoreApp 封装层。
- D2（老板拍板）组件名 **`TxStatusHint`**，目录 `status-hint`，文档归 base › Feedback（与 toast / alert 同类），
  语气复用 `StatusTone`。
- D3（依据 spec 推定）底栏、顶栏两份反馈都换成新组件，顶栏用紧凑尺寸。`CoreBox.vue` 注释把顶栏那份定义为
  「the footer's feedback, header-sized」，只换一处会让两份分叉。
- D4（依据原话推定）「比如是成功」是举例：失败态与成功同构，换成红色；`StatusTone` 的其他语气按各自色相处理，
  `muted` 为中性灰。
- D5（依据 spec 推定）CoreBox 反馈的行为契约不变：显示时长、替换规则、底栏/顶栏放置、唯一播报区，以及两枚
  Remix 图标（`i-ri-checkbox-circle-line` / `i-ri-error-warning-line`）。
- D6（「你看着办」，原型标定）文字强调只用缩放（合成层），第一帧即可读：入场「放大后落定」（1.18 → 1，bouncy 弹簧），
  同文案重放「放大再回落」。颗粒并进色带遮罩，左缘强度亮 0.26 / 暗 0.20。标定过程与对照图见
  `research/visual-calibration.md`。

## Background（已确认事实）

- **现状**
  - 底栏：`apps/core-app/src/renderer/src/components/render/CoreBoxFooter.vue:200-214`（`.FooterFeedback`，
    `:key="shownFeedback.id"`，与条目信息 `v-if / v-else` 互斥），样式 `:313-344`。
  - 顶栏：底栏不在屏时显示在 `.CoreBox-Configure` 里，`apps/core-app/src/renderer/src/views/box/CoreBox.vue:1227-1243`
    （`.CoreBox-ActionFeedback`），样式 `:1611-1647`。
  - 数据源 `renderer/modules/box/meta-actions/footer-feedback.ts`：`{ id, tone: 'success' | 'error', message }`，
    `COREBOX_FOOTER_FEEDBACK_MS = 1200`，新消息替换旧消息并重新计时，每条消息 `id` 都变。写入方是
    `modules/box/adapter/hooks/useActionPanel.ts`；错误文案可能来自 provider（`result.message`、`response.error`），
    长度不受控。
- **CoreBox spec**（`.trellis/spec/frontend/corebox-results-contracts.md`）
  - 「Action feedback placement」：唯一播报区是 wrapper 上常驻的 `.CoreBox-ActionFeedback-Live`；两份反馈只做视觉；
    图标和文字成对出现；点名了下面两份测试。
  - 「Principles」：动效只用 `transform` / `translate` / `opacity`，不过渡 width、height、padding、`filter` 或自定义属性。
  - 「Rejected designs」：已就绪内容的入场不许用 `opacity: 0` 或 `blur()`。
  - 「One motion gate」：脚本驱动的动效（`element.animate()`、rAF）必须问 `shouldAnimate()`（`useMotionGate()` 只在
    `CoreBox.vue` 调一次再往下传）。CSS 动效由 `html[data-low-battery-motion='1']` 停掉（`renderer/styles/index.scss:395-401`），
    由减弱动效媒体查询缩短（`renderer/styles/accessibility.scss:106-115`）。
- **`TxTextTransformer`**（`packages/tuffex/packages/components/src/text-transformer/`）
  - 默认 `mode="morph"`，走 `TxTextMorph` 引擎；根节点写死 `aria-live="polite"`（`TxTextTransformer.vue:151`）。
  - 引擎首帧不做动画（`isInitialRender`）。morph 的 DOM 是「读屏整串 + aria-hidden 分段」，`textContent` 是两份。
  - 引擎的 WAAPI 只认 `prefers-reduced-motion`，不认低电量；容器宽度也用 WAAPI 动画（`transitionContainerSize`）。
  - morph 下不截断（`overflow: visible`）；`fade` 模式是模糊交叉淡化（`filter`）。
- **TuffEx 约束**（`.trellis/spec/frontend/tuffex-design-rules.md`、`component-guidelines.md` › TuffEx Suite Taxonomy）
  - 语气词汇 `StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'muted'`（`status-badge/src/types.ts:6`，
    `TxModeChip` 的 `tone` 同源）；尺寸 `sm | md`。
  - 颜色只来自 `--tx-*` token。暗色填充用 `-light-9`，或 `color-mix(in srgb, var(--tx-color-<hue>) 14%, transparent)`。
  - 每个动画都要有减弱动效出口，一个组件只用一种写法，并用样式契约测试锁住；关键帧里不写 `var()`，
    只动独立的 `translate` / `scale` / `rotate` / `opacity`。
  - 状态变化默认要有 `role="status" aria-live="polite"`；用户可见字符串是带英文默认值的 prop（TuffEx 没有 i18n）。
  - 注册链：组件目录 → `components.ts` → `base` 套件桶（`suite-barrels.test.ts`）→ README 中英文计数
    （`audit-readme-inventory.mjs`）→ Nexus 的 `TAXONOMY`、`SECTION_ORDER`、hub 中英文链接和套件计数 →
    `.zh.mdc` / `.en.mdc` + demo + `demo-registry.ts`。
  - 门禁：`apps/nexus/test/docs/tuffex-component-docs-coverage.test.ts`（CI 同款：先 `pnpm -C packages/tuffex build`
    再 `pnpm -C apps/nexus exec vitest run`）；`audit:size`（读 dist，需要时在同一提交里调预算）；CoreApp 与 Nexus
    两个下游类型检查（CoreApp 有 `noUnusedLocals`，Nexus 有 `noUncheckedIndexedAccess`）。
  - 语气图标先例：`TxAlert` / `TxToast` 用 `TxIcon` 内置 SVG 名称（`check-circle` / `x-circle` / `alert-triangle` / `info`）；
    Nexus 解析不了 `i-ri-*`。
- **可复用素材与几何**
  - 颗粒纹理先例：`TxStatCard.vue:618-632`（fractalNoise SVG data URI，140px 平铺，overlay 混合，14%）。
    标定证明这种叠加法在低强度色带里看不出颗粒，本任务改用「噪点并进遮罩」（见 `research/visual-calibration.md`）。
  - 颜色：底栏图标用 `--tx-color-success`（普通主题亮 `#67c23a` / 暗 `#4ade80`；`#166534` / `#86efac` 是高对比度主题），
    顶栏用 `--shell-success`（亮 `#26794e` / 暗 `#46b57c`）。
  - CoreBox 宽 720（`main/modules/box-tool/core-box/window.ts:45`）；底栏 `h-44px px-3`、`position: absolute; z-index: 10`
    （`CoreBox.vue:1789-1795`）；`.fake-background::before` 在 `z-index: -1`（`renderer/styles/index.scss:70-87`）。

## Requirements

### TuffEx：`TxStatusHint`

- R1 渲染「语气图标 + 文字」一行提示，语气取 `StatusTone`，默认按语气给出 `TxIcon` 内置图标，并允许宿主替换图标。
- R2 语气色带：从组件左缘（inline-start）向右渐隐到透明，带少量颗粒纹理，强度克制（亮暗主题都不刺眼）；纯装饰，对读屏隐藏。
- R3 色带「涌现」入场：只用合成层属性（`scale` / `translate` / `opacity`）。
- R4 文字经 `TxTextTransformer` 渲染：值变化时逐字变换；入场时和「同一文案再次触发」时有缩放强调（宿主通过一个
  变化的 key 触发重放）；文字第一帧即可读（不从 `opacity: 0` 开始，不用 blur）。
- R5 宿主可关闭全部动效（对应 CoreBox 动效总闸）：关闭后色带、图标、文字直接落在终态，不跑 WAAPI；
  `prefers-reduced-motion: reduce` 下同样落在终态。
- R6 宿主可关闭播报：默认按 TuffEx 规则是 polite live region；关闭后组件内不存在任何 live region
  （包括 `TxTextTransformer` 自带的那个）。
- R7 提供 `sm` / `md` 两档尺寸；提供离场过渡的样式，宿主用 `<Transition>` 包一层即可让色带柔和退场。
- R8 完整走完 TuffEx 新组件清单：注册链、套件桶、README 计数、组件测试（含动效样式契约）、Nexus 中英文文档与 demo、
  hub 链接与计数、`audit:size`。

### CoreApp：薄封装与接入

- R9 新增 CoreApp 封装组件，把 `CoreBoxFooterFeedback` 映射到 `TxStatusHint`：`error` → `danger`，`id` → 重放 key，
  关闭组件内播报，图标沿用两枚 Remix 图标。
- R10 底栏：反馈作为覆盖在底栏左侧的整高区域出现，色带从底栏左缘起；反馈显示期间组件保持挂载（不再按 `id`
  重挂载），使「已固定 ↔ 已取消固定」逐字变换；反馈结束时条目信息立即回来，色带柔和退场。
- R11 顶栏：同一封装以紧凑尺寸渲染，保持在 `.CoreBox-Configure` 首位。
- R12 动效总闸：`CoreBox.vue` 把 `shouldAnimate()` 传给底栏和顶栏的封装；闸关时组件不跑任何脚本动效。
- R13 CoreBox 反馈的既有契约不变（D5）。

### 文档与 spec

- R14 更新 `corebox-results-contracts.md` › Action feedback placement（组件、动效、总闸），并记录 morph 引擎容器宽度动画
  这一处对「合成层属性」原则的例外及理由；`tuffex-text-motion.md` 的「What each component uses」表补上 `TxStatusHint`。

## Acceptance Criteria

- [x] AC1（R2、R3、R4、D4）CoreBox 真机（隔离 dev 实例）亮、暗主题：成功反馈出现从底栏左缘向右渐隐的淡绿色带，
  带颗粒，涌现入场，文字带缩放强调；失败反馈同构，为红色。有截图或逐帧图为证。
- [x] AC2（R4、R10）「已固定」与「已取消固定」在显示期间切换时，文字逐字变换，组件未重挂载（测试断言同一组件实例）。
- [x] AC3（R4）同一文案再次触发（新 `id`）时，强调动画重放（测试断言重放标记切换）。
- [x] AC4（R6、R9、R13）CoreBox 内同一条消息只被一个 live region 播报；底栏、顶栏的反馈子树里没有 `aria-live` 不为
  `off` 的节点，也没有 `role="status"`。
- [x] AC5（R5、R12）低电量或减弱动效时，色带、图标、文字落在终态；底栏封装拿到 `animated=false` 时不渲染 morph 引擎。
- [x] AC6（R10）反馈结束时条目标题同一次 tick 内回到 DOM（沿用现有测试断言），色带退场不阻塞条目信息。
- [x] AC7（R8）`packages/tuffex` 组件测试、`suite-barrels.test.ts`、`audit-readme-inventory.mjs`、`audit:size`
  （新鲜 build 后）、`apps/nexus` vitest（含 docs 覆盖契约）、`check:mdc-fences` 全部通过。
- [x] AC8（R9-R13）`render/CoreBoxFooter.feedback.test.ts` 与 `box/CoreBox.search-status.test.ts` 按新结构更新后通过，
  断言语义不削弱。
- [x] AC9 CoreApp `typecheck`（node + web）、Nexus typecheck 代理（`vue-tsc --noUncheckedIndexedAccess`）、tuffex typecheck、
  两边 eslint（按各自包内配置判 delta）通过。
- [x] AC10（R14）spec 更新落地，内容与实现一致。

## Out of Scope

- 修改反馈时长、写入方、底栏/顶栏放置逻辑，或新增 toast 宿主。
- 修改 `TxTextTransformer` / `TxTextMorph` 的公开 API。
- CoreBox 以外的界面接入 `TxStatusHint`。

## Open Questions

- 无阻塞项。

## Completion (2026-09-27)

Commits: `1e56340be` (TxStatusHint + Nexus docs), `9572393c4` (CoreApp integration), `f68e10df1` (spec).

- AC1: isolated dev instance, light and dark, frame-exact filmstrips (animations paused and seeked):
  footer entrance, pin/unpin morph with replay, error tone and replay, header copy; screenshots under
  `/tmp/tuff-hint-verify/shots/{light,dark}/` (not kept in the repo). Nexus page checked in ego.
- AC2–AC6, AC8: `CoreBoxFooter.feedback.test.ts` and `CoreBox.search-status.test.ts` (40 tests); 9 new
  assertions fail on HEAD; 7 injected mutations all caught.
- AC7, AC9: tuffex vitest (full suite 2901), vue-tsc with and without `--noUncheckedIndexedAccess`,
  build, `audit-package-size` / `-exports` / `-types` / `-readme` / `-vocab`; core-app `tsc` node +
  `vue-tsc` web with positive controls, eslint, prettier; nexus fences, parity, demo orphans,
  recategorize `--check`, vitest (1972), typecheck script; `docs:verify`.
- AC10: `corebox-results-contracts.md`, `tuffex-text-motion.md`, `tuffex-design-rules.md`, `index.md`.

Left open, reported to TalexDreamSoul: the hub's Basics count trails the barrel by one (predates this
task, 2e155706f); no RTL mirroring; flipping `animated` back on while a hint shows replays the entrance.
