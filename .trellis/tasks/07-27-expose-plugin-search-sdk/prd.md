# 开放插件 SearchSDK

## Goal

将仓库现有快速文本匹配能力封装成稳定、通用、可测试的插件进程内 SearchSDK，使 Clipboard History 等插件可以对自己持有的候选集合执行快速匹配、排序和高亮，而不重复实现搜索算法。

## Background

- `packages/utils/search/fuzzy-match.ts` 已提供 typo-tolerant `fuzzyMatch` 和命中索引。
- `packages/utils/search/feature-matcher.ts` 已提供 exact/prefix/contains/fuzzy 的评分与高亮能力，但模型偏向插件 feature。
- `packages/utils/search/index.ts` 已导出这些底层函数；目前缺少面向插件普通候选集合的高层 SDK 契约。
- `packages/utils/plugin/sdk/types.ts` 中现有 `ISearchManager` 只管理 query 与时间戳，不是候选搜索服务。
- 用户已决定 SearchSDK 在插件进程内执行，不通过宿主 transport，也不新增权限。

## Requirements

- 提供从 `@talex-touch/utils/plugin/sdk` 可发现的 SearchSDK 公共入口。
- SearchSDK 接收插件已拥有的候选集合和受约束的字段提取配置，不读取宿主或其他插件数据。
- 复用现有快速匹配算法，统一 exact、prefix、contains、subsequence 与 typo-tolerant 行为。
- 返回稳定排序、归一化分数、命中字段和可用于 UI 高亮的范围。
- 支持结果上限和确定性 tie-break；同一搜索会话可逐批加入候选并稳定维护有界 Top-K。
- 提供已处理候选数、命中数和当前结果快照，使消费者能表达渐进覆盖状态。
- 空 query、空候选、重复 id、重复文本、Unicode 输入和 AbortSignal 行为明确。
- API 必须是纯本地、无 transport、无权限请求、无持久化副作用。
- Clipboard History 作为首个真实消费者，但 SDK 类型和命名不得绑定 Clipboard 领域。
- 不直接导出 CoreApp 私有 sorter 或依赖 `TuffItem` 宿主排序权重。

## Acceptance Criteria

- [ ] 插件可从正式 plugin SDK 入口创建或调用 SearchSDK。
- [ ] exact/prefix/contains/subsequence/typo、字段权重、高亮范围、重复 id、稳定排序、增量批次和 limit 均有单元测试。
- [ ] 逐批加入同一候选集合与一次性搜索得到相同 Top-K 顺序。
- [ ] 搜索会话暴露真实 processed/matched 统计并响应 AbortSignal。
- [ ] SDK 不访问 transport、宿主数据库或全局插件状态。
- [ ] Clipboard History 使用 SearchSDK 后不再自建匹配与排序算法。
- [ ] `@talex-touch/utils` 相关 lint、typecheck 和测试通过。
- [ ] 搜索审计 backlog 未被引入新的失效结论；若发现原有条目变化则同步说明。

## Out of Scope

- 暴露完整 CoreBox SearchEngine、FTS 索引、语义召回或用户行为排序。
- 允许插件搜索宿主或其他插件的数据。
- 新增 Search transport、权限或持久化索引。
- 在首轮承诺超大候选集合的 worker/wasm 加速。
