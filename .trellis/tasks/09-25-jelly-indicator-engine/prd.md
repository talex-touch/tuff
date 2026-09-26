# tuffex 共享果冻指示器引擎（从 Radio 抽出，Radio 迁移）

父任务：`09-25-tuffex-jelly-indicator-polish`。本子任务是 `09-25-tabs-indicator-redo` 与 `09-25-indicator-family-jelly` 的前置。

## Goal

老板（2026-09-25，截图 #1）："indicator 那种果冻动效也没从 radio 提出来"。把 `TxRadioGroup` 按钮组指示器的**运动引擎**抽成 tuffex 的共享能力，任何"一块形状在兄弟元素之间移动"的指示器都能接入，并与 Radio 呈现同一种果冻材质。Radio 本身迁移到共享引擎上，点击 / 拖拽 / 键盘手感不变。

## 现状（已核实）

- 形变**材质**已共享：`packages/tuffex/packages/utils/animation/jelly.ts`（`jellyScale` + `JELLY` 调参表），Slider 拇指（`slider/src/use-thumb-jelly.ts`）已在用；`utils/__tests__/jelly.test.ts` 钉住了数值。
- **运动引擎**仍在 `packages/tuffex/packages/components/src/radio/src/radio-group-indicator.ts`（743 行）里，与 Radio 的 DOM 绑死：
  - 弹簧追踪 x / y / width / height（刚度 / 阻尼 110 / 12，`dt` 上限 24ms）、非弹性模式的指数跟随（`follow = 34`）；
  - 越过目标时按速度记"冲击"（`reversalSpeed` / `reversalImpactScale`），冲击按帧衰减；
  - emerge（起步放大）/ sink（落地轻压）两个相位与 `activeScale`（1.06 / 1.03 / held 1.08）；
  - 拖拽：按住放大、跟手、撞边冲击、松手带速度回弹；
  - 停稳回调（Radio 在此提交 `updateOnSettled` 的暂存值）。
- 测量方式各组件不同：Radio 自己 `querySelector('.tx-radio.is-checked')`（padding-box 原点）；TabBar / SidebarNav 用 `utils/use-indicator-box.ts`；FlatRadio 自带 `readGeometry`；Tabs 在 `applyPointerFor` 里自己算（含 nav 滚动偏移）。

## Requirements

- R1 共享引擎只负责"运动与形变"，不负责测量与绘制：输入一个目标矩形（容器坐标），输出当前矩形、速度、冲击、相位与形变缩放；接入方自己测量、自己决定画成什么样。
- R2 材质一致：形变仍由 `jellyScale` 计算，`JELLY` 数值不变；Radio 里散落的魔数（emerge 起步 1.06、行进中 1.03、非弹性跟随 34、非弹性停稳 18ms 等）收进共享调参表，不再各写一份。
- R3 形变按行进轴映射：水平行进时结果与现在的 Radio 完全一致；竖直行进时同一材质旋转 90°（沿行进方向变薄、垂直方向鼓起），供 SidebarNav / 竖向 Tabs 使用。
- R4 形变强度可按轴调节（沿行进轴 / 垂直行进轴），并可按像素给"长大"封顶，让满宽的行高亮（SidebarNav）、竖向 Tabs 的整行高亮不会因为按比例鼓起而冲出容器；默认强度与不封顶 = Radio 现状。
- R5 弹簧刚度 / 阻尼可配置；提供"按时长缩放"的换算，让已有的时长类 prop（Tabs `animation.indicator.durationMs`、SidebarNav `indicatorDuration`）继续有意义：默认时长对应现在的 Radio 弹簧，时长越短弹簧越快、阻尼比不变。
- R6 首次测量、以及非用户触发的重新测量（容器尺寸变化、字体加载）直接落位，不从容器边缘滑入、不做起步放大；用户触发的切换才走弹簧。
- R7 `prefers-reduced-motion: reduce`：切换直接跳到目标，无形变、无放大；偏好在运行中变化时即时生效。
- R8 两种输出方式：响应式状态（供模板绑定，Radio 现有写法）与逐帧回调（供命令式写 style，避免每帧重渲染整个组件，TxTabs 这类渲染函数组件必需）。
- R9 SSR 安全：setup 阶段不访问 `window` / `matchMedia` / `requestAnimationFrame`；卸载时取消 rAF、定时器与监听。
- R10 从 `packages/tuffex/packages/utils/index.ts` 导出，类型完整。
- R11 Radio 迁移：`radio-group-indicator.ts` 改为在引擎上实现，只保留 Radio 自己的测量、各层样式（outline / glass / blur / plain / hit）、暗色检测、拖拽选中最近按钮与键盘逻辑；对外 props / 事件 / 类名 / DOM 结构不变。

## Acceptance Criteria

- [ ] 引擎单测覆盖：首次落位不动画；弹性模式越过目标并回弹后停稳、`onSettle` 只调一次；非弹性模式无越过；竖直轴形变是水平轴的转置；按轴强度与像素封顶生效；reduced-motion 直接跳且形变为恒等；拖拽 API（按住放大、跟手、撞边冲击、松手回弹）；卸载后不再有 rAF 回调；按时长缩放的换算在默认时长下等于 110 / 12。
- [ ] `utils/__tests__/jelly.test.ts`、`radio/__tests__/radio.test.ts`、`radio/__tests__/radio-group-indicator.test.ts`、`slider/__tests__/slider.test.ts` 不改断言全部通过。
- [ ] ego 浏览器里 Radio 的 solid / outline / blur / glass 四种指示器点击切换、拖拽、键盘切换与迁移前观感一致（录帧对比：行进中变窄变高、越过落点横向挤压、sink 后静止）。
- [ ] tuffex `vue-tsc`（改动文件）、eslint（在 `packages/tuffex` 内运行）、`git diff --check` 通过。

## Out of Scope

- 其它组件接入（见 `09-25-tabs-indicator-redo`、`09-25-indicator-family-jelly`）。
- 调整 `JELLY` 数值或 Radio 的视觉。
- Slider 拇指改用引擎（它不追踪目标矩形，只共享材质，保持现状）。
