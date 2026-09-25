# tuffex 路径型融合表面组件（长出 / 分裂）

父任务：`09-25-home-session-polish`（R4）

## Goal

给 tuffex 加一个「融合表面」组件：一块圆角表面可以从任意一边**长出**一个凸起（托盘、子菜单、气泡），连接处是液体般的凹圆角；凸起还能被**拉开并在中段颈缩、拉断**，分裂成独立的一滴。外形始终是一条 SVG 路径，边缘锐利，可带描边与阴影；里面的内容仍是普通 DOM，出现时从模糊到清晰。

它是 `09-25-send-split-fusion`（发送时新消息从输入框分裂出去）的底层能力，同时作为通用组件进 tuffex 的 pro 套件（Effects）。

## 参考与来源

- 老板提供的 uiarc.dev Dock 截图：主工具栏上方长出一行形状子托盘，连接处是凹圆角。
- 2026-09-25 抓取 uiarc.dev Dock 实现核对的结论（只借鉴技术，uiarc 是付费组件库，不搬代码）：
  - 外形是一条 SVG `<path>`，每帧由 JS 用当前的「托盘高度 / 托盘中心 / 托盘宽度」三个弹簧值重算 `d`；
  - 托盘底部与主体相接处是二次贝塞尔凹圆角，半径 `min(12, 高度/2)`；托盘顶角是凸圆角；托盘中心被夹在主体直边范围内，不会压到主体圆角；
  - 阴影是 svg 元素上的 CSS `drop-shadow()`，跟着外形走；
  - 托盘内容在高度过半后才淡入；提示标签用 `blur → 0` 的方式进出场。
- tuffex 里已有两种「融合」，都走 SVG goo 滤镜（模糊 + alpha 阈值）：`TxLiquid`（liquid-gooey 的 Vue 移植，MIT）和 `TxFusion`（两个插槽靠近即融合）。它们无法带描边、边缘经过阈值处理会发软、滤镜区域每帧重绘；新组件用的是纯几何路径，与它们互补，不替代。

## 已拍板

- 2026-09-25：新增路径型融合组件，自研实现（老板选择）。

## Requirements

1. **组件**：`TxFusionSurface`（目录 `packages/tuffex/packages/components/src/fusion-surface/`），归入 `pro` 套件，文档归 Effects 分组，紧挨 `fusion` / `liquid`。
2. **长出（sprout）**：`buds` 声明若干凸起；每个凸起有所在边（上 / 下 / 左 / 右）、沿边的中心位置、宽度、外凸高度、圆角、开合（`open`）。开合、位置、尺寸的变化都由弹簧驱动，中途改目标不会顿挫（保留速度）。
3. **融合连接**：凸起与主体相接处是凹圆角（默认半径 12，且不超过凸起高度的一半）；凸起的位置被夹在主体的直边范围内，永远不压到主体的圆角；同一边的多个凸起互不重叠时都能正确绘制。
4. **分裂（split）**：凸起可以被拉离主体（`detach` 距离）。拉开时颈部先整体拉长，再在中段收窄；超过断裂距离后拉断，主体上与水滴上各留一个小尖角，二者快速回缩消失。之后水滴是独立的圆角矩形，可以继续平移（`drift` 横向偏移）。
5. **外观**：填充色、描边色、描边宽度、阴影（`box-shadow` 语法，转成 svg 上的 `drop-shadow()` 链）均可配置；默认值全部来自 `--tx-*` token，暗色 / 高对比主题自动适配。
6. **内容**：主体内容走默认插槽，保持普通 DOM、可交互。每个凸起的内容走作用域插槽，拿到凸起当前的矩形与开合进度；内容随开合从 `blur + 透明` 过渡到清晰（可关闭）。
7. **低层几何可复用**：纯函数 `fusionSurfacePath()`（输入主体尺寸与凸起几何，输出 path `d`）单独导出，core-app 的发送分裂动画直接用它绘制，不必把输入框改造成本组件。
8. **性能**：不使用任何 SVG 滤镜；每帧只写一次 `d` 与内容层的 `transform`，不触发 Vue 重新渲染；静止后停止 rAF。
9. **可访问性与降级**：几何层 `aria-hidden`、`pointer-events: none`；`prefers-reduced-motion: reduce` 时所有过渡直接落到终态（凸起直接出现 / 消失，分裂直接得到两个独立形状）。
10. **注册链与文档**：`components.ts` → `pro/index.ts`（`suite-barrels.test.ts` 守护）→ nexus 侧边栏 `SECTION_ORDER` 与分类脚本 → 组件库画廊格 → `fusion-surface.zh.mdc` + `fusion-surface.en.mdc` → demo（至少：工具栏长出托盘、输入框分裂出一滴）+ `demo-registry.ts`。

## Acceptance Criteria

- [x] `fusionSurfacePath()` 单测覆盖：无凸起时是标准圆角矩形；四条边各自长出；凹圆角半径被凸起高度限制；凸起中心被夹在直边内；同边两个凸起；`detach` 从 0 增大时颈部宽度单调收窄；断裂后输出两个闭合子路径；所有输出不含 `NaN` / `Infinity`。
- [x] 组件单测：挂载后 path 存在且 `aria-hidden`；改 `buds` 后若干帧内 `d` 变化并最终稳定；减少动态效果时一次到位；卸载后没有残留的 rAF。
- [x] 样式契约：没有在 hover 上过渡颜色；所有过渡 / 动画都有 `prefers-reduced-motion` 出口；没有硬编码颜色（全部 `var(--tx-*, fallback)`）；阴影方向遵守库里的单一光源约定（`shadow-light-source.test.ts` 通过）。
- [x] `pnpm -C packages/tuffex` 下该组件测试、`suite-barrels.test.ts`、类型检查通过（组件库全量 247 文件 / 2596 条，check 轮 102 条专项）。
- [x] nexus：`check-doc-translation-parity`、`check-mdc-fences`、`check-demo-registry-orphans`、`tuffex-component-docs-coverage.test.ts` 通过。
- [x] ego-browser 实测 nexus 文档页（亮 / 暗两种主题）：托盘 demo 长出与收回都流畅，连接处凹圆角无缝；分裂 demo 颈缩、拉断、回缩都能看到；逐帧截图留证（`research/verify/`，逐帧采样 path 离线渲染，见 spec tuffex-docs-sync「Frame-driven SVG geometry」）。

## 不做

- 不改 `TxLiquid` / `TxFusion` 的行为与 API。
- 不做任意多边形 / 任意曲线主体，主体只支持圆角矩形。
- 不做拖拽交互（凸起的开合与位置由调用方驱动）。

## 落地记录

- 2026-09-26 提交 `02fd57ba5`（组件 + nexus 文档 + spec）。实现偏差见 design.md §8；复查轮修了水滴关闭压成线、颈缩起步凹口、`springSteps` 异常配置 NaN、重复 id 双内容层、文档过期数字五处。
