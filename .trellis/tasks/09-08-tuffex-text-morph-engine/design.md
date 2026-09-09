# Design — tuffex 文本形变引擎

## 1. 上游结构与移植取舍

torph 引擎共 ~2950 行，分六层。逐文件裁决：

| 上游文件 | 行 | 处置 | 理由 |
|---|---|---|---|
| `lib/text-morph/index.ts` | 426 | 移植 → `engine/morph.ts` | 编排层，核心 |
| `lib/text-morph/controller.ts` | 48 | 移植 → `engine/controller.ts` | 配置变更时重建实例，Vue 壳需要 |
| `lib/text-morph/utils/segment.ts` | 196 | 移植 → `engine/segment.ts` | `Intl.Segmenter` 分段 + ID 分配 |
| `lib/text-morph/utils/diff.ts` | 334 | 移植 → `engine/diff.ts` | 词级 LCS + 字符级配对 |
| `lib/text-morph/utils/number.ts` | 391 | 移植 → `engine/number.ts` | 位值 / 光标匹配 |
| `lib/text-morph/utils/animate.ts` | 84 | 移植 → `engine/animate-text.ts` | 普通字符的进退场 |
| `lib/text-morph/utils/number-animate.ts` | 105 | 移植 → `engine/animate-number.ts` | 数字滑动 |
| `lib/text-morph/utils/replace-animate.ts` | 100 | 移植 → `engine/animate-group.ts` | 整段替换的成组收缩 |
| `lib/utils/lcs.ts` | 40 | 移植 → `engine/lcs.ts` | |
| `lib/utils/flip.ts` | 90 | 移植 → `engine/flip.ts` | 段级 FLIP 测量（**不是** tuffex `useFlip`，见 §2） |
| `lib/utils/dom.ts` | 200 | 移植 → `engine/dom.ts` | 段元素创建 / 脱流 / 复用 |
| `lib/utils/animate.ts` | 364 | 移植 → `engine/container.ts` | 容器宽高过渡 + carry |
| `lib/utils/constants.ts` | 9 | 移植 → `engine/constants.ts` | 前缀改 `tx-morph-*` |
| `lib/utils/types.ts` | 31 | 移植 → `engine/types.ts` | 类型改名，见 §4 |
| `lib/utils/reduced-motion.ts` | 24 | **替换** | 用 `@vueuse/core` 的 `usePreferredReducedMotion`？否——引擎是 framework-free，保留一个等价的裸监听器，但复用 tuffex 既有写法 |
| `lib/utils/spring.ts` | 106 | **删除** | 由 `liquid/src/spring.ts` 的 `resolveTransition` 承担 |
| `lib/utils/easing.ts` | 128 | **部分删除** | `parseEasing` → `easingFunction`（已有）；只保留 `slopeAt`（8 行）并入 `engine/container.ts` |
| `lib/utils/styles.ts` | 118 | **重写** | 运行时注入 `<style>` → SFC `<style lang="scss">` |
| `vue/TextMorph.ts` | 116 | **重写** | h() 渲染函数 → tuffex 的 `<script setup>` SFC |

净移植 ~2400 行，删除/替换 ~550 行。

## 2. 为什么不复用 tuffex 的 `useFlip`

`packages/utils/animation/flip.ts` 的 `useFlip` 是**单元素**的 first/last 记录器：接一个 `Ref<HTMLElement>`，用 CSS transition 驱动，靠 `transitionend` 收尾。

引擎需要的是：一次 `getBoundingClientRect` 扫过 root 的**全部子元素**、按段 ID 建表、减去当前 transform 保持亚像素、再用 WAAPI（不是 CSS transition）逐元素起动画——因为只有 WAAPI 能在打断时读回 `getAnimations()` 的实时进度并 cancel。两者的形状不兼容，硬套会把 200 个字符各挂一个 `transitionend` 监听。

结论：`engine/flip.ts` 独立移植，`useFlip` 不动。这是**没有**融合的地方，写清楚免得后来者反复推翻。

## 3. 融合点：弹簧与缓动

这是本次移植真正的「融合」，也是唯一一处上游代码被 tuffex 既有实现取代。

`liquid/src/spring.ts` 已提供：

- `resolveTransition(t, reducedMotion) → { duration, easing }`：接 preset (`snappy`/`smooth`/`bouncy`)、`SpringConfig`、或 `{ duration, ease }`；输出 CSS `linear(...)`，`CSS.supports` 不支持时回落 cubic-bezier；带缓存。
- `easingFunction(spec) → (t) => number`：把 `linear()` / `cubic-bezier()` / 关键字求值成 JS 函数。

torph 的 `spring()` 与 `parseEasing()` 是同一件事的另一套实现。取 tuffex 的，因为：

1. 与 slider / liquid 共用同一条曲线词汇，整库动效语言一致；
2. `resolveTransition` 已内建 reduced-motion 短路（`{ duration: 0 }`）；
3. 少 234 行重复代码。

**接口适配**：`engine/container.ts` 的 `carry()` 需要 `slopeAt(base, t)`，而 `slopeAt` 只依赖 `EasingFn`。所以：

```ts
// engine/container.ts
import { easingFunction } from '../../../liquid/src/spring'

const H = 1e-4
function slopeAt(easing: (t: number) => number, t: number): number {
  const a = Math.min(Math.max(t, 0), 1 - H)
  return (easing(a + H) - easing(a)) / H
}
```

注意 `easingFunction` 对无法识别的 spec 返回**线性钳位**函数（`Math.min(1, Math.max(0, t))`），而 torph 的 `parseEasing` 返回 `null` 让调用方回落到「从静止起步」。差异只影响 carry 的强度，不影响正确性：线性曲线 `slopeAt = 1`，carry 会按 `k = velocity - 1` 计算，仍然被 `CARRY_MAX` 与 `k > 0` 守卫夹住。可接受，但要在 `container.ts` 写注释标出这条偏差。

**导入路径**：`text-morph/src/engine/*` → `../../../liquid/src/spring`。库内相对引用不走桶，precedent 是 `code-stream`/`stream-markdown` 直引 `copy-button` 的 SFC。`liquid/src/spring.ts` 是纯 TS、无 Vue、无 CSS 的叶子模块，不会把 liquid 的样式拖进来。`liquid` 不在 `audit-package-size.mjs` 的 `onDemandImportBudgets` 名单里，也不在 `text-morph`/`text-transformer` 的名单里（两者都没进名单），所以不触发 allowlist。

## 4. 文件布局与类型命名

```
packages/tuffex/packages/components/src/text-morph/
├── index.ts                     withInstall(TxTextMorph)
├── src/
│   ├── TxTextMorph.vue          <script setup> 壳 + 引擎 CSS（非 scoped）
│   ├── types.ts                 TextMorphProps
│   └── engine/
│       ├── index.ts             桶：TextMorphEngine / MorphController / 类型
│       ├── morph.ts             编排
│       ├── controller.ts        实例生命周期
│       ├── segment.ts
│       ├── diff.ts
│       ├── number.ts
│       ├── lcs.ts
│       ├── flip.ts
│       ├── dom.ts
│       ├── container.ts
│       ├── animate-text.ts
│       ├── animate-number.ts
│       ├── animate-group.ts
│       ├── constants.ts
│       ├── reduced-motion.ts
│       └── types.ts
└── __tests__/
    ├── text-morph.test.ts       组件冒烟
    └── engine.test.ts           引擎单测
```

**类型命名（星号桶重名会被静默丢弃，必须避开）**：

| 上游 | tuffex 内部名 | 是否导出到公共桶 |
|---|---|---|
| `Segment` | `MorphSegment` | 否（engine 内部） |
| `SegmentKind` | `MorphSegmentKind` | 否 |
| `Measures` | `MorphMeasures` | 否 |
| `TextMorphOptions` | `TextMorphEngineOptions` | 否 |
| `TextMorph`（class） | `TextMorphEngine` | 否 |
| — | `TextMorphProps` | **是**（组件 props，比照 `TextTransformerProps`） |

只有 `TxTextMorph` 与 `TextMorphProps` 出现在 `components.ts` 的星号桶里。`Segment` 这种名字连导都不导，从源头断掉碰撞。

## 5. `TxTextMorph` 公共 API

```ts
export interface TextMorphProps {
  /** 要渲染的值；数字按 locale + decimals 格式化后再形变。 */
  text: string | number

  tag?: string                    // 默认 'span'（tuffex 用 tag，不用 as）
  durationMs?: number             // 默认 400
  easing?: string                 // 默认 'cubic-bezier(0.19, 1, 0.22, 1)'
  /** 给了它就由弹簧推导 durationMs + easing，二者被忽略。 */
  spring?: MorphSpring            // 'snappy' | 'smooth' | 'bouncy' | { stiffness, damping, mass }

  scale?: boolean                 // 默认 true，退场字符是否缩放
  numbers?: boolean               // 默认 true，数字按位值滚动
  decimals?: number               // 仅当 text 是 number 时生效
  locale?: string                 // 默认 'en'
  /** 输入框场景：给了它就按光标匹配而非按位值匹配。 */
  cursorIndex?: number

  disabled?: boolean              // 默认 false
  respectReducedMotion?: boolean  // 默认 true
  debug?: boolean                 // 默认 false，描边每个段
}
```

emits：`animation-start` / `animation-complete` / `animation-cancel`（每次形变里后两者恰好触发其一）。

`MorphSpring` 复用 `liquid/src/spring.ts` 的 `TransitionPreset | SpringConfig`，但**不重新导出** `Transition` 这个名字。

**props 命名理由**：`durationMs` 而非 torph 的 `duration`——tuffex 现存 `TextTransformerProps.durationMs`、`GlowTextProps.durationMs`、`KeyframeStrokeTextProps.durationMs` 都带 `Ms` 后缀，跟库走而不是跟上游走。

## 6. 样式落地

torph 用 refcount 管一个注入 `document.head` 的 `<style>`。tuffex 的构建按组件产出 CSS，两者冲突。

改为：引擎 CSS 全部写进 `TxTextMorph.vue` 的 `<style lang="scss">`（**不加 scoped**）。段元素是 `document.createElement` 造的，拿不到 `data-v-*`，scoped 会让规则全部失效。选择器一律以 `[tx-morph-*]` 属性开头，作用域由属性名保证。

`removeStyles()` / `addStyles()` / refcount 整套删除。

关键 CSS 要点（逐条从上游注释抄来，不能凭感觉简化）：

- `[tx-morph-root]`：`display: inline-block; position: relative; vertical-align: top; white-space: nowrap; will-change: width, height`。
- `[tx-morph-item]:not(br)`：`display: inline-block; position: relative`。
- `[tx-morph-sr]`：视觉隐藏但留在无障碍树里——`clip-path: inset(50%)` 而非 `display: none`；`user-select: none`，否则复制粘贴出两份值。
- `[tx-morph-slot]`：`clip-path: inset(0 -100vw)`。**必须是 clip-path 不是 overflow**——`overflow` 非 `visible` 的 inline-block 基线被合成到 margin 底边（CSS 2.1 §10.8.1），数字会掉出基线。横轴留开，否则字形溢出被削。
- slot 的 mask 渐变藏在 `@supports (mask-clip: no-clip)` 里，`--tx-morph-fade` 默认 `0.15em`。

变量名 `--torph-fade` → `--tx-morph-fade`。

## 7. `TxTextTransformer` 改造

新增 `mode?: 'morph' | 'fade'`，默认 `'morph'`。

实现方式：morph 模式下**渲染 `<TxTextMorph>`**，而不是直接调引擎。这样 CSS 随组件一起进 bundle，不用再造一份样式入口。

```
tx-text-transformer (根，保留 flex 版式与 is-wrap/截断规则)
└── mode === 'morph' ? <TxTextMorph :text :tag="'span'" :duration-ms /> : 旧的双层结构
```

**兼容性**：

- `durationMs` 默认保持 `240`（不改成 morph 的 400）。改已发布 props 的默认值是行为变更；240ms 的逐字形变偏快但可用，文档里建议 morph 场景调到 400。
- `blurPx` 只对 `fade` 生效，types 注释写明。
- **默认插槽**：现有 API 是 `<slot :text="currentText">`。引擎接管的是纯文本，无法渲染任意 slot 内容。处理：**检测到默认插槽时强制退回 `fade`**，并在 types 与文档里写明。这条不能漏——`SwitchSettingsRowDemo` 之类可能在用插槽。
- `wrap`：引擎根是 `white-space: nowrap`，`wrap=true` 时需要覆盖为 `pre-line`；换行由引擎自己插 `<br tx-morph-item>` 处理，能对上。

## 8. `TxBadge` 改造

现状三段耦合：`NumberFlow` 渲染 + `ResizeObserver` 量 `.tx-badge__number` 宽度 + `.tx-badge--numeric` 的 `width 180ms` CSS 过渡。

引擎自带容器宽高过渡，所以三段全部塌成一段：

```vue
<span v-if="numericValue !== null" class="tx-badge__number">
  <TxTextMorph :text="numericValue" :duration-ms="260" />
</span>
```

删除：`NumberFlow` import、`numericContentRef`、`numericWidth`、`numericWidthObserver`、`measureNumericWidth`、`observeNumericWidth`、`numericStyle`、对应的 `watch`/`onMounted`/`onBeforeUnmount`，以及 `.tx-badge--numeric` 里的 `width 180ms` 过渡项。

`box-sizing: content-box; overflow: clip` 保留（pill 的形状约束），但要验证 `overflow: clip` 不会把 slot 的纵向滑动削掉——badge 高度只有一行，数字从上方滑入时上半程在容器外。**这是本次改造最可能出问题的一处**，验证不过就把 `overflow: clip` 换成 padding 补偿，或给 badge 的 morph 关掉 `numbers`（退回字符级）。

依赖移除：`@number-flow/vue` 从两个 package.json 删除；`badge.test.ts` / `stat-card.test.ts` 里的相关 mock 一并清理（`stat-card.test.ts` 提到它但 `TxStatCard.vue` 并不用，属于陈旧 mock）。

## 9. 无障碍与降级

- 每个段元素 `aria-hidden="true"`；完整值放在一个 `[tx-morph-sr]` 的 span 里，视觉隐藏但可读。
- `disabled` 或 `prefers-reduced-motion: reduce` → 直接 `element.textContent = value`，并把 `previousSegments` 清空、`isInitialRender` 置回 `true`。这一步是上游的坑点注释：不清空的话，用户中途关掉 reduced-motion，下一次 diff 会拿已从 DOM 移除的元素做 FLIP。
- `respectReducedMotion` 的监听器在 `destroy()` 里解绑。

## 10. 风险

| 风险 | 触发条件 | 缓解 |
|---|---|---|
| jsdom 无 `Intl.Segmenter` / `element.animate` | 单测 | 引擎已有 `segmentsFallback`；测试里 stub `animate` 返回带 `onfinish`/`cancel`/`currentTime` 的假对象 |
| `TxSwitch` 标签版式塌陷 | morph 根是 `inline-block`，transformer 根是 `inline-flex`（当年专门为消除 strut 改的） | 保留 transformer 的 flex 根，morph 作为 flex item；实机核验 switch demo |
| badge 数字被 `overflow: clip` 削掉 | §8 | 见 §8 的两条回退 |
| `easingFunction` 与 `parseEasing` 的 null 语义差异 | carry 计算 | §3 已分析，写注释标注 |
| 单文件超 48 KiB JS 预算 | `audit:size` | 引擎已拆 15 个文件，最大的 `diff.ts`/`number.ts` 各 ~400 行，远低于阈值 |
| nexus 文档门 | `tuffex-component-docs-coverage` | 组件导出与文档必须同一批落地，中间态会红 |
