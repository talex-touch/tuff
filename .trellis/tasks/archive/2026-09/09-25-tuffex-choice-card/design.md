# 设计：TxChoiceCard

## 1. 文件

```
packages/tuffex/packages/components/src/choice-card/
  index.ts
  src/types.ts            # ChoiceOption / ChoiceStep / ChoiceCardProps / ChoiceSelectPayload
  src/TxChoiceCard.vue
  __tests__/choice-card.test.ts
  __tests__/choice-card-motion.test.ts   # sass 编译后的样式契约（仿 mode-chip-motion.test.ts）
```

## 2. API

```ts
interface ChoiceOption {
  id: string
  label: string
  description?: string
  /** ITuffIcon 或图标类名；类名要求调用方自己保证 UnoCSS 能生成（见 tuffex-docs-sync 的图标说明） */
  icon?: ITuffIcon | string
  disabled?: boolean
}
interface ChoiceStep { id: string, title: string, options: ChoiceOption[] }

props: {
  steps: ChoiceStep[]
  step?: number            // v-model:step，默认 0
  selected?: string        // 已选项 id（回看时高亮）
  loading?: boolean        // 选项区骨架屏
  columns?: 1 | 2          // 默认 1；两列在容器宽度 < 480px 时（@container）退回一列
  appear?: boolean         // 选项逐项错落入场，默认 true
  prevLabel?: string       // 默认 'Previous'
  nextLabel?: string       // 默认 'Next'
  stepLabel?: (current: number, total: number) => string   // 默认 `${c} / ${t}`
}
emits: {
  'update:step': [index: number]
  select: [payload: { step: ChoiceStep, stepIndex: number, option: ChoiceOption }]
}
slots: { header?: { step, stepIndex, total } }   // 替换标题区（例如在标题旁放头像）
```

## 3. 结构与样式

```html
<section class="tx-choice-card" :aria-labelledby="titleId">
  <header class="tx-choice-card__head">
    <nav v-if="total > 1" class="tx-choice-card__pager">‹ 1 / 2 ›</nav>
    <h3 :id="titleId" class="tx-choice-card__title">{{ step.title }}</h3>
  </header>
  <div class="tx-choice-card__options" role="list" @keydown="roving">
    <button v-for class="tx-choice-card__option" role="listitem" :disabled>
      <span class="tx-choice-card__icon" aria-hidden="true" />
      <span class="tx-choice-card__text"><span class="…label" /><span class="…desc" /></span>
    </button>
  </div>
</section>
```

- 卡片：`--tx-bg-color` 不透明底（按设计规范「需要遮住下面内容的表面要有不透明底」），外圈用 ring 不用 border；圆角与选项圆角同心（外 = 内 + 内边距）。
- 选项：`--tx-fill-color-light` 填充；hover 立即切到 `--tx-fill-color`；focus-visible 用主色 ring。
- 标题 14px / 600；选项标题 14px / 500；说明 12px、`--tx-text-color-regular`（规范：13px 以下辅助文字可用 secondary，但这里说明是用户要读的内容，用 regular 保证对比度）。
- 切步动画：选项列表 key 到 `stepIndex`，`<Transition mode="out-in">` 模糊淡入（160ms），`prefers-reduced-motion` 下关闭。

## 4. 键盘

roving：方向键上下在未禁用选项间移动焦点（循环），两列时左右键在同一行两项间移动、上下键跨行；`Home` / `End` 首尾；Tab 进入卡片时落在第一个未禁用选项（或 `selected`）。分页按钮在选项之前的 Tab 顺序里。

## 5. 文档

- 位置：`DocsSidebar.vue` 的 AiChat 分组，`suggestion-chips` 之后；分类脚本同位置；画廊格放在 SuggestionChips 旁。
- 页面节序按 `nexus-docs-structure.md`；`## 相关组件` 链接 `suggestion-chips`、`recommendation-card`。
- demo：`ChoiceCardSingleDemo.vue`（单步）、`ChoiceCardStepsDemo.vue`（两步引导：选类别 → 选具体事）、`ChoiceCardLoadingDemo.vue`。

## 实现偏差

实现与上文不同的地方，每条附原因。检查阶段逐条复核过，文档页描述的是实现后的行为。

- **结构是 `<ul role="list">` / `<li>` / `<button>`，不是 `div role="list"` 加 `button role="listitem"`。** 给按钮加 `role="listitem"` 会覆盖它的按钮角色，读屏不再把选项读成按钮。列表语义交给 `<ul>` / `<li>`，按钮保持原生语义。`role="list"` 要显式写：WebKit 会给 `list-style: none` 的列表去掉列表语义。
- **分页是 `<div class="tx-choice-card__pager">`，不是 `<nav>`；计数器带 `role="status"`。** 每张卡片一个 `<nav>`，页面地标列表里就多一个「导航」，而它只是卡片内部的翻页。翻页（包括宿主在 `select` 里程序化翻页）要能被听到，按设计规范「不经用户操作而变化的状态用 `role="status"`」处理，隐含 `aria-live="polite"`。
- **标题 id 在外层包裹 `.tx-choice-card__heading` 上，不在 `<h3>` 上。** `header` 插槽替换掉 `<h3>` 后，卡片与答案列表仍有名称（两处 `aria-labelledby` 都指向包裹元素）；`<h3>` 带 id 还会被文档页大纲收成一节。
- **新增 `loadingRows`（默认 3，限制在 1–24）。** 骨架行数和随后到来的选项数不一致时，加载完成那一刻卡片高度会跳，而骨架屏存在的意义就是不跳。设计里没有这个输入。
- **`step` 默认 `undefined`，不是 `0`。** 默认 0 时，不绑定 `v-model:step` 的卡片永远停在第一页（`props.step` 恒为 0 压过内部页码）。`undefined` 让卡片不受控时自己记页，并照常派发 `update:step`。
- **翻页入场是「标题与列表按页 key 重新挂载，新节点跑 CSS 关键帧」，不是 `<Transition mode="out-in">`。** out-in 要等旧页离场完才挂新页，这 160ms 里新选项不存在、点不到。关键帧在新节点上立刻开始，选项第一帧就能点，减少动态效果时只去掉运动。key 是 `页码:步骤 id` 而不只是页码，所以宿主原地换掉一页（换 id）也会重放入场，标题和列表一起模糊淡入。
- **两列时左右键按阅读顺序移动（跨行、首尾循环），上下键在同一列内移动。** 只在同一行两项间移动，左右键会在行尾卡住，只靠左右键无法走完整个列表；阅读顺序是它的超集，行内移动的行为不变。单列时左右键不处理，留给页面。
- **画廊格不用 `useGalleryLoop`。** 这一格是可操作的（点选、翻页），自动循环会和读者抢状态；计数器是 `role="status"`，循环会一直朗读，违反 `tuffex-docs-sync` 的「aria-live 后面的文字不循环」。页状态放在 `GalleryChoiceCard.vue` 里，画廊的重置按钮重新挂载它就能重放入场。
- **（检查阶段）样式表压到 4 KiB 以内，渲染不变。** 按需 CSS 总量闸门没有余量，编译后从 5.1 KiB 压到 3.9 KiB，亮 / 暗两套全页截图逐像素一致。做法：动画只在 `@media (prefers-reduced-motion: no-preference)` 里声明（同 `TxStatCard`），不再「先声明、再在 reduce 里取消」；骨架条的盒子统一用 `height: 1lh`（元素自己的行高），取代按行高变量分别写死高度的三条规则；两列只写在 `@container tx-choice-card (width >= 480px)` 里；墨色能继承就继承（标题、选项、标签取卡片的主墨色，箭头与计数取分页的常规墨色）；悬停用 `:enabled:hover`，骨架的普通盒子永远匹配不到它。
