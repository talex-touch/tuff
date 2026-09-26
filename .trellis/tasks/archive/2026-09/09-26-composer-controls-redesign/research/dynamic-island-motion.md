# Research: 苹果灵动岛式形变——可落地到 Vue 3 + CSS/WAAPI（Chromium 146）的做法

- **Query**: 同一个控件在状态间连续形变（尺寸、圆角、内容交叉淡入、按压收缩、弹性回弹、渐变）的灵动岛式动效；给出能在 Vue 3 + CSS / WAAPI（Electron 41 的 Chromium）里直接实现的技术要点。
- **Scope**: mixed（Apple 官方资料经 ego-browser 读取；运行时能力在本机 Electron 41.10.4 里实测；弹簧参数在 Node 里按 tuffex 的积分器复算）
- **Date**: 2026-09-26

## Findings

### External References（ego-browser 读取，2026-09-26）

- [WWDC23 · Design dynamic Live Activities](https://developer.apple.com/videos/play/wwdc2023/10194/) — 灵动岛的设计意图，原文：
  - "It's a blend of hardware and software that provides a singular system layer that can **organically shape shift** between all sorts of different alerts and indicators."
  - "Inspired by biological form and motion, the Dynamic Island is designed to feel like a **living organism, with a deliberate elasticity** that serves as a playful contrast to the fixed nature of the hardware it embodies."
  - "A key aspect to making things fit nicely inside the Dynamic Island is for them to be **concentric** with its shape. This is when rounded shapes nest inside of each other with even margins all the way around."
  - "for animating in and out graphic elements and text, use the **content replace** transition … you can also create your own by combining different animations of the **scale, opacity, and position** of elements."
  - "try and **maintain the relative placement** of things between the two views"（紧凑态与展开态之间元素相对位置不变）；"people can **press into** the Dynamic Island"（按压是它的主交互）。
- [HIG · Live Activities](https://developer.apple.com/design/human-interface-guidelines/live-activities) — "Use consistent margins and concentric placement"；"match its corner radius to the outer corner radius … by subtracting the margin"；"The Dynamic Island uses a corner radius of 44 points"；动画 "with a **maximum duration of two seconds**"；"preserve as much of the existing layout as possible by animating existing elements to their new positions rather than removing and animating them back in"。
- [WWDC23 · Animate with springs](https://developer.apple.com/videos/play/wwdc2023/10158/) — 苹果把弹簧参数化为 `duration`（感知时长）+ `bounce`：bounce 0 = 平滑无过冲，"A small bounce, like around 15%, doesn't feel very bouncy yet, but the long tail feels a little more brisk"，"larger bounce values like 30%, you do start to feel some noticeable bounciness"；"When you're not sure, use a spring with bounce 0"；重定向时保留速度（"uses the velocity it had when it was retargeted as the initial velocity"）。页面代码块给出换算：`mass = 1`，`stiffness = (2π ÷ duration)²`，阻尼按 `(1 − bounce) × 4π ÷ duration`（bounce ≥ 0；页面排版丢了括号，只有这种读法在 bounce=1 时退化为无阻尼余弦，与讲稿一致）。
- [SwiftUI `Transition.blurReplace`](https://developer.apple.com/documentation/swiftui/transition/blurreplace) — "animates the insertion or removal of a view by combining **blurring and scaling** effects"（iOS 17 起系统级的「内容替换」手法）。
- [Symbols `ReplaceSymbolEffect`](https://developer.apple.com/documentation/symbols/replacesymboleffect) — 图标替换的三种编排：Down-Up（旧的缩小移除、新的放大加入）、Off-Up、Up-Up；iOS 18 另有 MagicReplace（共享部件连续形变，不可用时回退到 ReplaceEffect）。

### 运行时能力（本机实测，Electron 41.10.4 / Chrome 146.0.7680.216）

用 `apps/core-app/node_modules/electron` 起一个隐藏窗口执行 `CSS.supports` / `element.animate`（脚本在 `/tmp/composer-controls-probe/main.js`，没有碰正在运行的 dev 应用）：

| 能力 | 结果 | 用途 |
|---|---|---|
| `transition-timing-function: linear(…)`、WAAPI `easing: 'linear(…)'` | ✅ | 把弹簧编译成曲线，走合成线程 |
| `interpolate-size: allow-keywords`、`calc-size()` | ✅ | `width: auto` 也能过渡（胶囊按内容长宽） |
| `@starting-style`、`transition-behavior: allow-discrete` | ✅ | 元素出现 / `display` 切换也能过渡 |
| `corner-shape: squircle` / `superellipse()` | ✅ | 苹果式连续曲率圆角（可选） |
| `@property`（`CSS.registerProperty`） | ✅ | 渐变角度、门控系数可插值（Home 已在用） |
| `color-mix(in oklch, …)`、`conic-gradient(in oklch, …)` | ✅ | 渐变不发灰 |
| WAAPI `composite: 'add'`、`filter: blur()` 关键帧 | ✅ | 叠加回弹、模糊交叉 |
| `document.startViewTransition` | ✅ | （不推荐，见下） |
| `element.startViewTransition`（局部视图过渡） | ❌ | 不可用 |

### 弹簧词汇：苹果参数 ↔ tuffex 预设（按 tuffex `simulate()` 同一积分器复算）

tuffex 的共享弹簧在 `packages/tuffex/packages/components/src/liquid/src/spring.ts`：`presets`（:32-36）、逐帧积分 `springSteps()`（:59-83）、编译成 `linear()` 的 `resolveTransition()`（:204-235）。复算脚本 `/tmp/composer-controls-probe/springs.mjs`：

| 弹簧 | k / c | ζ | 静止时长 | 过冲 | 到 95% |
|---|---|---|---|---|---|
| tuffex `snappy` | 480 / 34 | 0.78 | 400ms | 1.4% | 150ms |
| tuffex `smooth` | 190 / 26 | 0.94 | 587ms | 0 | 321ms |
| tuffex `bouncy` | 320 / 17 | 0.48 | 746ms | 17.6% | 121ms |
| 分裂 `flyScaleSpring`（`send-split/score.ts`） | 520 / 30 | 0.66 | 462ms | 5.5% | 121ms |
| 分裂 `landScaleSpring` | 420 / 17 | 0.42 | 779ms | 23.2% | 100ms |
| SwiftUI `.smooth`（0.5s, 0） | 158 / 25.1 | 1.00 | 771ms | 0 | 383ms |
| SwiftUI `.snappy`（0.5s, 0.15） | 158 / 21.4 | 0.85 | 679ms | 0.4% | 296ms |
| SwiftUI `.bouncy`（0.5s, 0.3） | 158 / 17.6 | 0.70 | 796ms | 4.1% | 229ms |
| 候选「按压回弹」 | 900 / 30 | 0.50 | 446ms | 15.1% | 75ms |

结论：tuffex 的 `smooth` ≈ 苹果 bounce 0 的平滑弹簧；苹果的「有弹性」档（bounce 0.15–0.3）过冲只有 0.4–4%，比 tuffex `bouncy`（17.6%）温和得多——灵动岛的「弹性」主要来自**形状的挤压拉伸与按压回弹**，不是位移过冲。`linear()` 字符串见 `/tmp/composer-controls-probe/linear.mjs` 输出（`{520,30}` 334 字符、`{900,30}` 316 字符），与 `resolveTransition()` 产物同算法。

### Code Patterns：六个维度各自怎么做

**0. 前提：一个常驻元素，状态写在属性上。** 形变要求「同一个东西在变」：发送 / 停止不能是两个 `v-if` 的按钮（现状 `HomePage.vue` HEAD `:1426-1447` 就是两个按钮直接互换）。做法是一个 `<button :data-state="state">`，内部分层：

```
button.Island (data-state, 只承担「按压」的 scale)
  span.Island-Skin    (填充 / 尺寸 / 圆角 / 挤压拉伸；overflow 在这一层裁)
  span.Island-Ring    (渐变光环，伪元素或独立层)
  span.Island-Glyphs  (display:grid；每个图标 grid-area:1/1 叠在同一格，交叉淡入)
```

分层的原因：按压、形变、图标替换各有自己的 `transform` 与时序，放在同一元素上会互相覆盖；分到父子层后各自独立插值，互不打断。

**1. 尺寸**
- 首选：**不改布局尺寸**，只用 `scale` / `transform` 做挤压拉伸（合成线程，零重排）。圆形被非等比缩放会变椭圆——这正是 tuffex 的「果冻」语言（`packages/tuffex/packages/utils/animation/jelly.ts` 的 `jellyScale`：沿运动方向拉长、横向收窄、落地压扁）。
- 需要真的变宽（圆 → 胶囊）时：给控件留一个**固定占位槽**，皮肤层 `position:absolute` 右对齐向左长，`contain: layout paint` 把重排关在槽内；宽度用 WAAPI `width` 关键帧 + 弹簧编译的 `linear()`，或 `interpolate-size: allow-keywords` 直接过渡到 `auto`。宽度动画在主线程逐帧布局，发送那一刻恰是主线程最忙的时候（见 `09-25-send-split-fusion/research/stream-rerender-hotspot.md`），所以只在确有必要时用。
- 需要中途改目标且保留速度（快速连按、状态来回切）时：像分裂动画一样用 `springSteps()` 逐帧积分写样式；一条 CSS / WAAPI 曲线每次重定向都从速度 0 开始（`spring.ts:43-49` 的注释说的就是这个）。

**2. 圆角**
- 同心：内层圆角 = 外层圆角 − 间距（Apple HIG 原文，tuffex 规范「Nested radii must be concentric」同义）。Home 输入框圆角 24px（`--shell-radius-2xl`），32px 圆键放在距角 8px 处：16 + 8 = 24，正好同心。
- 圆 ↔ 圆角方块的形变（发送箭头 → 停止方块的底板）：`border-radius` 可直接插值；从「圆」到「胶囊」保持 `border-radius: 999px` 即可，胶囊变宽时圆角自然跟随。
- 想要苹果的连续曲率：`corner-shape: squircle`（已实测支持），与 `border-radius` 一起用；非必需。

**3. 内容交叉淡入（blur replace）**——苹果 `blurReplace` / SF Symbols Down-Up 的网页版：

```ts
// 旧图标：缩小 + 模糊 + 淡出，缓入（加速离开）
old.animate(
  [{ opacity: 1, scale: '1', filter: 'blur(0px)' }, { opacity: 0, scale: '0.6', filter: 'blur(4px)' }],
  { duration: 120, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' }
)
// 新图标：略晚 40–50ms 进场，缩放走弹簧，模糊 / 透明走强缓出
next.animate(
  [{ opacity: 0, scale: '0.5', filter: 'blur(4px)' }, { opacity: 1, scale: '1', filter: 'blur(0px)' }],
  { duration: 462, easing: MORPH_LINEAR /* {520,30} 编译 */, delay: 45, fill: 'backwards' }
)
```

- 两层叠在同一个 grid 格里，离场层不占位，所以替换不会推动布局（TxModeChip 的图标就是这样：`packages/tuffex/packages/components/src/mode-chip/src/TxModeChip.vue:290-307`、`:331-350`）。
- 时序参考仓库里已实测过的一套（`.trellis/tasks/archive/2026-09/09-23-composer-motion-reference/research/reference-motion.md` › Motion 3）：图标先换，旧文字约 80ms 消失，新文字约 280ms 由糊变清，全程约 370ms。
- 文字标签用 `TxTextTransformer` 的 `fade` 模式（`text-transformer/src/types.ts`：`durationMs`、`blurPx`）；图标路径级连续形变可用 `TxIconMorph`（内置 `arrow-up`、`plus`、`x`、`check` 等描边路径，`icon-morph/src/types.ts:3-26`），但它只画描边，填充的停止方块要自己给路径。

**4. 按压收缩**
- 按下要跟手（< 100ms），松开要有弹性：按下 `scale → 0.86–0.9`，90ms `cubic-bezier(0.23, 1, 0.32, 1)`（tuffex `--tx-ease-out-strong`）；松开用 `{900,30}` 弹簧回到 1（约 15% 过冲，峰值只比 1 大 1.5–2%）。
- 用 WAAPI 挂在 `pointerdown` / `pointerup` / `pointercancel` 上，而不是 `:active` 的 CSS transition：
  - `:active` 对「在输入框里按 Enter 发送」和快捷键不生效——发送键没被按，所以键盘发送必须能程序化触发同一段按压（`pulse()`）；
  - CSS Transitions 规范对「中途反向」有 reversing shortening（反向时时长按已走过的比例缩短），一次快速点击会把回弹弹簧压成一段更短更抖的曲线。
- 只对单独的 `scale` 属性做动画（CSS individual transform），不碰 `transform`，免得与果冻层 / 输入框的 FLIP 打架；输入框自身的回弹已经用 `composite: 'add'` 叠加（`useSendChoreography.ts` `recoilComposer`）。

**5. 弹性回弹（挤压拉伸）**
- 状态切换那一刻给皮肤层一个非等比冲量：`scaleX 1.12–1.14 / scaleY 0.88–0.9 → 1`（沿「被推开」的方向拉长；`proposal.md` 取 1.14 / 0.88），走 `{520,30}`（5.5% 过冲、462ms）。与分裂水滴的 `flyScaleSpring` 同一根弹簧，两处动效是一家。
- 冲量的幅度宁小勿大：tuffex 的 `JELLY.emergeScale 1.08 / sinkScale 0.97`（`jelly.ts`）是全库指示器用的量级，控件回弹不宜超过它太多。

**6. 渐变**
- Home 流式时输入框已经有「活光」：`conic-gradient(from var(--home-glow-angle) in oklch, #0894ff, #c959dd 27%, #ff2e54 52%, #ff9004 74%, #0894ff)`，由 `--home-glow-on` 门控淡入淡出（`HomePage.vue` HEAD `:2002-2057`；`@property` 注册在 `:2320-2341`，其中 `--home-glow-on` 是 `inherits: true`）。
- 控件上的渐变光环应该**复用同一组色标与同一个门控**：光环放在输入框内部，直接读继承下来的 `--home-glow-on`，于是分裂期间（工作区里 `09-25-send-split-fusion` 新增的 `.HomePage-Composer.is-splitting` 把它压成 0，尚未提交）自动不亮、分裂结束随输入框一起 0.6s 淡入。
- 圆形光环的旋转可以只转伪元素本身（`rotate` 走合成线程；圆对旋转不变，遮罩跟着转也看不出来）；胶囊形状则只能动 `@property` 角度，每帧重绘。
- 光源：阴影与高光都遵守「左上光源、x:y = 1:2」（`packages/tuffex/packages/components/style/variables.scss:270-282` 的 `--tx-elevation-*`；`shadow-light-source.test.ts` 守护 tuffex 组件）。填充若加高光渐变，高光也应在左上。

### 不推荐的做法（原因）

- **View Transitions（`document.startViewTransition`）**：会给整页拍快照、暂停渲染更新；发送那一刻有分裂覆盖层、虚拟列表测高、流式增量在同时写 DOM，整页快照会冻住它们。局部版 `element.startViewTransition` 在 Chromium 146 里不可用。
- **CSS `width/height` transition 做主形变**（pilot 的做法）：每帧重排整条工具栏，且无法保留速度。
- **`clip-path` 做胶囊伸缩**：本任务没有核实它在 Chromium 146 是否走合成线程，不作为首选。

### Related Specs

- `.trellis/spec/frontend/tuffex-design-rules.md` — Motion：悬停变色立即生效（:139-145）；状态变化可以缓动颜色，但要挂在只在变化期间存在的类上（:147-166，`TxModeChip` 的 `.is-morphing`）；每个过渡都要有 reduced-motion 出口且保留终态（:168-178）；圆角同心（:87-91）；不叠卡片（:219-221）。
- `.trellis/spec/frontend/component-guidelines.md:213-214` — 指示器类不许对 `transform/width/height/top` 写 CSS transition；reduced motion 由引擎落位。

## Caveats / Not Found

- 苹果没有公开灵动岛自身的弹簧参数；上表只能给出「苹果推荐的参数化方式与预设」，灵动岛的具体手感需要在实现阶段按录帧调。
- WWDC 页面代码块的阻尼公式排版缺括号（`damping = 1 - 4π × bounce ÷ duration`），本文采用唯一自洽的读法 `(1 − bounce) × 4π ÷ duration`；它与讲稿「bounce=100% 等于无阻尼余弦」一致。
- 「`filter: blur()` 动画在 Chromium 走合成线程」「reversing shortening」两点来自规范 / 引擎常识，本任务未在真实窗口里录帧验证；按约束也不能对正在使用的 dev 应用做 CDP。
- ego-browser TaskSpace 39 已 `finish({ keep: [] })`。
