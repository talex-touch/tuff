# TabBar / FlatRadio / SidebarNav 接入果冻指示器

父任务：`09-25-tuffex-jelly-indicator-polish`。**依赖** `09-25-jelly-indicator-engine` 先落地。

## Goal

老板（2026-09-25，截图 #1 + 问答）：Radio 那种果冻指示器要从 Radio 提出来，并接入 **TabBar、FlatRadio、SidebarNav**。三个组件的滑动指示器改由共享引擎驱动，与 Radio 呈现同一种材质：移动中形变、越过落点挤压、回弹后静止。

## 现状（research/indicator-family.md）

- 三个组件都是"测量 → 响应式 `:style` → CSS transition"：
  - TabBar（`tab-bar/src/TxTabBar.vue`）：`useIndicatorBox` 测量，写 `translate` / `translateX` + 宽（pill / block 还有高），过渡 0.26s 回弹曲线；
  - FlatRadio（`flat-radio/src/TxFlatRadio.vue`）：自带 `readGeometry`（只算 x / width，只观察容器），写 `translateX` + 宽，高度交给 CSS，过渡 0.26s 回弹曲线；
  - SidebarNav（`sidebar-nav/src/TxSidebarNav.vue`）：`useIndicatorBox` 测量，**写 `top` / `height`**，横向由 CSS `left/right: 0` 撑满；高亮块**先跟悬停、再回到选中项**；`indicatorDuration`（默认 220ms）控制过渡时长；ease-out 不回弹。
- 减弱动效各不相同：TabBar / FlatRadio 保留淡入去掉位移，SidebarNav 全去掉。
- 消费方：TabBar 只在 Nexus（画廊、2 个 demo，外框都是 `overflow: hidden`）；FlatRadio 在 core-app（StoreHeader、`TuffBlockFlatRadio` → 语言 / 语音设置页）、tuffex 内部（`TxFineTuneCard`、`TxIconPickerPanel`）与大量 Nexus 模板 / demo；SidebarNav 只在 Nexus。没有调用方覆盖指示器的时长 / 缓动变量，也没人传 `indicatorDuration`。
- **`TxFineTuneCard.vue:341–357`** 以 0,3,0 特异度覆盖了 FlatRadio 指示器的 `transition`（transform / width 0.3s）——改成逐帧写入后它会把每一帧再过渡一遍，必须撤掉；其文档 `fine-tune-card.{en,zh}.mdc` 称"卡片不覆盖任何动效"与代码不符，一并改正。

## Requirements

- R1 三个组件的指示器改由共享引擎驱动：用户触发的切换（点击、方向键、`v-model`、SidebarNav 的悬停 / 焦点移动）走弹簧 + 果冻；首次渲染、容器 / 子项尺寸变化直接落位，不从边缘滑入。
- R2 形变按行进轴映射（TabBar / FlatRadio 水平，SidebarNav 竖直），并按像素封顶，指示器不冲出自己的容器、不被 Nexus 外框（`overflow: hidden`）切出硬边：
  - TabBar `pill` / `block` 的鼓起不超过内缩留白；`line` / `dot` 为细小元素，按比例即可；
  - FlatRadio 拇指鼓起与 Radio 胶囊观感一致，不被轨道或外层裁切；
  - SidebarNav 整行高亮横向几乎不鼓起，只在行进方向上形变。
- R3 SidebarNav 的悬停跟随保持灵敏：弹簧由 `indicatorDuration` 按时长缩放（默认 220ms 比 Tabs 的默认更快），指针快速扫过多行时高亮连贯追随、不拖泥带水。
- R4 公开 API 不变：TabBar `indicator` / `size`、SidebarNav `indicatorDuration` / `refreshIndicator()`、FlatRadio 全部 props 与 `TxFlatRadioContext`；类名 `.tx-tab-bar__indicator.is-{variant}`、`.tx-flat-radio__indicator`、`.no-transition`、`.tx-bui-sidebar-nav__indicator.is-revealed` 保留；`--tx-flat-radio-indicator-bg` / `-shadow` / `-track-bg` 等绘制变量照常生效。行进时长 / 缓动变量（`--tx-tab-bar-indicator-duration/-ease`、`--tx-flat-radio-duration/-ease`，均未文档化、仓库内无人覆盖）不再参与行进，文档注明。
- R5 `prefers-reduced-motion: reduce`：直接落位、无形变；TabBar / FlatRadio 保留淡入。
- R6 性能：指示器逐帧写 style，不引起所在组件每帧重渲染；这些属性上不再有 CSS transition（含 `TxFineTuneCard` 的覆盖）。
- R7 文档同步：`tab-bar` / `flat-radio` / `sidebar-nav` / `fine-tune-card` 的 zh + en 页中关于指示器移动、减弱动效、测量方式与测试覆盖的段落；用户可见改动配 demo（可复用现有 `TabBarIndicatorDemo` 等并补充说明）。

## Acceptance Criteria

- [ ] ego 浏览器（暗 + 亮）：base-suite 画廊 TabBar（pill + line）、FlatRadio（三行）、SidebarNav 格子，以及三个组件的文档页 demo 与至少两个 Nexus 模板（如 `TemplateShellDemo`、`TemplateSettingsDemo`）切换录帧：果冻形变、落位、无裁切硬边、无重复过渡造成的拖尾；SidebarNav 快速扫过多行时追随连贯。
- [ ] core-app：设置页语言 / 语音识别的 `TuffBlockFlatRadio`、商店头部 FlatRadio 渲染与切换正常（core-app dev 或无头截图）。
- [ ] `prefers-reduced-motion: reduce` 模拟下直接落位、无形变。
- [ ] 测试：`tab-bar` / `flat-radio` / `sidebar-nav` / `fine-tune-card` / `context-cards-motion` 相关单测更新后通过（与 CSS transition 绑定的断言改为断言引擎驱动的落点）；`shadow-light-source`、`unscoped-deep-selectors` 通过；`audit:size` 不超限。
- [ ] tuffex eslint（包内）、改动文件类型检查、`git diff --check`、Nexus 三个文档门禁通过。

## Out of Scope

- 给这三个组件增加拖拽选择。
- FlatRadio 改用 `useIndicatorBox`（保持自带测量；`use-indicator-box.ts` 里"FlatRadio 共用它"的过时注释不在本任务范围）。
- TxSegmentedSlider。
