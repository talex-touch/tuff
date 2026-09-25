# 设计：TxFusionSurface（路径型融合表面）

## 1. 边界

```
packages/tuffex/packages/components/src/fusion-surface/
  index.ts                   # withInstall + 具名导出几何函数与类型
  src/types.ts               # FusionEdge / FusionBud / FusionSurfaceProps / 几何输入输出类型
  src/geometry.ts            # 纯函数：fusionSurfacePath()，无 Vue、无 DOM
  src/driver.ts              # 每实例一个 rAF 驱动：弹簧推进 → 写 path d 与内容层 transform
  src/TxFusionSurface.vue    # 组件：测量、插槽、把 props 目标交给 driver
  __tests__/geometry.test.ts
  __tests__/fusion-surface.test.ts
  __tests__/fusion-surface-style.test.ts
```

- 几何与驱动分开：core-app 的发送分裂动画只用 `geometry.ts`（+ 共享弹簧积分器），自己画覆盖层；组件用同一份几何。
- 弹簧：沿用 `liquid/src/spring.ts` 的 `presets`（`snappy` / `smooth` / `bouncy`，规范 `tuffex-text-motion.md` 要求全库同一套曲线）。该模块目前只有「把弹簧编译成 CSS `linear()`」，没有保留速度的逐帧积分；`TxLiquid` 的积分器是 `observer.ts` 里的私有函数（上游移植文件，要求保持可 diff）。做法：在 `spring.ts` 新增导出 `springSteps(position, velocity, target, config, dt)`（半隐式欧拉，按 ≤1/60s 子步长推进，与 `observer.ts` 同一算法），组件和 core-app 都用它；`observer.ts` 不动。这不是第二个「弹簧编译器」，而是同一套 preset 的逐帧形式，必须写进 `spring.ts` 的注释说明为什么需要它（中途改目标要保留速度，`easingFunction` 做不到）。

## 2. 几何模型（`geometry.ts`）

### 2.1 坐标

主体是圆角矩形 `[0, W] × [0, H]`，圆角 `R = min(R, W/2, H/2)`。每条边有局部坐标：`u` 沿边、`v` 向外为正。路径按顺时针走：上边左→右、右边上→下、下边右→左、左边下→上。局部到主体坐标的映射：

| 边 | (u, v) → (x, y) |
| --- | --- |
| top | (u, −v) |
| right | (W + v, u) |
| bottom | (W − u, H + v) |
| left | (−v, H − u) |

`FusionBud.center` 对外按直觉给（上 / 下边从左量，左 / 右边从上量），进几何前换成局部 `u`（bottom 取 `W − center`，left 取 `H − center`）。

### 2.2 贴合态（detach = 0）——与 uiarc Dock 同构

设凸起目标宽 `w`、外凸 `e`、顶角 `r`、凹角上限 `f`：

- 凹角 `p = min(f, e/2)`；
- 宽度 `l = min(w, L − 2R − 2p)`（`L` 为边长），中心 `c = clamp(center, R + p + l/2, L − R − p − l/2)`，保证凹角永远落在直边上；
- 顶角 `m = min(r, e − p, l/2)`；
- 左侧：凹角用二次贝塞尔（控制点在直角处，同 uiarc），从 `(c − l/2 − p, 0)` 水平出发、到 `(c − l/2, p)` 竖直到达；侧边竖直到 `v = e − m`；凸角到顶边；右侧镜像。
- `e < 0.5` 时不画这个凸起（与 uiarc 的 `t < 0.5` 相同，避免 1px 抖动）。

### 2.3 分离态（detach = d > 0）——颈部：侧边轮廓 + 余弦凹陷

2026-09-25 用原型（`research/prototype/`）比较了两种做法，结论是用「轮廓模型」：

- **放弃的做法**：每侧一段三次贝塞尔、两端切线沿边、用 β 在贴合 / 分离两套控制点之间插值（`research/prototype/rejected-cubic-neck.png`）。颈部短时两端外扩宽度固定为 12px，比颈部本身还长，拉出来是卷边和钩子，不像液体。
- **采用的做法**（`research/prototype/profile-frames-no-knee.png`）：把整个凸起看成从主体边长出来的一根柱子，高 `T = e + d`，它的左右侧边是一条**半宽轮廓** `hw(v)`，按高度采样后用 Catmull-Rom 转三次贝塞尔连起来：
  - 没有拉伸时 `hw(v) = l/2`，就是 §2.2 的贴合态（侧边竖直），两种状态天然连续，不需要插值换段。
  - 颈缩：`hw(v) = l/2 − δ · bump(t)`，`bump` 是升余弦（在 `t = 0` 为 1、在 `|t| = 1` 为 0 且斜率为 0）；腰部高度 `v_w = p + 0.62·d`（水滴将来的底部位置附近），`δ = pinch · l/2` 为凹陷深度。
  - **非对称**：腰部以下用长的 `σ_down = v_w − p`（凹陷恰好在底部凹角结束处归零、斜率也归零，于是凹角与侧边 G1 连续，没有膝盖）；腰部以上用短的 `σ_up = min(0.45·e, 18)`，形成水滴底部的凸肩。
  - 横向漂移：`cx(v) = c + drift · smoothstep(v_w − σ_down, v_w + σ_up, v)`，颈部随水滴偏移平滑倾斜。
  - 顶角半径 `m = min(r, e − p, l/2)` 必须先夹住，否则小凸起时采样区间倒置出尖刺（原型第一版踩过）。
- 调用方（组件驱动器或 core-app）给 `detach` 与 `pinch`；组件内部默认 `pinch = smoothstep(0.15·breakAt, breakAt, d)`。

### 2.4 断裂与残留

- 驱动器在 `pinch ≥ 0.985`（腰部半宽 < 约 1px）时锁存为 broken。
- broken 之后输出两个闭合子路径，仍用同一条轮廓公式分段：
  - 主体残留：底部凹角 + 腰部以下那一段轮廓，到 `v_w` 收成尖；随后 `v_w` 与凹陷一起按 `snappy` 弹簧回缩到 0（尖角缩回主体边）。
  - 水滴：腰部以上那一段轮廓 + 顶部凸角；底部的尖尾随 `σ_up` 回缩到 0，水滴底部变回普通凸圆角（半径 `m`）。
- 实现时逐帧渲染断裂前后各 5 帧对比，确认断开那一帧没有跳变（原型的渲染脚本可以直接复用）。

### 2.5 输出

```ts
fusionSurfacePath(input: FusionGeometryInput): {
  d: string                 // 一个或多个闭合子路径，坐标保留 2 位小数
  spans: FusionSpan[]       // 每个凸起在主体边上的接合区间 { id, edge, from, to }
}
```

- `includeBody: false` 时只输出凸起 / 颈部 / 水滴本身（颈底沿边闭合，并向主体内侧多盖 `baseOverlap` px）——给 core-app 这种「主体是别的元素」的场景用；`spans` 用来在接合处盖住宿主自己的边框。
- 所有数值经过 `Number.isFinite` 守护，非法输入（负尺寸、宽度 0）退化成不画该凸起，而不是输出 `NaN`。

## 3. 组件（`TxFusionSurface.vue`）

```vue
<div class="tx-fusion-surface" ref="root">
  <svg class="tx-fusion-surface__silhouette" aria-hidden="true" focusable="false">
    <path ref="path" />
  </svg>
  <slot />                                        <!-- 主体内容，真实 DOM -->
  <div v-for="bud in buds" :key="bud.id" class="tx-fusion-surface__bud" :ref="…">
    <slot name="bud" :bud="bud" />                <!-- 凸起内容，位置由 driver 每帧写 transform -->
  </div>
</div>
```

- 根节点 `position: relative; isolation: isolate`；svg `position: absolute; inset: 0; overflow: visible; z-index: -1; pointer-events: none`，与 `TxLiquid` 同一分层约定：外形画在内容之下、根背景之上。
- 尺寸：`ResizeObserver` 读根节点 `offsetWidth/Height`，变化时驱动器重算。
- Props（顺序即文档属性表顺序）：`buds`、`radius`（默认 16）、`fillet`（默认 12）、`breakAt`（默认 28）、`fill`（默认 `var(--tx-bg-color-overlay, #fff)`）、`stroke`（默认 `none`）、`strokeWidth`（默认 1）、`shadow`（`box-shadow` 语法 → svg 上的 `drop-shadow()` 链，与 `TxLiquid` 的 `parseShadow` 复用同一解析）、`transition`（默认 `'smooth'`）、`contentBlur`（默认 6，0 关闭）。
- `FusionBud`：`id`、`edge`（默认 `top`）、`open`（`boolean | number`）、`center`、`width`、`height`、`radius`、`detach`、`drift`。
- 事件：`break(id)`——某个凸起的颈部断开的那一帧；`settle()`——所有弹簧静止。
- 凸起内容层：驱动器每帧写 `transform: translate(...)`、`opacity` 与 `filter: blur(...)`（`progress` 过 0.45 后开始显现，映射同 uiarc 的 `clamp((progress − 0.45) / 0.4)`），同时写 `--tx-fusion-surface-progress` 给插槽内容自用；Vue 不参与逐帧更新。
- 关闭中的凸起内容设 `inert`，避免键盘焦点落进看不见的托盘。

## 4. 驱动器（`driver.ts`）

- 每个凸起维护 `{ open, center, width, height, detach, drift }` 的当前值与速度；props 改目标时只改 target，不重置速度。
- rAF 循环：按墙钟 `dt` 调 `springSteps`（子步长 ≤1/60s，长帧不会慢动作，也不会炸），由 `detach` 算 `pinch`、判断断裂、推进残留，调用 `fusionSurfacePath()`；`d` 与上一帧字符串相同就不写 DOM。
- 所有值进入静止阈值后停循环并发 `settle`；下一次目标变化再唤醒。
- `prefers-reduced-motion: reduce`：直接把当前值设成目标并画一帧。
- 卸载：取消 rAF、断开 ResizeObserver。

## 5. 与既有组件的关系

| | TxLiquid / TxFusion | TxFusionSurface |
| --- | --- | --- |
| 原理 | SVG goo 滤镜（模糊 + alpha 阈值） | 解析几何路径 |
| 形状 | 任意多块自由融合 | 圆角矩形主体 + 边上的凸起 / 水滴 |
| 边缘 | 阈值后偏软 | 矢量锐利 |
| 描边 | 不支持 | 支持 |
| 每帧成本 | 滤镜区域重栅格 | 一条 path 重绘 |

文档「相关组件」互相链接，`## 技术实现` 里写明为什么没有用 goo 滤镜实现（无法带描边、`TxLiquid` 已覆盖自由融合场景）。

## 6. 文档与注册

- `components.ts`、`pro/index.ts` 各一行（按字母位置插入，不追加到末尾）。
- nexus：`DocsSidebar.vue` 的 `SECTION_ORDER` 放在 `fusion` 与 `liquid` 之间；`scripts/recategorize-component-docs.py` 的 `Effects` 同位置；画廊格放在 Liquid 格旁。
- 页面：`fusion-surface.zh.mdc` / `.en.mdc`，节序按 `nexus-docs-structure.md`：安装 → 用法（托盘长出、分裂成水滴、四个方向、最佳实践）→ API 参考（属性 / 事件 / 插槽 / 类型 / CSS 变量）→ 概述（交互与降级契约）→ 技术实现（几何推导摘要、为什么不用滤镜、测试覆盖）→ 使用场景 → 相关组件。
- demo：`FusionSurfaceTrayDemo.vue`（工具栏上长出形状托盘，点击切换）、`FusionSurfaceSplitDemo.vue`（输入框形状分裂出一滴并上浮、落进上方的列表）、`FusionSurfaceEdgesDemo.vue`（四条边同时长出，展示夹边与凹角限制）。demo 在进入视口时才开始脚本播放，离开时清理计时器。

## 7. 取舍记录

- **不用 goo 滤镜**：goo 能天然处理任意拓扑，但无法描边、阈值会吃掉细节，而且滤镜区域要覆盖整个运动范围；发送分裂场景里水滴要飞过整个会话区，滤镜区域就是整个窗口。
- **轮廓模型而不是两套控制点插值**：贴合、拉伸、颈缩、断裂都是同一条半宽轮廓公式在不同参数下的结果，命令结构不变（固定采样数），任何参数连续变化都保证形状连续；凹角与顶角沿用 uiarc 的二次贝塞尔，侧边用采样点的 Catmull-Rom 三次段。
- **组件不自动测量主体圆角**：`TxLiquid` 会读子元素的 `border-radius`，这里主体就是根节点、由调用方定尺寸，`radius` 作为 prop 更可预测。
