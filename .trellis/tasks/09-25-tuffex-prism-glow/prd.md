# tuffex TxPrismGlow 棱镜光效组件

父任务：`09-25-corebox-ux-polish`；首个使用方：`09-25-corebox-search-pulse-beam`（CoreBox 搜索中状态）。

## Goal

给 tuffex 加一个通用的「棱镜光」效果组件：宿主元素的一条边上升起数束光谱色光锥，整体从左往右流动，途中追上就叠加融合发白，拉开又分裂。可以用在卡片、输入框、搜索栏这类元素的加载 / 工作中状态上，观感参考 Unicorn Studio 的 AI 画布加载态。

## Background

- 参考：George Hastings（@soulegit）2026-09-23 发布的 Unicorn Studio「New AI canvas loading state」视频（逐帧截图在 `/tmp/soulegit-motion/`）。
  - 画面：深色卡片的底边升起柔和的光谱色光锥，底边处是近白的核心，两侧带棱镜色散晕边，向上拉出淡淡的竖向光柱。
  - 运动：光锥漂移、胀缩、明暗起伏，重叠处叠加发白（beam morph）。
  - 只借鉴观感，不涉及任何代码。
- 已拍板（2026-09-25，老板）：
  - 光锥整体左→右流动（D1）；
  - 默认全光谱彩虹，另提供主题色派生调色板（D2）；
  - 命名 `TxPrismGlow`，放 `pro` 套件、Effects 分组（D3）；
  - 加一个小单测（D4）。
- 原型已在真实 Chromium 中验证（`/tmp/search-pulse-harness/proto.html`，截帧在 `/tmp/prism-proto/`）。纯 CSS 可以做出这个效果：`radial-gradient` 画光锥、`plus-lighter` 叠加出融合发白、`repeating-conic-gradient` 加遮罩画柔和光柱，动画只用 `translate` / `scale` / `opacity`。暗色 480×270 卡片与 720×56 搜索栏都成立；亮色需要单独一套参数。
- 同类组件：`TxBorderBeam`（libraries.dev border-beam 的移植，沿边框行进的光束）、`TxThinkingOrb`、`TxGlowText`。它们都画不出"边缘光锥群"，本组件与它们互补。
- tuffex 规则（`.trellis/spec/frontend/tuffex-design-rules.md`、`tuffex-docs-sync.md`、`nexus-docs-structure.md`）：
  - 颜色走 token（`var(--tx-*, fallback)`）；
  - 每个动画都要有 reduced-motion 出口，且降级后保留一帧完整的静态画面；
  - `v-if` 放在 `Transition` 里面；
  - 注册链与文档齐全才算完成。

## Requirements

- **R1 视觉**：宿主的一条边上有 6 束光谱色光锥。每束包括：
  - 边缘处的高亮核心；
  - 两侧色相偏移的色散晕边；
  - 整体光晕与淡淡的竖向光柱；
  - 贴着边缘的一道细亮线。
  
  暗色表面上重叠处加法混合、发白但不过曝；亮色表面上呈清透的彩色光晕，重叠不发灰发脏。
- **R2 运动**：光锥从左侧升起，以各不相同的速度向右漂移，途中胀缩、明暗起伏；追上时融合、拉开时分裂，到右侧淡出后从左侧重新升起，连续不断。开启时画面立刻是"已经在流动"的状态，不需要等第一束光从左边进来。
- **R3 API**（prop 声明顺序即文档顺序）：
  - `active?: boolean = true`：开 / 关，淡入 / 淡出；关闭后不渲染任何光层；
  - `palette?: 'spectrum' | 'accent' = 'spectrum'`：全光谱，或由 `--tx-color-primary` 派生的一组相邻色相；
  - `placement?: 'bottom' | 'top' = 'bottom'`：光从哪条边升起；
  - `intensity?: number = 1`：光层整体不透明度，取值 0–1，不影响插槽内容；
  - `duration?: number`：以秒计的流速基准，数值越小越快；
  - 默认插槽：内容渲染在光层之上。
- **R4 叠放**：
  - 组件根元素自成隔离的层叠上下文，光层在插槽内容之下、根元素背景之上；
  - 不传插槽时，也可以作为覆盖层绝对定位到任意宿主里（CoreBox 的用法）；
  - 光层 `aria-hidden`、`pointer-events: none`，不拦截点击，不影响内容布局。
- **R5 颜色**：只用 token 与由 token 派生的颜色。
  - 光谱调色板只以色相角声明，亮度 / 彩度按亮色 / 暗色取组件局部变量；
  - 主题色调色板由 `oklch(from var(--tx-color-primary, …) …)` 派生；
  - 不出现 hex 或 `rgba()` 颜色字面量，`var()` 的 fallback 除外；
  - 所有可调参数以 CSS 变量暴露并写进文档。
- **R6 性能**：
  - 动画只驱动 `translate` / `scale` / `opacity`，由合成器独立运行，渲染主线程繁忙时仍然流畅；
  - 不用 JS 帧循环，不用 `filter` / `backdrop-filter`，不做尺寸或布局动画；
  - `active` 关闭并淡出后不留任何运行中的动画或 DOM。
- **R7 降级**：
  - `prefers-reduced-motion: reduce`：所有动画停止，光锥停在一帧均匀分布的静态画面上，完整可见，进出场也不做过渡；
  - 高对比模式（`html.contrast` / `[data-tx-contrast='high']`）：光锥压低到靠近边缘的一条带，去掉光柱，避免在文字背后铺色。
- **R8 注册链与文档**：
  - 注册链：`components.ts` → `pro/index.ts` → nexus 侧边栏 `SECTION_ORDER`（Effects，紧挨 `border-beam`）→ `recategorize-component-docs.py` → 组件库画廊格 → hub 索引 `index.{zh,en}.mdc`。
  - 文档页 `prism-glow.zh.mdc` + `prism-glow.en.mdc` 按 canonical 结构写：安装、用法（含最佳实践）、API 参考（属性 / 插槽 / CSS 变量）、概述、技术实现、使用场景、相关组件。
  - 至少两个 demo：一张展示所有 prop 的卡片，一个仿搜索栏的加载态。每个 demo 在 `demo-registry.ts` 登记一行。
- **R10 变高即收起**（老板 2026-09-26：「只要高度变高 不局限于corebox 要立即收起」）：光亮着时，只要被监听元素的高度变高（超过 1px），光锥立即缩回发光的那条边并消失，耗时约 140ms，比正常淡出快得多，然后保持关闭，直到 `active` 关掉再打开才恢复。监听对象默认是组件根元素（包裹 / 覆盖两种用法下它都等于宿主）。另有 prop 可以换成任意元素，例如 CoreBox 的头部高度固定，要监听整个窗口容器。可以用 `collapseOnGrow` 关闭这一行为。高度变矮不触发。
- **R9 单测**：新增 `prism-glow/__tests__/prism-glow.test.ts`，覆盖以下几点：
  - 插槽渲染；
  - 光层 `aria-hidden`；
  - `active` 开关会挂载 / 卸载光层；
  - 调色板与方向的修饰类、CSS 变量绑定；
  - 编译后的样式契约：keyframes 只动 `translate` / `scale` / `opacity`；reduced-motion 块停掉所有动画并给出静态终态；无颜色字面量。

## Acceptance Criteria

- [ ] AC1（R1/R2）在 nexus 文档页用 ego-browser 截帧，时间点为 0 / 1.2 / 2.4 / 3.6s，暗色、亮色各一套。光锥从左往右前进；至少一帧出现融合发白、之后又分开；亮色下光晕清透、无灰脏叠色。
- [ ] AC2（R3/R4）文档 demo 中切换 `active` / `palette` / `placement` / `intensity` / `duration` 都即时生效；插槽内容始终在光层之上，可点击、可选中文本。
- [ ] AC3（R5/R6）编译后的 CSS：keyframes 只包含 `translate` / `scale` / `opacity`；除 `var(--tx-*, #fallback)` 外没有 hex / `rgba()`。
- [ ] AC4（R7）模拟 reduced-motion 时截图为静态均匀分布的光锥，`document.getAnimations()` 为空；高对比模式下光锥只占靠近边缘的一条带、没有光柱。
- [ ] AC5（R8）以下全部通过：
  - nexus：`check-demo-registry-orphans`、`check-mdc-fences`、`check-doc-translation-parity`、`tuffex-component-docs-coverage.test.ts`；
  - tuffex：`suite-barrels.test.ts`、`global-install.test.ts`；
  - 侧边栏与画廊中能看到 PrismGlow 并正确跳转。
- [ ] AC6（R9）`prism-glow.test.ts` 通过；tuffex 包内对应的 eslint 与类型检查通过。

## Out of Scope

- 不改 `TxBorderBeam` / `TxThinkingOrb` 等现有组件。
- 不做可配置光锥数量、自定义颜色数组、左 / 右边放置（需要时再加）。
- 不用 WebGL / canvas（在主线程上跑帧循环，搜索中这类主线程繁忙的场景会卡）。
