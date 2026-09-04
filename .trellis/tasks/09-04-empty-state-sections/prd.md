# 空态两段 UI:此刻常用宫格 + 最近案例列表

Parent: `.trellis/tasks/09-04-corebox-recommend-platform`

> 轻量任务,PRD-only。若实施中发现渲染端改动超出预期(尤其快捷键映射),
> 再补 `design.md`。

## Goal

把 CoreBox 空态从「两个宫格 section」改为设计稿的「宫格 + 列表」两段,
并把散落三处的推荐文案与配色收敛到单一来源、接入 i18n。

## 现状

### 后端产出两个 grid

```ts
// recommendation-engine.ts:1449 buildContainerLayout()
sections = [
  { id: 'recommendations', title: 'Recommend', layout: 'grid', meta: { intelligence: true } },
  { id: 'pinned',          title: 'Pinned',    layout: 'grid', meta: { pinned: true } }
]
```

标题是英文硬编码;分段依据是 `item.meta?.pinned?.isPinned`,不是推荐层级。

### 渲染端忽略 `layout` 字段

`TuffSection.layout: 'list' | 'grid'`(`tuff-dsl.ts:1482`)在类型上存在,
但 `BoxGrid.vue:94-127` 的 section 循环**不读它** —— 每个 section 一律渲染成
`BoxGrid` + `BoxGridItem`。列表分支不存在。

组件本身齐备:`BoxGridItem.vue`(宫格态)与 `BoxItem.vue`(列表态)都已有,
缺的是「按 `section.layout` 选择组件」这个分支。

### 文案与配色散落三处

| 位置 | 内容 |
|---|---|
| `item-rebuilder.ts:653` | badge 文案硬编码中文:`frequent: { text: '常用', icon: 'i-ri-fire-line', variant: 'frequent' }` 等 |
| `ItemSubtitle.vue:92` | variant → 配色 switch(`frequent` → orange,`intelligent` → blue,…) |
| `BoxGridItem.vue:170` | `.badge-frequent` 等样式类 |

全部硬编码,**未接 i18n**(`renderer/src/locales/` 下目前只有 `download-migration.json`)。
新增一个 recommendation source 需要改三个文件,且英文界面会显示中文。

## Requirements

- R1 空态改为两段:
  - 上段 **「此刻常用」**,`layout: 'grid'`,对应设计稿 ⌘1–⌘6
  - 下段 **「最近案例」**,`layout: 'list'`,对应设计稿 ⌘7–⌘0
- R2 `BoxGrid.vue`(或其上层)按 `section.layout` 分支:`'grid'` → `BoxGridItem`,
  `'list'` → `BoxItem`。不新造组件。
- R3 分段依据改为**推荐层级**,不再是 `isPinned`。
  两段的划分规则需在实施时明确(高置信度 vs 探索性),并与 C3 的评分产出对齐。
- R4 Pinned 段的去向需明确:合并进上段、保留为第三段、还是移除。
  设计稿没有 Pinned 段,但**移除是行为删除**,需确认而非默认。
- R5 badge 文案与 variant→配色映射收敛到**单一来源**,三处引用同一份定义。
- R6 文案接入 i18n,中英文各一份;主进程不再硬编码中文字符串。
- R7 快捷键映射(⌘1–⌘6 / ⌘7–⌘0)需与两段对齐。
  当前 `getQuickKey(index)` 基于全局索引,跨段是否仍正确需验证。

## 非目标

- 不改推荐评分与来源(属 C1 / C3)。
- 不改传输通道(属 C2)。
- 不新造 item 组件。
- 不做全局 i18n 基建改造 —— 只补推荐文案所需的部分。

## 依赖

- R3 的分段规则依赖 C3 的评分产出形态。可先用现有 `recommendation.source` 取值临时划分,
  待 C3 落地后对齐。

## 实现记录(2026-09-04)

### R3 的分段依据:按「需不需要解释」而非重要性

设计稿上段是**裸图标**,下段每条都带一句理由(「常在此时打开」「插件」「最近 3 次都在此后打开」)。
这就是真实的分界线,不是「重要 / 不重要」:

- **上段(grid)** = `pinned` + `frequent` —— 用户出于习惯去够的东西,不需要解释
- **下段(list)** = `time-based` / `recent` / `trending` / `context` / `plugin` /
  `newly-installed` / `cold-start` —— 宿主**提议**的东西,有空间说明理由

`HABITUAL_RECOMMENDATION_SOURCES` 就是这条线,放在 `recommendation-presentation.ts`。

### 实施中发现的真实回归:pinned 会被挤进下段

pinned 条目在 item 序里**排最后**(pin 不是分数,由 `combineRecommendedWithPinned` 追加),
按「取前 N 个」填宫格会把用户明确 pin 过的东西推到「这是个建议」那一层。
改为 **pinned 优先占宫格位**,其余按分数序补齐。有专门测试守住。

### Q7 已决:Pinned 段合并进上段,不保留独立分组

原 `{ id: 'pinned', meta: { pinned: true } }` 分组连同渲染端的
`isPinnedSection()` 与琥珀色边框样式一并删除(确认无其他生产者)。
pin 状态仍通过 `item.meta.pinned` 在条目上流转,pin/unpin 交互不受影响。

### Q8 已决:自适应,上限一行

`GRID_TIER_COLUMNS = 6`。宫格封顶一行,溢出落到下段列表 ——
半空的第二行在视觉上是噪音,而且会模糊两段的区分。
设计稿的 6 + 5 正好落在这个规则上。

### 快捷键无需改动

`getQuickKey(index)` 本就是全局索引制(⌘1–⌘9,index 9 → ⌘0),
6 + 5 布局自然给出 ⌘1–⌘6 / ⌘7–⌘0,第 11 项无快捷键 —— 与设计稿一致
(稿中「截图 OCR」那行确实没有 ⌘ 标)。

### 文案收敛

新建 `recommendation-presentation.ts` 作为单一来源:主进程发 `$i18n:` key,
渲染端 `BoxGridItem` / `ItemSubtitle` 用 `resolveI18nText` 解析。
中英文各补 9 条 badge + 2 条分组标题。顺带补齐了此前缺失的 `plugin` variant 配色。

## Acceptance Criteria

- [x] 空态渲染为「此刻常用」宫格 + 「最近案例」列表(en: Right now / Recent picks)。
- [x] `BoxGrid.vue` 按 `section.layout` 分支;list section 复用既有 `BoxItem`,未新造组件。
- [x] 分段依据为推荐层级,非 `isPinned`;Pinned 分组已移除并记录理由。
- [x] badge 文案 + 图标 + variant 为单一来源(`recommendation-presentation.ts`)。
- [x] 主进程不再出现硬编码中文推荐文案。
- [x] 中英文各就位,`translation-coverage.test.ts` 通过。
- [x] ⌘1–⌘6 命中上段、⌘7–⌘0 命中下段(既有全局索引逻辑,无需改动)。
- [x] 空推荐 / 仅上段 / 仅下段 三种情况均有测试(7 条布局测试)。
- [x] `pnpm lint`、`typecheck`(node + web)、250 文件 2029 测试全绿。

**未做**:运行时截图比对设计稿。改动已由单测覆盖到 section 结构与文案 key,
但**视觉效果(列表行高、两段间距)未实机验证**。

## 开放问题

- **Q1(承自父任务)**:「最近案例」与内容存在语义偏差 ——
  设计稿下段含「剪贴板历史 · 插件」「截图 OCR · 插件 · 动作」等条目,并非「最近」发生的对象。
  标题按用户原文记录,**待复核**。
- **Q7**:R4 的 Pinned 去向。
- **Q8**:两段的条目数是固定(6 + 5)还是自适应?
  设计稿是 6 + 5,但 `buildContainerLayout` 现在按 `Math.min(8, totalCount || 8)` 算列数。
