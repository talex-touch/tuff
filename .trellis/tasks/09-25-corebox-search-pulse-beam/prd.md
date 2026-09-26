# CoreBox 搜索中状态：整条 bar 的棱镜光（TxPrismGlow）

父任务：`09-25-corebox-ux-polish`。依赖：`09-25-tuffex-prism-glow`（组件源码落地即可接入，不依赖其文档）。

## Goal

把 CoreBox 搜索栏右侧的"正在搜索…"小 chip（spinner + 文字）换成覆盖整条搜索栏的"搜索中"光效：tuffex `TxPrismGlow` 的光谱光锥从 bar 底边升起、从左往右流动、途中融合分裂。观感更高级，且不增加渲染主线程负担。

## Background

- 现状：`apps/core-app/src/renderer/src/views/box/CoreBox.vue:998-1004` 的 `.CoreBox-SearchStatus--progress`，内容为 `TxSpinner`（`role="status"` / `aria-live="polite"`）+ 可见文字 `corebox.searching`（zh-CN「正在搜索…」）。显示门控为 `useDeferredLoading(loading, { delay: 600, minDuration: 0 })`（`CoreBox.vue:106`）。
- 仅 MainBox 模式头部有该 chip，DivisionBox 头部没有。搜索失败时同位置显示重试按钮（`v-if / v-else-if` 互斥）。
- 搜索栏即 `div.CoreBox`：
  - `position: absolute; height: 56px; z-index: 100000000`，自成层叠上下文；
  - 圆角取 `var(--corebox-container-radius)`，默认预设 0，`rounded` 预设 12；
  - 无结果时窗口收成 56px（`main/modules/box-tool/core-box/window.ts:45-47`）；
  - 画布布局下为 `position: relative` 的 grid 容器。
- 渲染层约束（`.trellis/spec/frontend/component-guidelines.md`）：
  - Shell 颜色只读 token；
  - 颜色不能单独承载状态；
  - 动画须尊重 reduced-motion；
  - CoreBox 装饰动效在 `lowBatteryMode` 下关闭；
  - 就绪结果不得被揭示动效阻塞。
- 搜索中正是渲染主线程最忙的时候，指示动画必须由合成器独立运行。`TxPrismGlow` 满足这一点（只动 `translate` / `scale` / `opacity`）。
- core-app 开发态与 `tsconfig.web.json` 的 paths 都从 tuffex **源码**解析 `@talex-touch/tuffex/<sub>`（`electron.vite.config.ts:56-70`），接入不需要先构建 tuffex dist。
- 第一版实现（未提交）：
  - 新增了 `views/box/SearchPulse.vue`（单束扫光 + 背景光带）；
  - CoreBox 里写好了门控、sr-only 状态和降级文字，已通过 vue-tsc / eslint / prettier / `views/box` 测试 / UI 合约门禁。
  
  2026-09-25 老板改为参考 Unicorn Studio 的光锥效果并沉淀进 tuffex，视觉部分改由 `TxPrismGlow` 提供，`SearchPulse.vue` 删除，门控部分保留。

## Requirements

- **R1 可见文字**：默认只保留整条 bar 的光效，不显示 spinner 和可见的「正在搜索…」。`prefers-reduced-motion: reduce` 或 `lowBatteryMode` 时不挂载光效，改在原位置显示静态「正在搜索…」。两种状态下，读屏都能拿到 `role="status"` 的「正在搜索…」。（老板 2026-09-25 确认）
- **R2 视觉**：`TxPrismGlow` 覆盖整条 bar：
  - 全光谱调色板（D2），光锥从底边升起、整体左→右流动（D1）；
  - 叠放在 logo、输入框、标签、按钮之下，占位文字始终清晰可读；
  - `intensity` 按截帧调到"明显但不抢字"。
  
  已知降级：`rounded` 预设的输入框背景不透明，会挡住输入框区域内的光。（老板 2026-09-25 确认 D1 / D2）
- **R3 时机**：搜索超过 600ms 才出现，出现后至少保持 400ms 再淡出（`useDeferredLoading` 默认值）；进出场淡入淡出，不硬切。（老板 2026-09-25 确认）
- **R4 性能**：搜索结束且淡出完成后，不留任何运行中的动画或 DOM 层。组件保证只驱动合成器属性。
- **R5 高对比**：沿用组件的高对比降级（光锥压低到靠近底边的一条带，不带光柱），CoreBox 不另写规则。
- **R6 范围**：
  - 只影响 MainBox 模式头部；
  - 搜索失败时只显示原重试按钮，不显示光效；
  - 光效不拦截头部任何可交互元素的点击与焦点；
  - 删除 `views/box/SearchPulse.vue`。

## Acceptance Criteria

- [ ] AC1（R1/R2/R3）MainBox 模式下搜索耗时超过 600ms：整条 bar 底边升起光谱光锥并从左往右流动，右侧不再出现 spinner 或可见文字。耗时不足 600ms 的搜索完全不出现光效；出现后显示不少于 400ms，结束后淡出并从 DOM 移除。
- [ ] AC2（R2）在真实 Chromium 中截帧：harness 使用 CoreBox 头部真实结构和编译后的 CSS，或在 dev Electron 里通过 CDP 截图，时间点为 0 / 1.2 / 2.4s，暗色、亮色各一套。光锥流动、融合，占位文字清晰；叠放层级正确，光在内容之下。
- [ ] AC3（R1）模拟 reduced-motion 或 `lowBatteryMode`：不挂载光效，原位置显示静态「正在搜索…」。默认状态下该文字以 sr-only 形式存在，且带 `role="status"`。
- [ ] AC4（R6）搜索失败时只显示重试按钮；输入框可正常输入，logo 与置顶按钮可正常点击；DivisionBox 头部不受影响；`views/box/SearchPulse.vue` 已删除。
- [ ] AC5 以下全部通过、`git diff --check` 干净：
  - `vue-tsc -p tsconfig.web.json`；
  - core-app 包内 eslint；
  - `coreapp-ui-contract` 门禁；
  - `views/box` 现有测试；
  - 门控临时验证脚本（跑完即删）。

## Out of Scope

- 搜索失败 / 重试按钮样式；DivisionBox 头部；搜索结果区与结果揭示动效（归 `09-25-corebox-list-motion`）。
- `TxPrismGlow` 组件本身的实现与文档（归 `09-25-tuffex-prism-glow`）。
- 新增单元测试（门控用临时脚本验证，用完即删）。
