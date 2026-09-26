# Design — 共享果冻指示器引擎

## 边界

```
测量（各组件自己）──► moveTo(rect) ──► 引擎（弹簧 + 冲击 + 相位 + 形变）──► 响应式状态 / onFrame(frame)
                                                        │
                                   jellyScale（材质，已共享）◄┘
```

- **引擎不碰 DOM**：不测量、不写 style、不监听 pointer。它只接收"目标矩形"和"拖拽样本"，产出"当前矩形 + 形变"。这样 Radio（querySelector 测量）、Tabs（nav 滚动坐标）、TabBar / SidebarNav（`useIndicatorBox`）、FlatRadio（`readGeometry`）都能接，而不必统一测量方式。
- **材质不动**：`jellyScale` 的公式与 `JELLY` 现有数值保持原样（`jelly.test.ts` 不改断言）。

## 文件

| 文件 | 改动 |
| --- | --- |
| `packages/tuffex/packages/utils/animation/jelly.ts` | `JellyScaleInput` 增加可选 `travelAxis`（默认 `'x'`，结果与现在逐位相同）；`JELLY` 追加 Radio 里散落的数（见下）；新增 `jellySpring(durationMs)` |
| `packages/tuffex/packages/utils/use-jelly-indicator.ts`（新） | 引擎 composable，与 `use-indicator-box.ts` 并列 |
| `packages/tuffex/packages/utils/index.ts` | `export * from './use-jelly-indicator'` |
| `packages/tuffex/packages/components/src/radio/src/radio-group-indicator.ts` | 在引擎上重写：保留测量、各层样式、暗色检测、拖拽选中与键盘；运动全部交给引擎 |
| `packages/tuffex/packages/utils/__tests__/use-jelly-indicator.test.ts`（新） | 引擎单测 |

## 材质按轴映射

`jellyScale` 目前把"行进中"的形变写死为 `scaleX = 1 − s·0.35`、`scaleY = 1 + s·0.6`（水平行进：沿行进方向变薄，垂直方向鼓起）。新增 `travelAxis`：

- `'x'`（默认）：与现在完全相同。
- `'y'`：同一形变转置，`scaleY = 1 − s·0.35`、`scaleX = 1 + s·0.6`。

冲击（`impactAxis`）本来就按轴计算，不变。

## `JELLY` 追加项（数值取自 Radio 现状，只是搬家）

| 键 | 值 | 原位置 |
| --- | --- | --- |
| `travelEmergeScale` | 1.06 | `activeScale` 里 emerge 分支 |
| `travelScale` | 1.03 | `activeScale` 里行进分支 |
| `travelEmergeMs` | 170 | `startMotion` 的 `setMotionPhase('emerge', 170)` |
| `emergeStiffnessScale` | 0.62 | `stepMotion` 的 `phaseStiffnessScale` |
| `sizeStiffnessScale` | 1.12 | 宽高弹簧的 `* 1.12` |
| `heldStiffness` / `heldDamping` | 112 / 9 | `stiffnessDrag` / `dampingDrag` |
| `rigidFollow` | 34 | 非弹性分支的 `follow` |
| `rigidSettleDistance` | 0.35 | 非弹性分支的停稳阈值 |
| `rigidSinkMs` | 18 | 非弹性分支的 `settleMotion(18)` |
| `maxFrameS` | 0.024 | `dt` 上限（Slider 的 `MAX_FRAME_S` 同值；Slider 不在本次范围，不改它） |

## 按时长缩放

（实现时加了内部下限 `JELLY_MIN_MS = 100`：每帧只积分一步、`dt` 上限 24ms，时长短于约 78ms 的弹簧会发散；短于下限的时长按 100ms 播放。）

```ts
export const JELLY_REFERENCE_MS = 350
export function jellySpring(durationMs = JELLY_REFERENCE_MS): { stiffness: number, damping: number }
// f = JELLY_REFERENCE_MS / durationMs
// stiffness = JELLY.stiffness · f²，damping = JELLY.damping · f
```

弹簧在时间轴上整体缩放：固有频率 ∝ f，阻尼比 ζ = c / (2√k) 不变，所以"同一种果冻，只是更快或更慢"。350 取自 TxTabs `animation.indicator.durationMs` 的默认值，默认时长正好得到 110 / 12。非正数或非有限值回落到默认。

## 引擎 API

```ts
export interface JellyRect { x: number, y: number, width: number, height: number }
export type JellyPhase = 'idle' | 'emerge' | 'sink'
export interface JellyDeform { along?: number, across?: number }

export interface UseJellyIndicatorOptions {
  axis?: MaybeRefOrGetter<JellyAxis | undefined>           // 默认 'x'
  elastic?: MaybeRefOrGetter<boolean | undefined>          // 默认 true
  stiffness?: MaybeRefOrGetter<number | undefined>         // 默认 JELLY.stiffness
  damping?: MaybeRefOrGetter<number | undefined>           // 默认 JELLY.damping
  deform?: MaybeRefOrGetter<number | JellyDeform | undefined> // 默认 1（= Radio）
  maxGrowth?: MaybeRefOrGetter<number | undefined>          // 每轴最多长大多少 px；默认不限（= Radio）
  onSettle?: () => void
  onFrame?: (frame: JellyIndicatorFrame) => void
}

export interface JellyIndicatorFrame {
  visible: boolean
  rect: JellyRect
  scaleX: number
  scaleY: number
  moving: boolean
  phase: JellyPhase
}

export interface UseJellyIndicatorReturn {
  visible, rect, target, velocity, impact, impactAxis, phase, dragging, reducedMotion   // Readonly<Ref<…>>
  moving: ComputedRef<boolean>                 // dragging || 动画中
  scale: ComputedRef<JellyScale>               // 按 options.elastic
  scaleFor: (elastic: boolean) => JellyScale   // Radio 的 glass 层恒为弹性
  moveTo: (rect: JellyRect | null, options?: { animate?: boolean }) => void
  grab: () => void
  drag: (rect: JellyRect, velocity: { x: number, y: number }, options?: { atEdge?: boolean }) => void
  release: (kick?: { x: number, y: number }) => void
  stop: () => void
}
```

### `moveTo` 语义

| 情况 | 行为 |
| --- | --- |
| `rect === null` | 隐藏：停止动画，`visible = false` |
| 之前不可见（首次测量或从隐藏恢复） | 直接落位，不起步放大 |
| `animate: false` 且当前静止 | 直接落位（尺寸变化、字体加载、类型切换） |
| `animate: false` 但正在动画 / 拖拽 | 只更新目标，弹簧继续（不在半路瞬移） |
| `animate: true` 且目标与当前差距都在 `settleDistance` 以内、且静止 | 空操作（避免 Radio 现在"原地起步放大一帧"的闪动） |
| `reducedMotion` 为真 | 一律直接落位 |
| 其余 | 设目标，启动弹簧（emerge `travelEmergeMs`） |

### 运动循环（逐行搬自 `radio-group-indicator.ts` 的 `stepMotion`）

- 拖拽中：速度按 `velocityDecay` 衰减，冲击按 `impactDecayHeld` 衰减，宽高速度按 held 弹簧计算（与现状一致，位置由 `drag()` 直接写）。
- 非弹性：指数跟随 `rigidFollow`，冲击恒 0，差距 < `rigidSettleDistance` 时落位并以 `rigidSinkMs` 收尾。
- 弹性：emerge 相位刚度乘 `emergeStiffnessScale`，宽高刚度乘 `sizeStiffnessScale`；越过目标（前后两帧差值异号）且速度 > `reversalSpeed` 时按行进方向记冲击；停稳条件同现状，以 `sinkMs` 收尾。
- 收尾：进入 sink 相位、状态全部就绪后**最后**调 `onSettle`（Radio 在此提交待定值；回调里再 `moveTo` 不会被紧接着取消），`sinkMs` 后结束动画。收尾定时器由引擎持有，新的一次运动开始时清掉——修掉"上一次 sink 的定时器在新一次运动途中把 `isAnimating` 置 false"的竞态（浏览器实测：旧版一次点击因此整趟行进都没有拉伸）。
- **直接落位也算到达**：首次测量、`animate: false`、reduced-motion 的落位同样调用 `onSettle`（检查阶段发现：否则 `updateOnSettled` 的待定值在这些路径上永远不提交，v-model 不更新）。每趟行进仍只调一次。

### 形变

```
baseScale  = 不可见 ? 1 : 拖拽 ? JELLY.heldScale : emerge ? travelEmergeScale : 动画中 ? travelScale : 1
phaseScale = 未动画 ? 1 : emerge ? JELLY.emergeScale : sink ? JELLY.sinkScale : 1
raw        = jellyScale({ speed: hypot(v.x, v.y), impact, impactAxis, travelAxis: axis, elastic, moving, dragBoost, baseScale, phaseScale })
scaleAlong = 1 + (raw.along − 1) · deform.along ；scaleAcross = 1 + (raw.across − 1) · deform.across
reducedMotion → { 1, 1 }
```

`deform` 为数字时两轴同值；默认 1，即 Radio 现状。

`maxGrowth`（px）按当前矩形尺寸把"放大"那一侧夹住：`scale ≤ 1 + maxGrowth / size`，缩小不夹。材质是按比例的，同一个 1.36 的鼓起在 28px 高的 Radio 胶囊上是 +10px，在 200px 宽的 SidebarNav 行高亮上就是 +72px，直接冲出容器；按像素封顶让大块指示器与小胶囊"长大得一样多"。Radio 不传（不限），行为不变；各接入方的取值在各自子任务里用浏览器目测定。

### reduced-motion

拖拽松手时若处于 reduced-motion，形状停在松手处，等宿主下一次 `moveTo()`（不带速度滑行）。引擎在 `onMounted` 里订阅 `matchMedia('(prefers-reduced-motion: reduce)')`，在 `onBeforeUnmount` 退订；偏好切到 reduce 时若正在动画，立即落到目标并收尾。setup 阶段不访问 `window`（SSR 安全，与 `liquid/src/use-reduced-motion.ts` 同形）。

### 两种输出

- 响应式：`rect` / `scale` / `phase` / `moving` 等 ref，Radio 的模板绑定照旧。
- 命令式：`onFrame(frame)` 在每一帧步进结束、以及每次直接落位后同步调用一次。TxTabs 是渲染函数组件，每帧重跑 `renderTabs()` 会重新求值插槽，只能走这条路；TabBar / FlatRadio / SidebarNav 也走这条路，避免每帧重渲染整个组件。命令式写入的元素上**不要**再有同名属性的 `:style` 绑定（否则重渲染会覆盖，见记忆 "Vue :style undefined CSS var wipes imperative writes"）。

## Radio 迁移

`useRadioGroupIndicator` 保留原签名与返回值（`TxRadioGroup.vue` 不改或只改一行），内部：

- `updateIndicator(animate)`：测量逻辑不变，最后调 `engine.moveTo(rect, { animate })`；`watch(modelValue)` 与拖拽结束传 `true`，挂载、`resize`、`watch(type)` 传 `false`。
- 各层样式从 `engine.rect` / `engine.scaleFor(...)` / `engine.phase` / `engine.moving` 计算；`glassInnerStyle`（速度 / 400 的内层高光）读 `engine.velocity` / `engine.impact`，公式不变。
- 拖拽：`onPointerDown` → `engine.grab()`；`onPointerMove` 计算夹紧后的矩形与指针速度 → `engine.drag(rect, v, { atEdge })`；`endDrag` 选中最近按钮后 → `engine.release(lastPointerVelocity)`，再 `queueUpdateIndicator(true)`。
- `commitPendingModelValue` 作为 `onSettle` 传入。
- 可观察差异（有意为之，不算手感变化）：挂载 / 窗口缩放不再原地起步放大一帧；settle 定时器竞态修复。

## 兼容性与回滚

- 对外 API 只增不改：`jellyScale` 新字段可选，`JELLY` 只追加键，utils 新增导出。
- 回滚：还原 `radio-group-indicator.ts` 与 `jelly.ts`，删除新文件即可；其它子任务依赖本引擎，需一并回滚。

## 实现记录（2026-09-26）

- `JellyIndicatorFrame.rect` 类型为 `Readonly<JellyRect>`：它就是引擎状态本身，不复制，宿主只读。
- `stop()` 会补发一次静止帧；卸载后不再回调 `onFrame`。
- 既有问题（未在本任务修）：`TxRadioGroup.vue:55` 的 `props.updateOnSettled ?? …` 因 Vue 把未传的 boolean prop 转成 `false` 而从不生效，glass / blur 实际从未默认开启 `updateOnSettled`，radio 文档的说法与实际不符；`radio-group-indicator.ts` 在 `onMounted` 的 `await nextTick()` 之后才注册 `resize`，同 tick 内卸载会泄漏该监听；Radio `stiffness` / `damping` 传极端值会发散。
- **墙（`bounds`，家族接入时加的可选项）**：`maxGrowth` 管不住弹簧的位置过冲，实测在容器两端冲出 11–14px（TabBar line 落地铺开 30px），`overflow: hidden` 的外框会切出硬边。`bounds` 给出沿行进轴的容器范围：越墙即停在墙上、速度清零，按越过落点的同一公式记一次挤压；目标在墙外时墙让到目标处。Radio 不传，手感不变。浏览器往返测量（首 → 末 → 首）四个接入方画出的范围都在容器内。

## 修订：滑行材质（2026-09-26）

- **起因**：Tabs 家族接入果冻后，评审否决——"tabs 这些动效还是怪怪的，不够丝滑、简单"。果冻的相位是离散的整体缩放（出发时 1.06 × 1.08 ≈ 1.145 的一下弹起、落地时 0.97 的一下下沉），拉伸又随速度饱和（沿行进方向 −21%、垂直方向 +36%），形状在帧与帧之间跳变，tab 的 pill 途中变成高胶囊；`maxGrowth` / `deform` 只压得住幅度，压不住跳变。
- **引擎新增 `material: 'jelly' | 'glide'`**（默认 `jelly`，Radio 不变）。`glide`：沿行进方向的两端各走一根弹簧——领先端走滑行弹簧，落后端走同一根弹簧按 `1 − lag / 2` 时间缩放的慢放版；哪一端领先按每趟起止的中心决定；垂直方向的位置与尺寸跟随领先弹簧。只改位置和尺寸：`scaleFor` 恒为恒等，没有 emerge / sink 相位，停稳即 `settle(0)`；墙夹住要越界的那一端。
- **积分器注入**：新选项 `integrate: JellySpringStep`，滑行宿主传入 `springSteps`（`components/src/liquid/src/spring.ts`，按 1/240 s 分步）——utils 的构建 rootDir 是 utils，不能反向引用 components。不传时滑行在下一帧直接落位。这也消解了"指示器不走 springSteps"的例外：滑行就是 springSteps，只有 Radio 的果冻保留自带积分器。
- **`jelly.ts` 新增**：`GLIDE = { stiffness: 420, damping: 38, lag: 0.45 }`；`timeScaleSpring(spring, durationMs, referenceMs)`，`jellySpring` 改为委托给它。
- **选项归属**：`stiffness` / `damping` / `elastic` / `deform` / `maxGrowth` 只作用于 `jelly`；`glide` / `integrate` 只作用于 `glide`；`bounds` / `onSettle` / `onFrame` 两者通用。
- **测试**：`use-jelly-indicator.test.ts` 新增 5 例滑行用例（途中拉长再收拢且从不缩放、领先端随方向互换、墙夹住端点并让位给墙外目标、reduced-motion 直接落位、不传 `integrate` 时落位），果冻用例不变。
