# Design — BaseAnchor liquid drop animation

## 1. 边界

新增能力全部收在 `animation.type === 'liquid'` 这一个分支后面。四种既有类型的代码路径一行不动 —— `drip`/`bead` 在 `animateOpen` / `animateClose` 的类型分派中**提前返回**，不落进现有 `if / else if` 链。

新增一个纯模块 `base-anchor-liquid.ts`，承担全部几何、缓动与逐帧驱动；`base-anchor-motion.ts` 只负责把它接进既有的 `runId` / `clearTimeline` / `finishOpen` / `finishClose` 生命周期。SFC 只负责渲染层。

```
TxBaseAnchor.vue          渲染 goo 舞台（SVG defs + 形状 + 阴影孪生），暴露 liquidRef
  └─ base-anchor-motion.ts   分派：type === 'liquid' → 交给 liquid 驱动器
       └─ base-anchor-liquid.ts   纯几何 + cubic-bezier + rAF（不依赖 gsap）
```

## 2. 为什么不走 GSAP

既有四种类型用 GSAP 补间 + GSAP 缓动串（`back.out(2)` / `power3.in`）。liquid 不用，理由有三：

1. 需求要的是 CSS 风格的 `cubic-bezier(a,b,c,d)`，GSAP core 没有对应缓动，得注册 `CustomEase` 插件（仓库未引入）。
2. 每帧要重算 SVG 形状属性、阴影孪生的 rect、以及**每个菜单项**的 opacity —— 这不是补间对象属性，是补间一个标量再派生一整套几何。GSAP 在这里只剩一个 rAF 的价值。
3. "不得出现任何弹簧" —— 自己驱动标量，从结构上就不可能混进弹簧。

代价：多一套 rAF 生命周期要管。用 `clearTimeline()` 统一收口（见 §7）。

## 3. 坐标系

浮层 `.tx-base-anchor` 由 floating-ui 以 `strategy: 'fixed'` + `transform: false` 定位，**它的原点就是面板左上角**。所有几何用「浮层局部坐标」表达：

```
panelLocal   = { x: 0, y: 0, w: panelW, h: panelH }
triggerLocal = { x: refRect.x - floatRect.x,
                 y: refRect.y - floatRect.y,
                 w: refRect.width, h: refRect.height }
```

`refRect` 复用已有的 `readReferenceRect()`（`TxBaseAnchor.vue`），它已经在跟随 reference 移动。

**稿值自洽性验证**（触发器 200×40、`offset=8`、`placement=bottom-start`）：
`triggerLocal.y = -48`。把局部坐标平移到"触发器顶 = 0"的稿子坐标系，局部 `y` 加 48 即得稿值。

| 量 | 通用式（局部坐标） | 稿值（稿子坐标系） |
|---|---|---|
| 上沿起点 `topStart` | `triggerLocal.y + triggerH / 2` = `-28` | `20` = `triggerH/2` ✓ |
| 上沿终点 `topEnd` | `0`（面板自身位置） | `48` = `triggerH + offset` ✓ |
| 高度起点 `seedHeight` | `12`（可配，clamp 到 `panelH`） | `12` ✓ |
| 高度终点 | `panelH`（实测） | `146` ✓ |

`topEnd = 0` 这一点很关键：它天然等于 floating-ui 算出的面板位置，所以 `flip` / `shift` 改变落位时几何自动跟上，不需要任何补偿。

## 4. 进度与缓动

```ts
// 单一进度标量 p，0 = 关闭，1 = 打开
openP  (t) = bezier(0.23, 1,    0.32, 1   )(t)   // t = elapsed / 260
closeP (t) = 1 - bezier(0.25, 0.46, 0.45, 0.94)(t) // t = elapsed / 150
```

`bezier(x1,y1,x2,y2)` 用牛顿迭代 + 二分兜底求 `x(u) = t` 的 `u`，再取 `y(u)`（标准 CSS timing-function 解法）。实现在 `base-anchor-liquid.ts`，纯函数、可单测。

几何是 `p` 的**纯函数**：

```ts
export function geometryAt(p: number, m: LiquidMetrics): LiquidGeometry {
  const peel = easeOutQuad(clamp01(p / DETACH_AT))          // DETACH_AT = 0.45
  const fill = easeOutCubic(clamp01(p))

  const top    = m.topStart + (m.topEnd - m.topStart) * peel
  const height = m.seedHeight + (m.panelH - m.seedHeight) * fill   // ← 直接定义
  return { top, height, bottom: top + height }
}
```

**R4 的两条硬约束落地方式：**

- `height` 由自己的插值式给出，**从不**写成 `bottom - top`。两条边各自独立，不存在交叉夹扁的可能。
- `bottom` 是**派生量**（`top + height`），只用于阴影孪生与菜单项揭示，不反向参与 `height`。

**断裂时刻校验（AC5 / R4）**：`p = DETACH_AT = 0.45` 时
`peel = easeOutQuad(1) = 1` → 上沿已停在 `topEnd`；
`fill = easeOutCubic(0.45) = 1 - 0.55³ = 0.833625` → 高度 `12 + 134 × 0.833625 = 123.71px`（稿值 146 的 84.7%）。
即"颈部断裂那一刻，面板已经长出大半个身子且仍在填充"。

`DETACH_AT` 是 p 空间的阈值，与 p→时间的映射无关，所以这条性质对开/关两条曲线都成立。

## 5. 滤镜链

两条链共享同一组源形状（见 §6），per-instance id 后缀沿用 `TxFusion` 的 `getCurrentInstance()?.uid` 约定。全部标注 `color-interpolation-filters="sRGB"`，否则 linearRGB 下阈值位置会漂。

### 5.1 融合填充 `#tx-ba-liquid-goo-{uid}`

```xml
<filter :id="gooId" filterUnits="userSpaceOnUse"
        :x="region.x" :y="region.y" :width="region.w" :height="region.h"
        color-interpolation-filters="sRGB">
  <feGaussianBlur in="SourceGraphic" :stdDeviation="gooBlur" result="blur"/>
  <feColorMatrix in="blur" type="matrix" :values="thresholdMatrix" result="goo"/>
</filter>
```

`thresholdMatrix = "1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 {a} {o}"`，默认 `a = 20`、`o = -9` → 阈值落在 alpha ≈ 0.45，边缘一像素内完成 0→1，即"硬阈值"。默认 `gooBlur = 4.5`（稿值 stdDeviation）。

**颈部为什么会自己出现**：触发器占 `y ∈ [0, 40]`，面板上沿从 20 走到 48。`p = 0` 时面板块完全落在触发器内部（`y ∈ [20, 32]`）—— 不可见，完全融合。上沿下落时两块之间的间隙拉开，高斯场在左右两端衰减更快（那里"料"更少），于是连接处先从两侧向内收腰，再整体跌破阈值断开。间隙约 `> 1.5 × stdDeviation ≈ 7px` 时断裂，正好落在上沿抵达 `topEnd`（间隙 = `offset` = 8px）前后。**颈部不需要任何显式几何**，这也是必须共用一个滤镜的原因。

`filterUnits="userSpaceOnUse"` + 显式 region（union bbox 外扩 `pad = ceil(gooBlur * 3)`）是必须的，默认的 `-10%/+10%` 会把模糊裁掉，颈部会出现直角截断。

### 5.2 轮廓环 `#tx-ba-liquid-outline-{uid}`

```xml
<filter :id="outlineId" filterUnits="userSpaceOnUse" ... color-interpolation-filters="sRGB">
  <feGaussianBlur in="SourceGraphic" :stdDeviation="gooBlur" result="blur"/>
  <feColorMatrix in="blur" type="matrix" :values="thresholdMatrix" result="goo"/>
  <feMorphology in="goo" operator="erode" radius="1" result="eroded"/>
  <feComposite in="goo" in2="eroded" operator="out" result="ring"/>
  <feFlood :flood-color="outlineColor" result="ink"/>
  <feComposite in="ink" in2="ring" operator="in"/>
</filter>
```

前两步与 5.1 **逐字节相同**，保证腐蚀的输入就是那个合并轮廓本身。`erode 1px` → `out` 取差集 → `feFlood` 灌色 → `in` 裁回环内。产出是一条连续的环：包住触发器、沿颈部延伸、合拢在面板四周。触发器与面板元素本身不带任何 `border` / `outline`（R2 / AC3）。

`outlineColor` 默认 `var(--tx-border-color, #dcdfe6)` —— 仓库里没有 `#DFE2E8` 这个字面值，`--tx-border-color` 是 `#dcdfe6`（ΔRGB = 3/3/2，肉眼等同）且**自带暗色主题值** `#4c4d4f`。用 token 而不是硬编码，暗色下才不会留一条亮灰边。`feFlood` 不接受 `var()`，所以在 JS 里用 `getComputedStyle` 解析 token 后传字面色值，解析失败回落 `#dcdfe6`。

## 6. 分层结构

liquid 激活时，在 teleport 出去的 `.tx-base-anchor` 内额外渲染一个舞台（`v-if="usesLiquidMotion"`）：

```
.tx-base-anchor                          (fixed，原点 = 面板左上角)
├─ .tx-base-anchor__liquid               (absolute，覆盖 union bbox + pad；pointer-events: none)
│  ├─ .tx-base-anchor__liquid-shadow     ← 孪生元素，在滤镜【外】，只负责 box-shadow（R3）
│  └─ svg.tx-base-anchor__liquid-goo     (viewBox = union bbox，坐标 = 浮层局部坐标)
│     ├─ <defs>
│     │   ├─ <g id="shapes-{uid}">       ← 唯一一份源形状
│     │   │    ├─ <rect> 触发器幽灵      (triggerLocal + triggerRadius)
│     │   │    └─ <rect> 面板块          (x=0, y=top(p), w=panelW, h=height(p), rx=panelRadius)
│     │   ├─ <filter id="goo-{uid}">     §5.1
│     │   └─ <filter id="outline-{uid}"> §5.2
│     ├─ <use href="#shapes-{uid}" :filter="url(#goo-{uid})"/>
│     └─ <use href="#shapes-{uid}" :filter="url(#outline-{uid})"/>
└─ .tx-base-anchor__clip / __content      ← 真实面板内容，不透明，压在最上面
```

要点：

- **源形状只写一份**，两条链各 `<use>` 一次。避免两份 DOM 漂移导致填充与描边错位。
- 触发器"可见的填充与文字"就是 reference 插槽里用户自己的 DOM，原地不动、完全不透明 —— goo 舞台只画几何幽灵（R1）。
- **触发器内部必须从填充里挖空（实测修正，两轮）**：goo 层 teleport 到 `<body>` 并带着浮层 z-index，默认会盖住真实触发器（`pointer-events: none` 所以还能点，但文字看不见）。
  - 第一版方案是给 `.tx-base-anchor__reference` 加 `z-index: floating + 1`。在独立 harness 里有效，但在**真实文档页失效** —— `.docs-layout-root` / `.docs-layout-stage` 带 `isolation: isolate`，触发器被封在里面，任何 z-index 都出不去。
  - 定案：在填充那条 `<use>` 上挂一个 `<mask>`，用触发器矩形把内部挖空。真实触发器因此始终透出来，**与层叠上下文无关**。轮廓那条 `<use>` 不挂遮罩，所以环仍然包住触发器。代价：触发器必须自带不透明背景 —— 已写入文档交互契约。
- **幽灵外扩 1px（实测修正）**：幽灵与真实触发器等大时，阈值化只把轮廓外扩约 0.6px，1px 的环有一多半被压在不透明触发器底下，视觉上触发器像没有描边。外扩 1px 后环完整可见。
- 幽灵/面板填充**不保留模糊后的 RGB**，而是 `feFlood` 灌 `--tx-fill-color-lighter` 再 `feComposite in` 裁回阈值形状 —— 与轮廓链同构，且彻底消除非预乘 RGB 在边缘的发灰晕边。`feFlood` 不吃 `var()`，故色值经 `getComputedStyle` 解析成字面量。
- **阴影孪生在 SVG 之外**：一个 `absolute` 的 div，rect 跟随 `top(p)` / `height(p)`，`border-radius: panelRadius`，`box-shadow: 0 10px 26px rgba(0,0,0,0.14)`（与 `TxCard` 的 `is-shadow-soft` 一致）。它在滤镜树外，不会被阈值切成硬边黑板（R3 / AC4）。
- z 序：shadow(0) < goo svg(1) < `__clip`(2)。`__outline`（既有圆角矩形描边）在 liquid 下不渲染，否则双描边（C6）。

## 7. 生命周期接入

`base-anchor-motion.ts` 增加：

```ts
const usesLiquidMotion = computed(() => animationType.value === 'liquid')
```

- `animateOpen` / `animateClose`：在加载 gsap **之前**分派 —— `if (type === 'liquid') return runLiquid(currentRunId, 'open' | 'close')`。
- `runLiquid` 内部：读取 metrics（reference rect、panel 尺寸、triggerRadius、seed）→ 起 rAF 循环 → 每帧算 `geometryAt(p)` → 写形状属性 / 阴影 rect / 菜单项 opacity → 结束时调既有的 `finishOpen` / `finishClose`（保持 `keepAliveContent`、`setMounted`、`setPanelSurfaceMoving` 语义不变）。
- `clearTimeline()` 追加取消 rAF 与清空 liquid 内联样式，`onBeforeUnmount` 已经调它，无需新增拆卸点。
- `isCurrentRun(runId)` 守卫每帧都检查，开→关快速打断时旧循环立即退出。
- `shouldAdaptSurfaceFor`：liquid 返回 `false` —— 面板已经是不透明 `pure`，没有需要降级的毛玻璃。

### 7.1 测量必须逐帧可重跑（实测修正）

原设计让 `prepareLiquid` 一次性测量。浏览器验证时整个轮廓画错了位置：触发器幽灵落在 `(60, 60)` 而非局部 `(0, -48)`，面板宽度是 149 而非 200。

根因：**`@floating-ui/vue` 的 `update()` 返回 `void`，不可 await**。watcher 里的 `await update()` 立即 resolve，此时浮层尚未被定位（仍在视口原点）、`size` 中间件也还没写入 `width: 200px`。既有四种动画不关心绝对几何，所以这个隐患一直没暴露。

修正为：把测量拆成独立的 `measureLiquid()`，由 `applyLiquidFrame` **每帧调用**，用 `(refRect, floatRect, panelW, panelH)` 拼出的签名短路掉未变化的情况（常见路径只多一次 rect 读取）。这同时让舞台在滚动/窗口变化时自动跟随，`refreshLiquidStage` 因此也不再需要 `referenceMoved` 门控。

配套修正：面板 `<rect>` 的 `y` / `height` **不再走模板绑定**。`liquidTrigger` 变化会触发重渲染，Vue 会把绑定的 `height` 重置回 `0`，把动画打断成闪烁。这两个属性只由 `applyLiquidFrame` 逐帧写入。

## 8. 菜单项揭示（R6）

面板块底沿 `bottom = top(p) + height(p)` 就是"水面"。注意方向：**`height` 独立定义，`bottom` 是派生量**，不违反 R4。

打开动画启动时一次性测量条目：

```ts
const items = content.querySelectorAll<HTMLElement>(itemSelector)   // 默认 '[data-liquid-item]'
// 无匹配时回落到卡片内容的直接元素子节点
const marks = [...items].map(el => ({ el, hold: el.offsetTop + el.offsetHeight * 0.5 }))
```

每帧：`el.style.opacity = clamp01((bottom - hold) / ITEM_FADE_SPAN)`（`ITEM_FADE_SPAN = 18px`）。

`hold` 取条目**底边**（实测修正：原设计取中线，浏览器验证发现断裂瞬间条目的下半截会渲染在轮廓之外）。取底边后，面板必须完全容纳该条目才开始淡入，`bottom` 单调保证了任一条目在此之前 opacity 恒为 0（AC8）。关闭时同一套公式反向自然成立，无需第二份逻辑。

## 8.1 `bead`：宽度报告速度（后续追加）

`drip` 与 `bead` 共用 §3–§8 的全部内容 —— 同一个 goo 舞台、同一套两条下落的边、同一张时序表。分歧只有一处：**面板矩形的 `x` / `width`**。

```ts
v      = |Δp| / Δt_normalised        // 线性匀速 == 1.0
ratio  = clamp01(v / beadVelocityRef)  // 默认 ref = 4
pinch  = min(beadPinch, w/2 - 1) * ratio
x      = pinch ;  width = w - 2*pinch
```

要点：

- **按时间线占比归一化**，不是按毫秒。这样同一条曲线在 190ms 和 260ms 下收腰完全一致，也不受刷新率影响。
- **绕中线对称**，所以是缩颈而非侧移。
- **`w/2 - 1` 的下限是必须的**：零宽矩形会整个掉出高斯场，颈部会提前断裂。
- **`dt <= 0` 时沿用上一帧速度**（实测修正）。两个 rAF 可能落在同一个时钟刻度内，此时朴素实现会把速度算成 0，面板闪回全宽一帧。
- **最后一帧强制速度为 0**：运动停止即不再报告速度，面板必然收敛到全宽。
- 因为两条缓动曲线都只减速，收腰天然单调衰减到 0 —— 不需要额外的衰减项。`drip` 就是把 `ratio` 恒定钉在 0 的 `bead`。

## 9. 类型契约

`types.ts`：

```ts
export type BaseAnchorAnimationType = 'transfer' | 'boom' | 'opacity' | 'none' | 'drip' | 'bead'

export interface BaseAnchorAnimationOptions {
  // …既有字段不变…
  /** liquid：goo 高斯模糊半径（feGaussianBlur stdDeviation） */
  gooBlur?: number
  /** liquid：alpha 阈值矩阵的斜率与偏移 */
  gooThreshold?: number
  gooThresholdOffset?: number
  /** liquid：轮廓环颜色，默认取 --tx-border-color */
  outlineColor?: string
  /** liquid：触发器幽灵圆角，默认从 reference 实测 */
  triggerRadius?: number
  /** liquid：面板起始高度种子 (px) */
  seedHeight?: number
  /** liquid：参与逐项揭示的选择器 */
  itemSelector?: string
}
```

liquid 的默认时序**不走** `DEFAULT_ANIMATION`（那里 `duration: 432` / `closeDuration: duration * 0.45` 与 R5 冲突），单独一张表：

```ts
const LIQUID_DEFAULTS = {
  duration: 260,
  closeDuration: 150,                              // ≈ 快 20%
  ease: 'cubic-bezier(0.23, 1, 0.32, 1)',
  closeEase: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
  gooBlur: 4.5, gooThreshold: 20, gooThresholdOffset: -9,
  seedHeight: 12, itemSelector: '[data-liquid-item]',
}
```

`resolvedAnimation` 按 `type === 'liquid'` 选默认表。旧的 `duration` / `ease` prop 仍可覆盖（保持兼容入口语义），但**默认不再继承 432ms**。

`ease` / `closeEase` 在 liquid 下解析为 `cubic-bezier(...)` 字面量；解析失败则回落到内置默认曲线（不接受 GSAP 缓动串，也不接受任何弹簧 —— R5）。

## 10. 降级与边界

| 情况 | 行为 |
|---|---|
| `placement` 为 `left*` / `right*` | liquid 只对纵向轴有定义。横向落位时降级为 `opacity` 路径并保持时序；文档写明。 |
| `showArrow` | liquid 下强制抑制（箭头与颈部语义冲突，C4）。 |
| `panelBackground` 非 `pure` | liquid 下强制走不透明填充；`backdrop-filter` 在滤镜内不生效且会被阈值切成硬边（C2）。 |
| `unlimitedHeight` / `maxHeight <= 0` | 面板高度不可测，沿用既有的"直接落定"分支，不跑 liquid。 |
| `prefers-reduced-motion: reduce` | 直接跳到 `p = 1` / `p = 0` 终态。参照 `TxFloating.vue` 的 `matchMedia` 写法。 |
| SSR / 无 window | `hasWindow()` 守卫；舞台不渲染，走既有落定分支。 |
| Safari / Firefox | **不需要降级**。受限的是 `backdrop-filter: url(#…)`，普通 `filter: url(#…)` 两者都支持（`TxFusion` 同样不做检测，C5）。 |

`.tx-base-anchor__clip` 的 `overflow` 在 liquid 下置 `visible`（C3），否则 goo 模糊被裁，颈部出现直角截断。

## 11. 兼容性

- 纯增量：`BaseAnchorAnimationType` 是联合类型扩展，新增 options 字段全部可选。既有调用方零改动。
- 默认值不变（`animation` 默认 `{}` → `type` 仍解析为 `'transfer'`）。
- `LIQUID_DEFAULTS` 只在 `type === 'liquid'` 时生效，不污染其余四种类型的默认合并。

## 12. 回滚

三处独立、可分别回退：

1. 组件：`git revert` base-anchor 目录的改动 —— 因为是分支内新增，回退不影响既有类型。
2. 文档：回退 `.mdc` + `demo-registry.ts` 一行 + demo 文件。
3. 若只是效果不满意而非坏掉：把 `LIQUID_DEFAULTS` 调参即可，无需改结构（曲线、阈值、模糊、seed 全部可配）。

## 13. 权衡记录

- **rAF 而非 GSAP**：多管一套生命周期，换来 cubic-bezier 原生支持 + 逐帧派生几何 + 结构上不可能混进弹簧。已在 §2 论证。
- **`<use>` 复用源形状 而非 两份 DOM**：`<use>` + `filter` 在旧 WebKit 有过 bug，但当前目标浏览器（Electron 40 / 现代浏览器）无问题，换来填充与描边永不错位。
- **强制 `pure` 而非 支持全部 background**：牺牲了 liquid + 毛玻璃的组合，但那个组合在物理上就不成立（C2）。
- **横向 placement 降级而非全轴支持**：全轴泛化要把"上沿/高度"抽象成"主轴前沿/主轴延展"，代码复杂度翻倍，而 liquid 的语义（一滴水落下来）本身就是纵向的。
