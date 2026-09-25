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
