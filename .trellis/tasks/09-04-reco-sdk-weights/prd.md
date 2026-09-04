# 推荐 SDK 与权重函数开放:插件走主排序池

Parent: `.trellis/tasks/09-04-corebox-recommend-platform`

## Goal

让第三方插件推送的推荐条目与内置条目在**同一个排序池**里竞争,而非当前的扁平优先级旁路;
把内置权重函数作为受支持的公开 API 开放给插件;
让新索引的文件(尤其图片)能进入推荐,且不打穿推荐缓存。

## 背景 A:插件候选**短路了整个评分函数**

```ts
// recommendation-engine.ts:2243
// Plugin candidates: use priority directly, skip usageStats-based calculation
if (candidate.source === 'plugin' && candidate.pluginCandidate) {
  return (candidate.pluginCandidate.priority ?? 50) * PLUGIN_PRIORITY_WEIGHT
}
if (candidate.sourceId === '__builtin_clipboard_url__' && candidate.pluginCandidate) {
  return (candidate.pluginCandidate.priority ?? 95) * PLUGIN_PRIORITY_WEIGHT
}
// ↓ 以下内置维度插件一律拿不到
//   时间相关性 × 1e5 / 频率(带时间衰减)× 1e4 / 最近使用 × 1e3
//   novelty(新装未执行)/ 语义向量
```

插件条目拿到的是 `priority × PLUGIN_PRIORITY_WEIGHT` 这一个扁平数,
既不随时间上下文变化,也不随用户实际使用变化。这就是父任务需求 6、7 的机制根因 ——
不是「没给插件权重函数」,而是**给了也用不上,因为插件条目根本不进那条评分路径**。

配套的旁路还有:
- `isExternalPriorityCandidate()`(`:2499`)把插件候选划成独立类别
- `rebuildPluginRecommendItems()`(`item-rebuilder.ts:485`)独立于 7 个内置来源的重建路径
- `PluginRecommendCandidate`(`core-box/recommendation.ts:101`)注释直言
  "Unlike internal candidates, these do not require usageStats"

## 背景 B:内置权重函数已是导出函数,但未成为 SDK

`recommendation-utils.ts` 已导出纯函数:
`calculateTimeContextBoost` / `calculateHourAffinity` / `calculateTimeRelevanceScore`,
以及常量 `TIME_CONTEXT_SLOT_BOOST` / `TIME_CONTEXT_DAY_BOOST` /
`TIME_RELEVANCE_SLOT_WEIGHT` / `TIME_RELEVANCE_HOUR_WEIGHT`。
它们在主进程内部,未经 `packages/utils` 暴露,插件拿不到。

## 背景 C:「推荐从不含文件」是刻意设计,且有真实理由

```ts
// search-core.ts:479-485
// The recommendation ranking is cached for 30 minutes, so an app installed
// or removed just now would otherwise stay invisible (or keep showing) for
// that long. Only app commits matter: file commits fire continuously while
// the index builds, and the recommendation grid never contains files.
if (payload.providerIds.includes(APP_INDEXED_SOURCE_ID)) {
  this.recommendationEngine?.invalidateCache()
}
```

父任务需求 5 要推翻这个前提。但**不能简单把 file source 加进这个条件** ——
索引构建期 file commit 连续触发,会把 30 分钟缓存打成持续失效,
`recommendation-freshness-contracts.md` 的缓存失效契约(同步读屏障 + generation counter)
会被高频重入反复冲刷。

正确机制是 **C2 的增量追加**:新索引文件通过 `update` chunk 追加到已打开的空态会话,
**不触发缓存失效**。缓存失效仍只保留给 App 这类低频事件。

## Requirements

### A. 插件候选并入主排序池

- A1 插件条目参与内置维度评分,而非短路返回扁平 priority。
- A2 插件条目**没有** `usageStats` 是事实(宿主不掌握插件内部行为),
  设计必须给出「缺失维度如何处理」的明确规则,而不是补零 ——
  补零会让插件条目在频率/最近使用维度上恒定垫底,与现状同样不可用。
- A3 `priority` 语义保留但降级为**其中一个维度**,不再是唯一决定因素。
- A4 宿主可观测到的插件条目行为(用户是否执行了该条目)应回流为该条目的 usageStats,
  使插件条目在被使用后能获得真实 frecency。
- A5 `__builtin_clipboard_url__` 这条内置伪插件候选一并处理,不得留成特例。

### B. 权重函数作为公开 SDK

- B1 经 `packages/utils` 暴露内置权重纯函数与其常量,带公开签名、文档与测试。
- B2 暴露范围需明确边界(见开放问题 Q4):仅时间类纯函数,还是含 frecency 主评分。
- B3 暴露的函数必须是**纯函数**,不得让插件经此触达 usageStats 原始数据或其他用户的行为数据。
- B4 API 稳定性:一旦暴露即成对外承诺,需标注 sdkapi 版本门槛。

### C. 上下文与缓存时效对插件可见

- C1 插件的 `canProvide(context)` 已能拿到 `ContextSignal`
  (`core-box/recommendation.ts:19`,含 time / clipboard / selection / foregroundApp / systemState,
  内容已哈希)。核查该契约在运行时是否**真的**被完整填充,还是部分字段常为 undefined。
- C2 向插件暴露推荐缓存的时效状态(TTL 剩余、是否 fromCache),
  使插件能判断自己的候选何时会被重新采集。
- C3 隐私边界不变:哈希内容、形状元数据可见;原文不可见。

### D. 新索引文件进入推荐

- D1 文件类条目可进入推荐池(推翻「推荐宫格从不含文件」的现有前提)。
- D2 **不得**通过把 file source 加入 `handleSearchIndexCommit` 的失效条件来实现 ——
  索引构建期会持续打穿缓存。改用 C2 的增量追加通道。
- D3 图片等资源类文件的图标/缩略图走 `tfile` 描述符(C2 的控制面),不得传字节。
- D4 需要定义文件类条目的准入规则(否则索引构建期会把成千上万个文件灌进推荐):
  至少限定来源目录、类型与数量上限。

## 非目标

- 不改来源注册表机制(属 C1,本任务是其消费者)。
- 不改传输通道与 chunk 定义(属 C2,本任务提供触发源)。
- 不改空态 UI 分段(属 C4)。
- 不放宽隐私边界。

## 依赖

- **C1**:插件与文件来源需经来源注册表进入重建路径。
- **C2**:增量追加通道是 D1 的实现机制;本任务提供触发,C2 提供承接。

三者可并行开发,但 D 的端到端验收需 C1 + C2 就位。

## 实现记录(2026-09-04)

### design.md §2.1 的「维度归一化」方案已废弃

实测发现评分是**按数量级分层**的,不是归一化加权和:

| 维度 | 权重 | 实际量级 |
|---|---|---|
| time relevance | ×1e5 | 上限 ~1.35e7 |
| novelty | ×1e7(衰减) | 新装未用 |
| semantic local | ×6e5 | |
| frequency | ×1e4 | 重度使用 App ≈1e6 |
| recency | ×1e3 | 上限 1e5 |
| **plugin priority** | **×1e5** | **默认 50 → 5e6** |

归一化会摧毁这套刻意的分层语义。改为**保留分层,把插件 priority 降到它该在的档位**。

### A 的落地(已完成)

- `PLUGIN_PRIORITY_WEIGHT` 1e5 → **1e3**:priority 100 → 1e5,与「一小时内用过」齐平。
  插件能给自己的候选排序、能被看见,但**越不过用户真实使用**。
- **移除短路**:插件候选走完整评分,拿 time / frequency / recency / semantic。
- **usageStats 水合**:此前插件候选无条件 `EMPTY_USAGE_STATS`,宿主记录的执行次数从不生效 ——
  现在用 `getUsageStatsBatch` 按 `sourceId:itemId` 查真实行。这是「用得多就排得高」的实际机制。
- **名额上限**(此前无界):单 provider 5 条、全部插件合计 15 条。
- `__builtin_clipboard_url__` 分到独立的 `HOST_CONTEXT_PRIORITY_WEIGHT`(仍为 1e5,
  **有效分数不变**)并抽出具名常量。它的 `source` 本来就是 `'context'`,
  priority 来自宿主自己观测的信号,不属于插件自报,保留高档位是正确的。

### B 的落地(已完成,按 Q4 决策只暴露时间类纯函数)

`packages/utils/core-box/recommendation-weights.ts` 新建,主进程 `recommendation-utils.ts`
改为 re-export(消除第二份实现)。`RecommendSDK.weights` 暴露
`timeContextBoost` / `hourAffinity` / `timeRelevanceScore` + 5 个常量。

**frecency 不暴露**:它读 `item_usage_stats` 的行结构,暴露等于把内部表冻成 API,
且会让插件读到它没有观测过的用户行为。有静态断言测试守住这条边界。

## Acceptance Criteria

- [x] 插件条目与内置条目在同一评分路径上;`recommendation-engine.ts` 的短路分支已移除。
- [x] 插件条目被执行后排名上升(usageStats 水合 + 完整维度),有前后对比测试。
- [x] 插件把 priority 设到 100 也压不过日常高频 App(判别性测试,旧代码下失败)。
- [x] 名额上限:单 provider 5、合计 15,两条测试。
- [x] `__builtin_clipboard_url__` 有效分数不变(回归守卫),魔法字符串抽为具名常量。
- [x] 权重函数经 `packages/utils` 暴露,13 条测试(含常量固定值与「不暴露 frecency」的断言)。
- [x] 静态断言:暴露的权重 API 无法触达 usageStats。
- [x] `typecheck`(node + web)、recommendation 12 文件 174 测试、utils 权重 13 测试全绿。

### 未完成(D 部分:新索引文件进推荐)

**未做**,原因是它需要一个尚未拍板的产品策略而非工程判断:

- **Q6 未决**:文件准入规则归属(宿主写死 / 用户设置 / 插件声明)。
- 文件索引动辄数万条,准入规则(来源目录、类型、单次与单会话上限、批量节流)
  一旦定错就是「推荐区被文件淹没」的严重回归,且**必须实机观察才能验证**,
  单测无法判定「推荐结果是否变好」。
- 传输侧的承接已由 C2 就位(`recommendationsInvalidated` + 空态刷新),
  D 只差「哪些文件够格」这一层。

`search-core.ts` 中「the recommendation grid does not contain files yet」的注释
已按现状措辞,待 D 落地时更新。

## 开放问题(更新)

- ~~**Q4**~~ 已决:只暴露时间类纯函数,frecency 不暴露。已落地。
- **Q5**:插件条目 usageStats 回流是否需要用户可见的隐私说明 —— **仍未决**。
  注:回流本身此前就在发生(宿主一直在记录执行),本次只是让记录**生效**于排序。
- **Q6**:文件准入规则归属 —— **仍未决**,阻塞 D。

## 风险

- **A2 是本任务最难的设计判断**。插件条目无 usageStats 是结构性事实,不是缺陷。
  处理不当的两个失败模式:补零 → 插件条目永远排在最后(等于没改);
  给默认高分 → 插件可通过多推条目挤占推荐位(变成滥用面)。
- **D4 缺失会造成严重回归**:文件索引动辄数万条,没有准入规则会让推荐区被文件淹没。
- B4 一旦暴露权重函数,后续调参就要考虑向后兼容,会**永久降低排序策略的调整自由度**。
  这是 Q4 需要用户拍板的实质原因,不是文档细节。
- 修改 `recommendation-engine.ts`(3330 行)与其测试(2238 行)风险集中;
  该文件的缓存失效正确性依赖「同步读屏障 + generation counter」的配合,改动需格外小心。

## 开放问题

- **Q4(承自父任务)**:权重函数暴露边界 —— 仅时间类纯函数,还是连 frecency 主评分一并暴露?
  **需用户拍板**,直接决定 B1/B2 范围与长期 API 负担。
- **Q5**:插件条目的 usageStats 回流是否需要用户可见的隐私说明?
  宿主记录「用户执行了某插件条目」属于本地行为统计,但插件可据此推断用户行为。
- **Q6**:文件类条目的准入规则由谁定 —— 宿主写死、用户设置、还是插件声明?
