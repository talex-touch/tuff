# Design — `TxStatusHint` 与 CoreBox 操作反馈

需求与验收见 `prd.md`；视觉参数的标定过程与截图见 `research/visual-calibration.md`。

## 1. 边界

```
packages/tuffex/.../src/status-hint/      TxStatusHint：纯展示 primitive。只认 props，不知道 CoreBox、
                                           反馈 store、动效总闸，也不自己决定何时出现/消失。
apps/core-app/.../components/render/
  CoreBoxActionFeedback.vue                CoreApp 薄封装：CoreBoxFooterFeedback → TxStatusHint 的映射，
                                           以及底栏/顶栏两种摆放。
  CoreBoxFooter.vue                        接入底栏；新增 `animated` prop，透传总闸。
apps/core-app/.../views/box/CoreBox.vue    接入顶栏；把 shouldAnimate() 传给底栏与顶栏封装。
apps/nexus/…                               中英文文档、demo、注册链。
.trellis/spec/frontend/…                   corebox-results-contracts.md、tuffex-text-motion.md 同步。
```

`footer-feedback.ts`（数据源、1200ms、替换规则）、唯一播报区 `.CoreBox-ActionFeedback-Live`、
`footerOnScreen` / `headerActionFeedback` 的放置规则都不动。

## 2. `TxStatusHint` 契约

### Props

运行时对象 + `satisfies Record<keyof StatusHintProps, unknown>`（`TxModeChip` 的写法：dev server 不会因为
`types.ts` 变化重编 SFC，类型式声明会让新 prop 以未知属性的身份漏出去）。

| Prop | 类型 | 默认 | 契约 |
| --- | --- | --- | --- |
| `text` | `string \| number` | 必填 | `animated` 时经 `TxTextTransformer`（morph，`durationMs` 380）渲染，值变化逐字变换；否则是纯文本 `<span>` |
| `tone` | `StatusTone` | `'success'` | 色带与图标的色相。`info` 用 `--tx-color-primary`（与 `TxStatusBadge`、`TxModeChip` 一致），`muted` 用 `--tx-text-color-secondary` |
| `size` | `'sm' \| 'md'` | `'md'` | md：13/18px、图标 16、内边距 6/10；sm：12/16px、图标 14、内边距 3/8 |
| `pulseKey` | `string \| number` | — | 挂载后它或 `text` 变化即重放强调（同一 tick 两者都变只算一次） |
| `animated` | `boolean` | `true` | `false`：不挂 `.is-animated`（CSS 动画全关），文字走纯文本分支，不启动 morph 引擎的 WAAPI |
| `live` | `boolean` | `true` | `true`：文字节点 `aria-live="polite"`；`false`：文字节点 `aria-live="off"`，组件内没有任何生效的 live region |

`live=false` 通过给 `TxTextTransformer` 传 `aria-live="off"` 实现：透传属性在 Vue 的 `mergeProps`
里后写者胜，会覆盖它根节点写死的 `polite`。纯文本分支直接写在 `<span>` 上。

### Slots

- `icon`：替换默认图标。外层仍是 `.tx-status-hint__icon`（`aria-hidden="true"`），入场与重放动画照常生效。

默认图标用 `TxIcon` 内置 SVG（Nexus 解析不了 `i-ri-*`）：success `check-circle`、danger `x-circle`、
warning `alert-triangle`、info `info`；`muted` 没有默认图标，除非传了插槽，否则不占图标位。

### DOM

```html
<div class="tx-status-hint tx-status-hint--md is-success is-animated is-pulse-a">
  <span class="tx-status-hint__wash" aria-hidden="true"></span>
  <span class="tx-status-hint__icon" aria-hidden="true"><slot name="icon"><TxIcon name="check-circle" /></slot></span>
  <TxTextTransformer class="tx-status-hint__text" :text="text" :duration-ms="380" aria-live="polite" />
  <!-- animated=false: <span class="tx-status-hint__text" aria-live="polite">{{ text }}</span> -->
</div>
```

### 视觉配方（标定值，见 research）

- 根：`position: relative; isolation: isolate; display: inline-flex; overflow: hidden`；末端遮罩
  `mask-image: linear-gradient(to left, transparent, #000 var(--tx-status-hint-pad-x))`：放不下的值在末端淡出，
  不会压到邻居；放得下的值只是内边距淡出（那里本来就没有字）。
- 色带 `__wash`：`inset: 0`，填充 `--tx-status-hint-accent`；
  `mask-image: <渐变>, <噪点>`，`mask-composite: intersect`。
  - 渐变：`rgb(0 0 0 / s)` 0% → `rgb(0 0 0 / calc(s * .45))` 38% → `transparent` 100%，`s = --tx-status-hint-wash-strength`。
  - 噪点：fractalNoise `baseFrequency .85`、`numOctaves 3`，`feFuncA slope 1.6 intercept -0.2`，140px 平铺。
  - 颗粒因此只存在于色带自身的 alpha 里，不给底色加灰。
- 强度：`0.26`；`:is([data-theme='dark'], .dark) .tx-status-hint` 为 `0.2`（scoped 样式里的写法，编译成
  `… .tx-status-hint[data-v-x]`；`:global(.dark) .x` 会把规则漏到 `<html>` 上，禁用）。
- 文字：`--tx-text-color-primary`、`font-weight: 600`（独立成行的结果短语，沿用被替换的 CoreBox 反馈字重）、`nowrap`。
- 每个 `var()` 带兜底值。

### 动效

只有一种写法：所有 `animation` 声明都写在 `@media (prefers-reduced-motion: no-preference)` 里，并且挂在
`.is-animated` 下。减弱动效时元素停在声明的终态样式上；宿主关闭 `animated` 时同样如此。
关键帧里不出现 `var()`，只动 `opacity`、`scale`、`rotate`、`translate` 这几个独立属性。

| 时机 | 元素 | 关键帧 | 时长 / 缓动 |
| --- | --- | --- | --- |
| 挂载 | 色带 | `opacity 0→1`，`scale .3 1 → 1 1`（原点左缘） | 680ms `cubic-bezier(0.23, 1, 0.32, 1)` |
| 挂载 | 图标 | `scale .4 → 1`，`rotate -30deg → 0` | bouncy 弹簧 |
| 挂载 | 文字 | `scale 1.18 → 1`（原点左缘）；第一帧即可读 | bouncy 弹簧 |
| 重放 | 文字 / 图标 | `1 → 1.12 → 1` / `1 → 1.22 → 1` | 460ms out-strong |
| 重放 | 色带 | `opacity .45 → 1`，`scale .72 1 → 1 1` | 560ms out-strong |
| 值变化 | 文字 | `TxTextTransformer` morph（与重放同时发生） | 380ms，引擎默认缓动 |
| 离场 | 根 / 图标与文字 | `opacity → 0`，供宿主 `<Transition name="tx-status-hint">` 使用 | 240ms / 120ms |

- 弹簧：脚本里调用一次 `resolveTransition('bouncy')`（`liquid/src/spring.ts`），得到 746ms 和 `linear(…)`，
  写成根节点的内联变量 `--tx-status-hint-spring` / `--tx-status-hint-spring-duration`，CSS 读取时带
  `cubic-bezier(0.34, 1.56, 0.64, 1)` / `620ms` 兜底。不另写弹簧。
- 重放：`pulse` 在 `1 ↔ 2` 之间翻转，对应 `.is-pulse-a` / `.is-pulse-b`。两套关键帧内容相同，只有名字不同：
  改 `animation-name` 就能让 CSS 动画从头开始，不需要强制回流。首次挂载两个类都没有（入场负责）；`animated=false` 时不翻转。
- 离场类不改定位，只管透明度；要不要让离场元素脱离文档流由宿主决定。

### 环境

- jsdom 没有 WAAPI：morph 引擎自己落到终态（`engine/metrics.ts` 的 `animateElement`）。
- SSR：`TxTextMorph` 首帧渲染纯文本，水合一致。

## 3. CoreApp 薄封装 `CoreBoxActionFeedback.vue`

```ts
defineProps<{
  feedback: CoreBoxFooterFeedback
  placement: 'footer' | 'header'
  animated: boolean
}>()
```

- 映射：`tone`（`error` → `danger`，其余 → `success`）；`text = feedback.message`；`pulseKey = feedback.id`；
  `live = false`（唯一播报区在 wrapper 上）；`size`：底栏 `md`、顶栏 `sm`。
- 图标插槽：`<i class="CoreBoxActionFeedback-Icon i-ri-checkbox-circle-line | i-ri-error-warning-line" />`，
  保留 spec 里的两枚 Remix 图标。
- 根节点类：`CoreBoxActionFeedback is-footer|is-header is-success|is-error`（`is-error` 给现有测试和 spec 用；
  TuffEx 自己的类是 `is-danger`）。
- 摆放（封装的 scoped 样式，作用在 `TxStatusHint` 根上）：
  - `is-footer`：`position: absolute; inset-block: 0; inset-inline-start: 0; width: 50%; pointer-events: none;`
    `--tx-status-hint-radius: 0; --tx-status-hint-pad-x: 12px`（与底栏 `px-3` 对齐）。底栏本身是
    `position: absolute`（`CoreBoxFooter-Sticky`），是覆盖层的包含块。
  - `is-header`：`flex: 0 1 auto; min-width: 0`（沿用原来的顶栏布局规则）。

## 4. 接入

### `CoreBoxFooter.vue`

- 新 prop `animated?: boolean`，默认 `true`。
- 模板：`.FooterInfo` 只在 `!shownFeedback` 时渲染索引/条目两个分支；反馈改为底栏的直接子节点：

  ```vue
  <Transition name="tx-status-hint">
    <CoreBoxActionFeedback v-if="shownFeedback" class="FooterFeedback" placement="footer"
      :feedback="shownFeedback" :animated="animated" />
  </Transition>
  ```

  不再按 `id` 设 `:key`：反馈显示期间组件一直挂着，新消息变成 `text` / `pulseKey` 的变化，
  morph 和重放才有机会发生（按 `id` 重挂载时，引擎每次都是「首帧」，永远不做动画）。
- 覆盖层绝对定位，不参与底栏的 `justify-between`；`.FooterInfo` 此时为空，右侧快捷键原地不动。
  反馈结束时条目信息在同一次渲染里回来（现有测试断言），覆盖层在其上淡出 240ms（`pointer-events: none`）。
- 删除 `.FooterFeedback*` 的旧样式。

### `CoreBox.vue`

- `<CoreBoxFooter :animated="shouldAnimate()" …>`。
- 顶栏：`.CoreBox-Configure` 首位的 `<span class="CoreBox-ActionFeedback">…` 换成

  ```vue
  <Transition name="tx-status-hint">
    <CoreBoxActionFeedback v-if="headerActionFeedback" class="CoreBox-ActionFeedback" placement="header"
      :feedback="headerActionFeedback" :animated="shouldAnimate()" />
  </Transition>
  ```

  同样去掉 `:key`。删除 `.CoreBox-ActionFeedback-Icon` / `-Text` 样式，布局规则并入封装。

## 5. 测试

TuffEx（新增，属 spec 要求的新组件清单）：

- `status-hint/__tests__/status-hint.test.ts`：默认渲染与 tone 类；各 tone 默认图标与 muted 无图标；图标插槽；
  `live` 两态（`[aria-live]:not([aria-live="off"])` 与 `role="status"` 的有无）；`animated=false` 不渲染
  `[tx-morph-root]`；`pulseKey` / `text` 变化翻转 `is-pulse-a/b`、首次挂载不带；跨值变化保持同一个
  `TxTextTransformer` 实例；弹簧内联变量存在。
- `status-hint/__tests__/status-hint-motion.test.ts`（sass 编译后的样式契约，照 `mode-chip-motion.test.ts`）：
  每条 `animation` 都在 `no-preference` 块里且挂在 `.is-animated` 下；关键帧不含 `var(`，只动允许的四个属性；
  每个 `var()` 有兜底；tone 与 token 的对应；暗色覆盖用 `:is([data-theme='dark'], .dark)` 形式。

CoreApp（改现有 + 为新契约补断言）：

- 共同：新增一个读取「可访问文本」的测试助手（跳过 `aria-hidden` 子树），替代直接 `.text()`，
  因为 morph 的 DOM 里是「读屏整串 + aria-hidden 分段」两份文字。
- `render/CoreBoxFooter.feedback.test.ts`：图标选择器改为 `.CoreBoxActionFeedback-Icon`；「底栏不新增播报区」改为
  `[aria-live]:not([aria-live="off"]), [role="status"]`；补：两条消息之间是同一个 `TxStatusHint` 实例（AC2）、
  同文案新 `id` 翻转重放类（AC3）、`animated=false` 时不渲染 morph（AC5）。
- `box/CoreBox.search-status.test.ts`：`announcing()` 排除 `aria-live="off"`；顶栏图标选择器同上；文本读取换助手。

## 6. 与 spec 的偏差及理由

- **morph 引擎会用 WAAPI 动画容器宽度**，不符合 CoreBox「只用合成层属性」原则。接受，理由：老板点名要用
  transformer；底栏覆盖层定宽且绝对定位，宽度变化只发生在覆盖层内部；顶栏只影响 `.CoreBox-Configure` 一行；
  整体受 `shouldAnimate()` 约束。写进 `corebox-results-contracts.md`。
- **色带从 `opacity: 0` 入场**：它是装饰层，不是内容；文字从第一帧起就是不透明的。
- 遮罩（`mask-image`）是静态的，不做动画。

## 7. 兼容与回滚

- 新组件，不改任何现有公开 API；CoreApp 改动限于两处反馈与底栏的一个可选 prop。回滚即撤销提交。
- `audit:size` 的全量 / 按需 CSS 预算几乎没有余量（`scripts/audit-package-size.mjs` 的 `LIMITS` 注释），新样式表
  需要在同一提交里按惯例上调并写带日期的说明，同时核对新 sheet 只含 `.tx-status-hint*` 规则。
- `mask-composite: intersect` 需要 Chromium 120+ / Safari 15.4+；Electron 41 与文档站目标浏览器都满足。

## 8. 风险

| 风险 | 处理 |
| --- | --- |
| CoreApp dev 下组件的 `style.css` 从 tuffex `dist/es/<组件>/style.css` 解析（`electron.vite.config.ts:34`） | 真机验证前先 `pnpm -C packages/tuffex build` |
| TuffEx vue-tsc 比两个下游宽松（Nexus `noUncheckedIndexedAccess`、CoreApp `noUnusedLocals`） | 两个下游都跑，见 `implement.md` |
| eslint `--fix` 会把同源的值导入并进 `import type` | 同源导入一次写成混合形式；lint 后重跑类型检查 |
| 并发 agent 写同一仓库 | 只提交自己的路径；验证不用 stash/checkout |
