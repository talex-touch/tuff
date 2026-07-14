# Fix search ranking dead features (semantic + completion)

> 父任务：`07-13-search-crossplatform-audit`（B1 + B2）
> 目标：修复两个"功能写了但不生效"的排序缺陷，使既有的补全学习与语义信号真正影响最终排序（或对语义做出诚实的、无浪费的处理）。

## Goal

让 **查询补全权重（B2）** 与 **语义搜索（B1）** 真正参与 TuffItem 最终排序，消除"烧 CPU 但不生效"与"写死 semanticScore:0"的误导。

## 背景（代码级已验证）

- **B2**：`query-completion-service.ts:191` 把 boost 乘进 `item.scoring.match`，但 `tuff-sorter.ts:calculateSortScore` 用 `calculateMatchScore()` 重算 match，只读 `scoring.recency/frequency`，从不读 `scoring.match`/`meta.completion`。经 grep 确认 `scoring.match` 与 `meta.completion` 在搜索引擎/渲染端零消费者 → 补全对排序零效果。
- **B1**：`file-provider.ts:3008` 的 `scheduleSemanticEnrichment` 是 `setTimeout` + `void semanticSearch().catch()`，结果丢弃；`file-provider-search-result-service.ts:280` 写死 `semanticScore: 0`，候选打分公式（256-260 行）无语义项。唯一副作用是暖 query-embedding 缓存。

## Requirements

### B2（修法唯一，进行中）
- `tuffSorter` 最终排序必须体现补全学习：命中补全建议的 item 得到有界正向加权。
- 加权数据从 `item.meta.completion`（由 `injectCompletionWeights` 注入）读取，与既有 `meta.usageStats`/`meta.pinned` 的读取模式一致。
- 移除或修正 `injectCompletionWeights` 中对死字段 `item.scoring.match` 的写入（该写入无消费者、且语义上"重算即丢弃"）。
- 加权幅度保持原意图（补全命中最多 +50% 匹配权重量级），不得让补全 boost 压过真实标题精确匹配（`calculateMatchScore` 的 1000 档）。

### B1（方向待产品决策 → 见下）
- 三选一，落定后补 design 细节：
  1. **候选集内重排（inline，有界）**：仅对当前 ≤120 候选算语义分，融进 finalScore；受 query-embedding 冷缓存限制（launcher 逐键场景命中低）。
  2. **延迟召回二段推送（deferred）**：语义异步跑完后经流式层二段推送更新/新增结果；价值最高、改动最大、需 file provider 流式回传钩子。
  3. **诚实降级（honest disable）**：移除 fire-and-forget 的 CPU 浪费与 `semanticScore:0` 谎言，整条语义路径以显式 flag 门控（默认关）+ 明确 TODO。
- 无论哪个方向：不得给 launcher 同步热路径引入 embedding 生成延迟。

## Acceptance Criteria

- [x] B2：新增回归测试证明——同一 query 下，补全命中的 item 排序**严格高于**未命中的等分 item（`tuff-sorter.test.ts` +2 用例，含控制组）。
- [x] B2：`scoring.match` 死写入已移除；`meta.completion` 由 sorter 的 `getCompletionBoostFactor` 消费。
- [x] B1（方向=延迟召回二段推送）：`FileProvider.semanticRecall` + `scheduleDeferredSemanticRecall` 实现；不再有 fire-and-forget 浪费；召回项写真实 `semanticScore`；+5 用例（去重/降序/上限/短 query/abort）。
- [x] `tsc --noEmit -p tsconfig.node.json` EXIT 0；`tuff-sorter` / `search-core.contracts` / `file-provider-startup` / `semantic-recall` 共 46 用例通过；lint（包内上下文）0 error。
- [x] 不回归首帧延迟：语义召回在首帧推送后异步执行，热路径 onSearch 不等 embedding。

> 备注：B1 原方案含"重排现有结果"，但渲染端 `search.update` 为 append-only 合并且 `useSearch.ts` 受保护，故实交付为"召回追加"；重排 carve-out 记入父任务 backlog。
> 既有失败（与本任务无关，committed 基线已存在）：`indexing-runtime.test.ts` / `search-core.trace.test.ts` / `search-provider-registry.test.ts` 的 2 个失败为分支 WIP，非本次引入（stash 验证过）。

## Notes

- 仅动排序/富化逻辑，不重构 file-provider/search-core 巨石（属父任务 R4/R5 backlog）。
- B1 方向决策记录于本文件更新历史。
