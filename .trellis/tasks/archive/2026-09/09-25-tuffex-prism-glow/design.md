# Design — TxPrismGlow

## Files

```
packages/tuffex/packages/components/src/prism-glow/
  index.ts                  withInstall(TxPrismGlow)，导出 PrismGlow / TxPrismGlow / 类型（照 glow-text/index.ts）
  src/types.ts              PrismGlowProps / PrismGlowPalette / PrismGlowPlacement
  src/TxPrismGlow.vue       模板 + 非 scoped 的 BEM 样式（.tx-prism-glow*），keyframes 前缀 tx-prism-glow-
  __tests__/prism-glow.test.ts
```

不用 scoped 样式的原因：暗色要写成 `:is([data-theme='dark'], .dark) .tx-prism-glow`，高对比要写成 `html.contrast`，都是祖先选择器；宿主（CoreBox）也需要直接覆盖根元素的定位。Effects 组件（`TxThinkingOrb` 等）本来就是非 scoped 的 BEM。

## DOM

```html
<div class="tx-prism-glow tx-prism-glow--spectrum tx-prism-glow--bottom"
     style="--tx-prism-glow-intensity: 1; --tx-prism-glow-duration: 6s">
  <Transition name="tx-prism-glow">
    <div v-if="active" class="tx-prism-glow__field" aria-hidden="true">
      <span class="tx-prism-glow__cone is-1">            <!-- translate: 行进；opacity + scale: 升起 / 淡出 -->
        <span class="tx-prism-glow__beam" />             <!-- scale: 胀缩；静态 transform: 基准尺寸 × reach -->
        <span class="tx-prism-glow__rays" />             <!-- 静态光柱，跟随 cone -->
      </span>
      … is-2 … is-6
    </div>
  </Transition>
  <slot />
</div>
```

- 根元素 `position: relative; isolation: isolate`。光层 `position: absolute; inset: 0; z-index: -1; overflow: hidden; border-radius: inherit; pointer-events: none; container-type: size`。
  - 隔离上下文保证 `z-index: -1` 只相对根元素：光层画在根元素背景之上、插槽内容之下，不会掉到宿主页面背后。
  - `container-type: size` 让光锥宽度和行进距离都用 `cqw` 表示；光层尺寸由 `inset: 0` 决定，不依赖内容，尺寸收敛不影响布局。
- 覆盖层用法（不传插槽）：宿主把根元素设成 `position: absolute; inset: 0; z-index: -1`，并确保宿主自己是层叠上下文。CoreBox 的 `div.CoreBox` 本来就是。
- `placement="top"`：光层加静态的 `transform: scaleY(-1)`，光锥改从上边垂下，行进方向不变。

## Palette

每束光锥只有一个变量 `--tx-prism-glow-tint`，渐变的每一层都用相对颜色从它派生，所以换调色板只需要换 tint：

```scss
// 光谱：只声明色相角，亮度 / 彩度取主题相关的局部变量
.tx-prism-glow--spectrum .is-1 { --tx-prism-glow-tint: oklch(var(--tx-prism-glow-l) var(--tx-prism-glow-c) 350); }
// 主题色：从 --tx-color-primary 派生相邻色相
.tx-prism-glow--accent .is-1 { --tx-prism-glow-tint: oklch(from var(--tx-color-primary, #409eff) var(--tx-prism-glow-l) var(--tx-prism-glow-c) calc(h - 40)); }

.tx-prism-glow__beam {
  background:
    radial-gradient(ellipse 26% 13% at 50% 100%, oklch(from var(--tx-prism-glow-tint) var(--tx-prism-glow-l-core) var(--tx-prism-glow-c-core) h / var(--tx-prism-glow-a-core)), transparent),   /* 核心 */
    radial-gradient(ellipse 30% 62% at 41% 100%, oklch(from var(--tx-prism-glow-tint) l c calc(h - 34) / var(--tx-prism-glow-a-fringe)), transparent 72%), /* 左色散 */
    radial-gradient(ellipse 30% 62% at 59% 100%, oklch(from var(--tx-prism-glow-tint) l c calc(h + 34) / var(--tx-prism-glow-a-fringe)), transparent 72%), /* 右色散 */
    radial-gradient(ellipse 50% 100% at 50% 100%, oklch(from var(--tx-prism-glow-tint) l c h / var(--tx-prism-glow-a-halo)), transparent 78%),           /* 光晕 */
    linear-gradient(90deg, transparent 20%, <core> 50%, transparent 80%) bottom / 100% 1.5px no-repeat;                                                  /* 边缘亮线 */
}
```

| 光锥 | 光谱色相 | 主题色偏移 | 速度系数 | 相位（× duration） | 胀缩周期（× duration） | 基准尺寸 |
| --- | --- | --- | --- | --- | --- | --- |
| is-1 | 350 品红 | −40 | 1.03 | −0.06 | 0.38 | 1 |
| is-2 | 95 黄 | +60 | 1.27 | −0.48 | 0.52 | 0.9 |
| is-3 | 205 青 | −20 | 0.90 | −0.60 | 0.45 | 1.05 |
| is-4 | 300 紫 | +40 | 1.38 | −1.02 | 0.58 | 0.85 |
| is-5 | 150 绿 | +20 | 1.15 | −0.87 | 0.42 | 0.95 |
| is-6 | 258 蓝 | 0 | 0.98 | −0.28 | 0.48 | 1 |

速度系数各不相同，两两之间才会不断追上、融合、拉开。相位用负的 `animation-delay`，开启时 6 束已分布在流动中。数值取自原型 v2，实现阶段按截帧再微调。

主题相关参数（局部变量，默认值取自原型 v2）：

| 变量 | 暗色 | 亮色 | 作用 |
| --- | --- | --- | --- |
| `--tx-prism-glow-l` / `-c` | 0.74 / 0.19 | 0.80 / 0.16 | 光锥色的亮度 / 彩度 |
| `--tx-prism-glow-l-core` / `-c-core` / `-a-core` | 0.95 / 0.05 / 0.78 | 0.80 / 0.16 / 0.55 | 核心：暗色近白，亮色保持彩色（亮色表面上灰白核心会发脏） |
| `--tx-prism-glow-a-halo` / `-a-fringe` / `-a-ray` | 0.30 / 0.44 / 0.07 | 0.30 / 0.36 / 0.05 | 各层透明度 |
| 混合模式 | `plus-lighter` | `normal` | 暗色靠加法叠加融合发白；亮色表面上加法看不见，改为普通叠加 |

## Motion（只动合成器属性）

```scss
.tx-prism-glow__cone {           // 宽 40cqw、高 100%，transform-origin: 50% 100%
  animation:
    tx-prism-glow-travel calc(var(--tx-prism-glow-duration) * var(--speed)) linear calc(var(--tx-prism-glow-duration) * var(--phase)) infinite,
    tx-prism-glow-life   calc(var(--tx-prism-glow-duration) * var(--speed)) linear calc(var(--tx-prism-glow-duration) * var(--phase)) infinite;
}
.tx-prism-glow__beam {
  transform: scale(var(--size), calc(var(--size) * var(--tx-prism-glow-reach, 1)));  // 静态；与下面的 scale 属性叠加
  animation: tx-prism-glow-breathe calc(var(--tx-prism-glow-duration) * var(--breath)) ease-in-out calc(var(--tx-prism-glow-duration) * var(--phase)) infinite alternate;
}
@keyframes tx-prism-glow-travel { from { translate: -40cqw 0; } to { translate: 100cqw 0; } }
@keyframes tx-prism-glow-life {
  0% { opacity: 0; scale: 1 0.35; } 16% { opacity: 1; scale: 1 1; }
  84% { opacity: 1; scale: 1 1; }   100% { opacity: 0; scale: 1 0.5; }
}
@keyframes tx-prism-glow-breathe { from { scale: 0.78 0.62; } to { scale: 1.12 1.08; } }
```

- `translate`（行进）、`scale`（升起 / 胀缩）、`opacity`（淡入淡出）分别落在两层元素上，互不覆盖。keyframes 里不写 `var()`，保证可以交给合成器。
- 整层进出：`.tx-prism-glow-enter-active { transition: opacity .3s ease-out }`，`-leave-active { transition: opacity .45s ease-in }`。光层静止时的不透明度 = `--tx-prism-glow-intensity`；淡出期间子动画继续跑，淡出结束后 `v-if` 卸载。
- `duration` 默认 6s：720px 宽时约 170px/s，0.6–2s 的搜索窗口里能清楚看到流动。

## Degradation

- reduced-motion：`animation: none; transition: none`，每束光锥写死一个静态终态（`translate: calc(i × 12cqw) 0; opacity: 1; scale: 1`，6 束沿边均匀分布），满足"降级保留完整终态"的规则。
- 高对比：`html.contrast`、`html[data-tx-contrast='high']`、`@media (prefers-contrast: more)` 与库里的判定保持一致。此时 `--tx-prism-glow-reach: 0.45`，光锥只占靠近边缘的一条带，同时 `.tx-prism-glow__rays { display: none }`。

## Docs / registration

- 同一组效果放在一起：侧边栏 `SECTION_ORDER`、`recategorize` 的 Effects 列表、hub 索引「视觉效果」，都插在 `border-beam` 之后。画廊格按画廊现有的排列规则插入。`components.ts` / `pro/index.ts` 按文件现有顺序插入。
- demo：
  - `PrismGlowShowcaseDemo.vue`：一张卡片，带 active / palette / placement / intensity / duration 控件；
  - `PrismGlowSearchDemo.vue`：仿搜索栏，点"搜索"后亮起约 2.4s 再淡出。
- 页面 frontmatter：`category: Effects`，`status: beta`，`since: 0.6.0`（以落地时的包版本为准）。「技术实现」里写合成器动画、加法混合、相对颜色派生、参考出处（只借鉴观感，没有代码来源），以及覆盖范围说明。

## Test

照 `mode-chip-motion.test.ts` 的写法：先用 sass 编译 SFC 样式，再解析规则并断言。

- keyframes 里只出现 `translate` / `scale` / `opacity`；
- reduced-motion 块把 cone 和 beam 的 `animation` 设成 `none`，并给出 `opacity: 1` / `translate` 终态；
- 去掉 `var(...)` 的 fallback 之后，没有 `#hex` 和 `rgba(`。

组件部分用 VTU：插槽渲染、光层 `aria-hidden`、`active` 开关（关闭 transition stub 时），以及修饰类和 CSS 变量绑定。

## Risks

- nexus 通过 dist 解析 tuffex：新组件要构建 dist 才能在文档站看到，而且 `:3200` 要重启才能读到新的 `style-deps.json`。
  - 构建用 `mkdir /tmp/tuffex-build.lock` 加锁，并关闭 verify-deps（见 `tuffex-docs-sync.md`）；
  - 重启前先和 peer 会话打招呼。
- 注册文件（`components.ts`、`pro/index.ts`、`DocsSidebar.vue`、`DocsComponentsGallery.vue`、`demo-registry.ts`、`index.*.mdc`、`recategorize`）正被 peer 的 `fusion-surface` 并行修改。
  - 每次 Edit 前重新读取，只在自己的锚点插入；
  - 提交时用锚点编辑 HEAD blob + `update-index` 的方式只暂存自己的行，参见 memory `parallel-session-shared-worktree`。
