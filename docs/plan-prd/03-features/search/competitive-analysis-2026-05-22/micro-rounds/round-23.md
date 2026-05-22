# 微审计 23/70

## 审计主题

Favorites / Aliases / pinned 是否在 Tuff 当前搜索排序里有真实锚点，还是主分析文档把 Raycast 的 Favorites / Aliases / frecency 心智过早写成已完成体验。

本轮只审一个具体映射点：Raycast Root Search 会把 Favorites、Aliases、title fuzzy、subtitle / keyword、frecency 放入同一个排序心智；Tuff 当前是否已经有 pinned、alias token、frequency / recency 的执行链路，以及主文档是否仍把缺口落在 ranking explain / evidence，而不是宣称完整 parity。

## 读取/核对的文档或源码锚点

- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/02-raycast-smooth-interactions.md`
  - 第 2.1 节记录 Raycast 空输入 favorites / 最近文件 / 上下文结果，以及 alias、title fuzzy、subtitle / keyword、frecency 排序心智。
  - 第 2.2 节把 Action Panel 常见动作列到 favorite、reset ranking 等，但 Tuff 侧只写已有 `toggle-pin` 等动作桥接，缺口是统一 action taxonomy 和 evidence。
- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/05-search-performance-ranking.md`
  - 第 1 节明确 Tuff 已有 `tuffSorter` 的 match / frequency / recency / kind / pinned / app alias 评分，以及 `RecommendationEngine` 的 frequent / recent / time-based / trending / context / pinned 候选。
  - 第 4 节把最近/常用差距写成 query-level selection accuracy、cancel penalty、pinned position、推荐来源说明和 top-N explain，而不是排序核心缺失。
  - 第 5.4 / 6 节建议新增 ranking explain helper，且强调不改排序主公式。
- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/10-execution-roadmap-synthesis.md`
  - `search-trace-pack-v1` 把 top results ranking explain、provider summary、fixed sample verifier 作为 P0/P1 证据包。
  - 竞品映射表把 Favorites / Aliases 归到 Raycast 丝滑交互，落地物是 `TuffParameterSet`、Action Panel evidence、Quicklinks contract，而不是重写搜索引擎。
- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/11-100-round-cross-review-ledger.md`
  - 第 23 条已经给出本轮主题：`Favorites / Aliases / pinned 是否有排序锚点`，结论为 pinned、frequency、recency 已有排序机制，但缺 top-N explain 样本。
- `apps/core-app/src/main/modules/box-tool/search-engine/sort/tuff-sorter.ts`
  - `calculateSortScore()` 组合 `matchScore`、`frequency`、`recency`、`kindBias`、`appTitleIntentBonus`、`appAliasIntentBonus`。
  - `getAppAliasIntentBonus()` 对 app 的 exact / prefix search token 给大额 intent bonus；`calculateMatchScore()` 对 token / pinyin / initials 命中保持低于可见 title 命中，避免隐藏别名压过真实标题。
  - `tuffSorter.sort()` 在分数比较前先检查 `item.meta?.pinned?.isPinned`，pinned item 会优先排在非 pinned item 前。
- `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts`
  - `_injectPinnedState()` 批量读取 pinned set，并在排序前把命中的结果写入 `item.meta.pinned = { isPinned: true, pinnedAt: Date.now() }`。
  - `CoreBoxEvents.item.togglePin` 会调用 `dbUtils.togglePin()` 并失效 pinned cache；`recommendation.isPinned` 可查询当前固定状态。
- `apps/core-app/src/main/modules/box-tool/search-engine/recommendation/recommendation-engine.ts`
  - `getRecommendations()` 先读取 `getPinnedItems()`，重建为 Tuff item 后标记 `meta.pinned` 和 `meta.recommendation = { source: "pinned" }`。
  - 推荐候选来源包含 frequent、recent、time-based、trending、context、pinned、plugin；评分使用 context match、time relevance、frequency、recency，并有 optional semantic / AI rerank fail-open。
  - `buildContainerLayout()` 会把 pinned item 分到 `id: "pinned"` section。
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useKeyboard.ts`
  - `generateBuiltinActions()` 根据 `item.meta.pinned.isPinned` 生成 `toggle-pin`，文案在“固定到推荐 / 取消固定”之间切换。
- `packages/utils/core-box/tuff/tuff-dsl.ts`
  - `TuffMeta` 已定义 `pinned` 与 `recommendation.source` 字段，推荐来源包含 `pinned`。
- `apps/core-app/src/main/modules/box-tool/search-engine/sort/tuff-sorter.test.ts`
  - 已覆盖 alias / tag 伪高亮不应压过真实标题命中，说明当前排序测试对“隐藏 token 不能过度抢位”有保护。

## 结论

主文档的判断成立：Tuff 不是完全没有 Favorites / Aliases / pinned 的排序基础。当前至少有三条真实链路：

1. **Aliases / tokens 已进排序公式**：app search token exact / prefix 会得到 app alias intent bonus；同时 token 命中仍被限制在可见 title 命中之下，避免为了召回牺牲直觉排序。
2. **Pinned 已进普通搜索排序**：`SearchCore` 在排序前注入 pinned metadata，`tuffSorter` 在分数比较前优先排列 pinned item；MetaOverlay / Action Panel 侧有 `toggle-pin` 入口。
3. **Favorites / 空查询推荐有 pinned source**：`RecommendationEngine` 会从数据库取 pinned records，重建为 Tuff items，标记 `recommendation.source = "pinned"`，并把 pinned section 写进 container layout。

因此，主文档把 Tuff 当前状态写成“有排序和推荐机制，但缺 ranking explain / fixed sample evidence / query-level latching 可验收样本”是准确的。它没有把 Raycast 的 Favorites / Aliases / Reset Ranking / frecency 完整体验说成已闭环。

需要继续保守看待的边界：

1. `pinned` 当前是排序和推荐锚点，但还不是 Raycast Favorites 的完整用户体验；缺可见来源说明、固定顺序管理、reset ranking / undo 类动作证据。
2. `appAliasIntentBonus` 是排序公式中的强信号，但用户侧还缺“为什么这个 alias 命中排第一”的 top-N explain。
3. `RecommendationEngine` 的 frequency / recency / time-based / semantic scoring 存在，但主文档要求的 query-level “同一 query 选择 A 三次后是否稳定 top1”样本还没有落成证据包。

后续如果实现，不应重写搜索引擎。更小的闭环是按 `05` 的方案拆出 `calculateSortScoreWithExplain()`，只对 top 5 / top 10 输出 `match / frequency / recency / pinned / appAliasBonus` bucket，再用固定样本验证 pinned app、alias query、recent app、cancel penalty。

## 是否发现需修正的主文档问题

否。

未发现需要修改 `01-11` 主分析文档的问题。主文档没有把 pinned / alias / recommendation 机制夸大成 Raycast 完整 parity；它明确把剩余工作放在 ranking explain、source badge、fixed sample verifier、query-level selection evidence 和 Action Panel evidence 上，与当前源码一致。

## 本轮未改业务代码、未提交 git 的说明

本轮只新增本微审计 Markdown 文件：`docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/micro-rounds/round-23.md`。

未修改业务代码，未修改 `01-11` 主分析文档，未修改 `docs/INDEX.md`、README、TODO、CHANGES，未执行 git commit / push / branch / reset / checkout / clean。
