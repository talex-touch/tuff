# TxTabs 指示器重做 + 画廊变体展示

父任务：`09-25-tuffex-jelly-indicator-polish`。**依赖** `09-25-jelly-indicator-engine` 先落地。

## Goal

老板（2026-09-25，截图 #2）："tabs 有点问题，indicator 你可以重做一下，这里也没有变体"。TxTabs 的指示器改由共享果冻引擎驱动，各变体重新设计成干净、同族的样子；画廊 Tabs 格子能看到变体和图标。

## 现状（已核实）

- 双重高亮：激活的 `TxTabItem`（`tabs/src/TxTabItem.vue`，`fake-background` + `--fake-color: var(--tx-fill-color)`）自己画灰底，指示器再在下面画一条线；只有 `block` / `outline` 变体会把项底色清掉（`TxTabs.vue:1073–1077`）。
- 动效：`applyPointerFor`（`TxTabs.vue:410–510`）直接写 `transform` / 宽高并靠 CSS transition 移动，外加 `tx-tabs-pointer-{stretch,warp,glide,snap,spring}-{x,y}` 关键帧硬拉伸与落地后的 glow；不是弹簧，没有果冻。
- 变体语义与 TabBar 不一致：Tabs 的 `pill` 是一条 6px 粗线，而 TabBar 的 `pill` 是项背后的凸起面（`tab-bar/src/types.ts` 注释说两者"同名同族"）。
- 图标不显示：`.tx-tab-item__icon` 是行内 `span`，里面的 `<i class="i-carbon-*">` 仍是 `display: inline`，宽高不生效，尺寸为 0（ego 实测 `getBoundingClientRect` 0×0），只剩 flex `gap` 留下的 8px 空白。TabBar 的图标能显示，是因为它的图标容器是 flex。
- 画廊 Tabs 格子（`DocsComponentsGallery.vue:2206–2233`）只放了默认 `line`。

## Requirements

- R1 去掉双重高亮：`showIndicator` 为真时，激活项不再画自己的底色，只改文字 / 图标颜色；指示器是唯一的选中高亮。`showIndicator` 为假时保留激活底色作为唯一选中提示。非激活项 hover 反馈保留（即时，不过渡颜色）。
- R2 指示器改由共享引擎驱动：点击 / 键盘 / `v-model` 切换时按果冻材质移动（行进中形变、越过落点挤压、回弹后静止）——键盘切换现在不会主动驱动指示器，要补上；首次渲染与尺寸变化直接落位（现在实测首帧会从导航左上角滑入，一并修掉）；竖向（left / right）按竖直轴映射形变；`line` 压在导航与内容的分隔线上（nav 被撑高时也一样）。
- R3 变体重新设计（名字不变）：
  - `line`：细线贴在导航与内容的分隔线上，长度对齐标签内容（图标 + 文字），竖向时贴导航外侧边；
  - `pill`：项背后的凸起面（与 TabBar `pill`、FlatRadio 拇指同族），语义从"粗线"改为"凸起面"；
  - `block`：项背后的主色浅染（无阴影）；
  - `outline`：项外的一圈主色 ring（inset，不用 border）；
  - `dot`：标签下方（竖向为左侧）的小圆点。
  各变体亮 / 暗主题都成立，颜色只用 `--tx-*` token，阴影走 `--tx-elevation-*`。
- R4 旧 API 运行时继续有效：
  - `indicatorVariant` 五个取值照收；
  - `indicatorMotion`（stretch / warp / glide / snap / spring）映射为不同的弹簧与形变强度，而不是关键帧；`indicatorMotionStrength` 调形变强度（0 = 只移动不形变）；
  - `animation.indicator`：`false` / `enabled: false` 直接落位；`durationMs` 按时长缩放弹簧；`easing` 对弹簧行进不再生效（文档注明）；
  - `offset`、`showIndicator`、`placement`、`borderless`、`nav-right` 插槽、`expose` 的方法不变；
  - 组件根上的状态类（`tx-tabs--indicator-*`、`tx-tabs--motion-*` 等）保留，外部样式不失效。
- R5 修复 `TxTabItem` 图标：任何宿主下 `iconClass` 图标都有尺寸并与文字垂直居中，不依赖宿主图标 CSS 是否带 `display`。
- R6 `prefers-reduced-motion: reduce` 下切换直接落位、无形变。
- R7 画廊 Tabs 格子：能在格内切换并看到各变体（画廊里还没有这种写法，新增；reset 按钮照常），图标正常显示；暗色下好看、不溢出格子。
- R8 文档同步（`tabs.zh.mdc` / `tabs.en.mdc` + 相关 demo）：变体说明、`pill` 语义变化、`indicatorMotion` / `animation.indicator` 的新含义；用户可见改动配 demo。

## Acceptance Criteria

- [ ] ego 浏览器（暗 + 亮）：base-suite 画廊 Tabs 格子各变体截图；录帧确认切换时的果冻形变与落位；图标可见；无双重高亮。
- [ ] Tabs 文档页各 demo（含 `TabsIndicatorVariantsMotionsDemo`）五种变体 × 五种 motion 可用，竖向 placement 正常。
- [ ] core-app 与 Nexus 其它 TxTabs 用法（research/tabs.md §1 清单）渲染正常，抽查截图（`pages/store.vue` 的 tab 条可能因异步包装本来就为空，先确认现状再判断）。
- [ ] `tabs/__tests__/tabs.test.ts` 更新后通过（与关键帧 / CSS transition 绑定的断言改为断言引擎驱动的结果），覆盖：首次落位不动画、切换走引擎、reduced-motion 直接落位、无双重高亮、图标容器可定尺寸。
- [ ] tuffex eslint（包内运行）、改动文件类型检查、`git diff --check` 通过；Nexus 门禁 `check-demo-registry-orphans` / `check-mdc-fences` / `check-doc-translation-parity` 通过。

## Out of Scope

- 改变 `indicatorVariant` 默认值（仍为 `line`，core-app 多处依赖默认）。
- 拖拽选择。
- 内容区切换动画（`animation.content`）与尺寸动画（`animation.size`）。
