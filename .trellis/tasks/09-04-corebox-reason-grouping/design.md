# 技术设计 · CoreBox 空态推荐理由分组

## 管线与断点

```
RecommendationEngine.getRecommendations()
  ├─ 打分产出 ScoredItem[]  (source ∈ 9 种)          ✅ 已有
  ├─ ItemRebuilder.rebuild()
  │    └─ meta.recommendation = { score, source, reason, badge }
  │                                    ▲ 断点 A：pinned 缺失、两种来源共用「推荐」、无 evidence
  └─ buildContainerLayout()
       └─ sections = [recommendations, pinned]  mode:'grid'
                                    ▲ 断点 B：不按 source 分组、pinned 在底、grid
                                              ↓
                              BoxGrid.vue
                                    ▲ 断点 C：读 section.title，不读 section.layout
```

三个断点分别对应 S3 / S4 / S6。S1、S2 是它们共同依赖的契约与纯函数。

## C1 · `evidence` 契约（`packages/utils`）

`TuffItem['meta']['recommendation']` 扩展：

```ts
recommendation?: {
  source:
    | 'frequent' | 'recent' | 'time-based' | 'trending'
    | 'pinned' | 'context' | 'cold-start' | 'newly-installed'
    | 'plugin'                       // ← 新增，补齐 engine 侧已存在的取值
  score?: number
  stableScore?: number
  volatileScore?: number

  /**
   * 可解释性证据。全部可选：主进程只在拿得到真实数据时填，
   * 渲染层只在字段存在时渲染。任何一侧都不得推断或补默认值。
   */
  evidence?: {
    executeCount?: number       // itemUsageStats.executeCount
    lastExecutedAt?: number     // epoch ms
    installedAt?: number        // epoch ms
    peakHourRange?: { startHour: number; endHour: number }  // 0-23，闭区间，可跨零点
  }
}
```

**为什么是可选子对象而不是扁平字段**：证据是一组同生共死的、来自不同数据表的可选值；扁平化会让 `meta.recommendation` 多出 4 个孤立可选字段，且无法一眼区分「排序输入」（score 系列）与「展示输出」（evidence 系列）。

**为什么全部可选**：PRD R5。宁可少显示一行，也不显示一句假话——这是本任务最初被用户驳回的那版设计的教训。

## C2 · 分组顺序单一真源

新建 `packages/utils/core-box/recommendation.ts`：

```ts
export const RECOMMENDATION_SECTION_ORDER = [
  'pinned', 'frequent', 'time-based', 'recent',
  'newly-installed', 'context', 'plugin', 'trending', 'cold-start'
] as const

export type RecommendationSource = (typeof RECOMMENDATION_SECTION_ORDER)[number]
```

`recommendation.source` 的联合类型改为引用 `RecommendationSource`，让「联合类型」与「顺序」由同一个数组派生——避免再次出现 `'plugin'` 只在一侧存在的漂移。

顺序理由：确定性强的排最前（人工 pinned > 高频 > 当前时段 > 最近），推断性强的排最后（trending / cold-start）。

## C3 · `buildContainerLayout()` 改写

```ts
private buildContainerLayout(_options, items: TuffItem[]): TuffContainerLayout {
  // 1. 按 source 分桶；meta.pinned.isPinned 强制进 pinned 桶（优先于 source）
  // 2. 按 RECOMMENDATION_SECTION_ORDER 遍历，跳过空桶
  // 3. 每桶取前 3 项（已按 score 降序）
  // 4. section = { id: source, title: `corebox.reason.${source}`, layout: 'list', itemIds, meta: { source } }
  return { mode: 'list', sections }
}
```

- `title` 存 **i18n key** 而非成品文案：主进程不持有用户语言。渲染层 `t(section.title)`。
  兼容性：现有 `title: 'Recommend'` 是字面量英文；渲染层需对「不含 `.` 的 title」按字面量回退，否则旧缓存的 layout 会显示成 key 字符串。
- `mode` 从 `'grid'` 改为 `'list'`，`grid` 字段不再产出。

## C4 · `resolvePeakHourRange` 规则

纯函数，输入 `hourDistribution: number[]`（长度 24），输出 `{ startHour, endHour } | null`。

1. 长度不为 24，或总和 `< 10` → `null`（样本不足，不猜）
2. 滑动 3 小时窗口（**含跨零点回绕**：`22,23,0`），取和最大的窗口
3. 该窗口占总和比例 `< 0.4` → `null`（分布太平，说不出「常在某时段」）
4. 否则返回 `{ startHour: 窗口首, endHour: 窗口尾 }`

阈值 10 / 0.4 是保守起手值，宁缺毋滥。真实数据上偏紧可在后续任务放宽——见 PRD 验收 7。

## C5 · `BoxGrid.vue` 分支

现有 `SectionData { section, items, startIndex }` 与全局 index 累加逻辑**不动**（`⌘N` 快捷键编号依赖它跨 section 连续）。

新增：`section.layout === 'list'` 时渲染行组件（图标 22×22 / 标题 13px / 证据 11px `$text-muted` / 右侧 `⌘N`），否则走原 `BoxGridItem` 网格路径。

`getSectionVisibleItems()` 的 intelligence 截断（`columns * 2`）**只作用于 grid 分支**——list 分支条数已由主进程的每组 3 项决定，二次截断会互相打架。

## 兼容性 / 回滚

- **旧缓存 layout**：`recommendationCache` 里可能存着 `mode:'grid'` 的旧 layout。渲染层按 `section.layout` 逐组判断，`undefined` 走 grid，天然兼容。
- **`@talex-touch/utils` 变更是纯增量**：新增 `'plugin'` 成员与可选 `evidence`，无破坏性改动，不需要 major bump。
- **回滚点**：S4（`buildContainerLayout`）是唯一改变用户可见结构的步骤。单独 revert S4 即可回到旧网格，S1–S3 的字段增量无副作用可保留。

## 风险

`recommendation-engine.test.ts`（2238 行）与 `item-rebuilder.test.ts`（514 行）必然有断言依赖旧的 section 结构与旧文案。**逐个读懂再改，不许为了跑绿把断言删掉**——断言反映的是旧契约，要改成新契约，不是删除。
