# Design — TabBar / FlatRadio / SidebarNav 接入果冻指示器

前提：`09-25-jelly-indicator-engine` 的 `useJellyIndicator`（`packages/tuffex/packages/utils/use-jelly-indicator.ts`）已落地，API 见该任务 design.md。

## 共同做法

1. **测量不动**：TabBar / SidebarNav 继续用 `useIndicatorBox`，FlatRadio 继续用 `readGeometry`（`flat-radio.test.ts:203–208` 要求源码保留 `getBoundingClientRect()`）。测量结果换算成引擎矩形后 `engine.moveTo(rect, { animate })`。
2. **命令式写 style**：`onFrame(frame)` 直接写指示器元素的 `transform` / `width` / `height` / `opacity`；模板里去掉这些属性的 `:style` 绑定（One writer per property，见 `component-guidelines.md`）。组件不因动画每帧重渲染。
3. **删 CSS 行进过渡**：`transform` / `width` / `top` / `height` 不再有 transition；只保留 `opacity` 淡入，reduced-motion 下按原组件习惯处理。
4. **animate 判定**：选中值变化（点击、键盘、`v-model`）以及 SidebarNav 的悬停 / 焦点目标变化 → `animate: true`；首次测量、ResizeObserver、子项注册 / 注销、尺寸档切换 → `animate: false`（引擎在运动中只改目标，不会半路瞬移）。

## TxTabBar

- `useJellyIndicator({ axis: 'x', maxGrowth: <按变体>, onFrame })`。
- 目标矩形由现有 `indicatorStyle` 的算术改写而来（数值不变）：
  - `line`：`{ x: b.left, y: 0, width: b.width, height: 2 }`，`transform-origin: center top`；
  - `dot`：`{ x: b.left + (b.width − 6)/2, y: b.top + b.height − 12, width: 6, height: 6 }`；
  - `pill` / `block`：内缩盒子 `{ x: b.left + insetX, y: b.top + insetY, width: b.width − 2·insetX, height: b.height − 2·insetY }`。
- `maxGrowth`：`pill` / `block` = `2 × insetY`（鼓起刚好填满竖向留白，不越出 bar，也不被画廊外框裁）；`line` / `dot` 不封顶。
- 元素仍 `v-if="showIndicator"`（`indicator="none"` 时无节点，`tab-bar.test.ts:133–139`）；插入后首帧由引擎直接落位。
- 删除 `.tx-tab-bar__indicator` 的 transform / width 过渡与 `no-transition` 的实际用途（类名保留在模板上以兼容外部样式）。

## TxFlatRadio

- `useJellyIndicator({ axis: 'x', onFrame })`；目标 `{ x: left, y: 0, width, height: <拇指高度> }`——拇指的 `top` / `height` 仍交给 CSS，引擎只需要高度参与形变与封顶：从元素 `offsetHeight` 读一次（尺寸档变化时重读）。
- `onFrame` 写 `transform: translate3d(x, 0, 0) scale(sx, sy)` 与 `width`；`opacity` 在 `multiple` / 无当前项时为 0。
- `maxGrowth`：取轨道 padding × 2 + 少量溢出（初值 10px，浏览器目测定）——与 Radio 胶囊"跳出轨道一点点"的观感对齐，同时不撞到相邻控件。
- `flat-radio.test.ts:171–187`（"transform 与 width 共用一条过渡"）改写为：指示器规则里没有 transform / width 过渡、`opacity` 过渡保留、reduced-motion 块存在。`indicatorRuleBody()` 截取方式依赖"第一个 `}`"，改样式时让 `background` 仍在嵌套块之前。
- `TxFineTuneCard.vue:341–357`：删掉对指示器 `transition` 的覆盖（保留底色 / 阴影覆盖）；`fine-tune-card.{en,zh}.mdc` 对应句子改为"拇指的移动来自 TxFlatRadio 的果冻引擎，卡片只改底色与阴影"。

## TxSidebarNav

- `useJellyIndicator({ axis: 'y', deform: { along: 1, across: 0.15 }, maxGrowth: 4, ...jellySpring(indicatorDuration), onFrame })`。
- 目标 `{ x: 0, y: b.top, width: b.width, height: b.height }`；`onFrame` 写 `transform: translate3d(0, y, 0) scale(sx, sy)` 与 `height`，CSS 把 `top` 固定为 0、`left/right: 0` 不变。
- `jellySpring(220)`：时间缩放 f = 350 / 220 ≈ 1.59 → 刚度 ≈ 278、阻尼 ≈ 19，阻尼比与 Radio 相同、响应快约 1.6 倍，适合悬停追随。
- `revealed` / `is-revealed` 类保留：首次落位后加上（现在用于淡入的 opacity 过渡）。reduced-motion 块仍把 `is-revealed` 的 transition 去掉；`context-cards-motion.test.ts` 的约束（块内不出现 `display:none` / `visibility:hidden` / `opacity:0`）照旧满足。
- `sidebar-nav.test.ts:218–270` 改写：首帧断言保留（opacity、`is-revealed`、duration 变量）；悬停跟随改为断言目标经引擎到达（用 fake timers 推进到停稳，或打桩 reduced-motion 断言直接落位的 `translate3d(0, 84px, 0)`）。
- `refreshIndicator()` 仍是 `measure`，测量后以 `animate: false` 送入引擎。

## 调参方法

各组件的 `maxGrowth` / `deform` 是初值：实现后在 ego 浏览器里用 CDP `Animation.setPlaybackRate` 放慢录帧，与 Radio 并排对比，调到"同一种材质、各自不越界"，最终值写回本文件。

## 定稿参数（2026-09-26，浏览器实测后）

| 组件 | `maxGrowth` | `bounds`（沿行进轴） | 其它 |
| --- | --- | --- | --- |
| TabBar `pill` / `block` | `2 × insetY`（md 12px：鼓到 bar 全高） | `[insetY, 宽 − insetY]` | — |
| TabBar `line` | 8px（落地铺开原本 30.6px） | `[4, 宽 − 4]`（首项目标在 0，墙让到目标） | `transform-origin: center top` |
| TabBar `dot` | 不设 | `[0, 宽]` | — |
| FlatRadio | 10px | `[5, 宽 − 5]` | 拇指高度取 `offsetHeight` |
| SidebarNav | 4px | `[2, scrollHeight − 2]` | `deform { along: 1, across: 0.15 }`，`jellySpring(indicatorDuration)` |

调参方式实际用的是页面内冻结 `requestAnimationFrame` 抓帧（引擎是 rAF 积分，`Animation.setPlaybackRate` 放不慢它），加上整趟往返逐帧计算画出范围。

## 修订：滑行材质（2026-09-26）

- 上文的 `maxGrowth` / `deform` / `jellySpring` 方案与「定稿参数」表已作废：果冻在 Tabs 家族上被评审否决（"不够丝滑、简单"），TabBar / FlatRadio / SidebarNav 与 TxTabs 一起改用引擎的 `glide` 材质，Radio 保留果冻。
- 三个宿主都传 `material: 'glide'` 与 `integrate: springSteps`，不再传 `maxGrowth` / `deform`：
  - TabBar、FlatRadio：`GLIDE` 默认值（420 / 38 / lag 0.45），墙为容器 padding box 宽度 `[0, clientWidth]`。
  - SidebarNav：`timeScaleSpring(GLIDE, indicatorDuration, 220)`（默认 220ms 即 `GLIDE` 原值），lag 0.3（跟随悬停要跟得上），墙 `[0, scrollHeight]`。
- 形状只移动、改尺寸：TabBar `md` 药丸 84 → 约 98 → 84px，FlatRadio 40 → 约 54 → 50px，SidebarNav 高亮块 28 → 约 33 → 28px；缩放恒为 1，原先按像素封顶鼓起的理由不复存在。
- 测试改写：`tab-bar` / `flat-radio` / `sidebar-nav` 的行进用例断言途中长度超过起止两端、每帧缩放为 (1, 1)、精确落位；往返用例断言每帧两端都在容器内。SidebarNav 的布局桩补上了 `scrollHeight`：jsdom 里它是 0，墙退化成目标自身的范围，回程头三帧落后端被夹到目标端，高亮块高度塌成 0（浏览器里列表已布局，`scrollHeight` 不会是 0）。
