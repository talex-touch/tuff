# 基于 Source+ID 组合键的搜索排序优化计划

## 1. 概要
- **背景**：现有搜索统计仅以 `itemId` 聚合，忽略来源维度；排序器依赖 `item.scoring` 中的旧频次，无组合键数据和时间衰减。
- **目标**：引入 `source.id + item.id` 组合键统计，重构排序权重；同时搭建缓存、汇总与清理机制，保障性能与数据一致。
- **范围**：数据库 schema、搜索核心逻辑、排序器、缓存策略、监控告警及后续智能化路线。

## 2. 现状痛点
1. **统计粒度粗糙**：`usage_summary` 只能按 `itemId` 自增；`recordExecute` 把 `source` 存成 `item.source.type`，无法区分不同 provider。
2. **排序权重僵化**：`tuff-sorter` 读取旧 `frequency` 字段，缺少执行/搜索区分，无法做时间衰减。
3. **查询性能隐患**：`usage_logs` 无组合聚合索引，实时统计会退化为全表扫描；`SearchEngineCore` 未做批量读取和内存热缓存。
4. **数据资产孤立**：没有计划化的汇总任务与日志清理，难以观察统计准确率、命中率。

## 3. 核心目标
- **统计升级**：新增 `item_usage_stats` 表，支持组合键维度的 `search/execute` 计数、最后时间戳、来源类型索引。
- **排序进化**：引入组合频次、指数衰减和来源权重，兼容旧 `usage_summary` 数据作为回退。
- **性能保障**：批量查询、内存 LRU 缓存 + 定期落库；建立日志清理与数据校验流程。
- **行为覆盖**：统一统计搜索、执行、取消、补全等行为，为后续行为建模做铺垫。

## 4. 数据与组件设计
### 4.1 表结构补充
```sql
CREATE TABLE item_usage_stats (
  source_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  search_count INTEGER NOT NULL DEFAULT 0,
  execute_count INTEGER NOT NULL DEFAULT 0,
  cancel_count INTEGER NOT NULL DEFAULT 0,
  last_searched INTEGER,
  last_executed INTEGER,
  last_cancelled INTEGER,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  PRIMARY KEY (source_id, item_id)
);
CREATE INDEX idx_item_usage_source_type ON item_usage_stats(source_type);
CREATE INDEX idx_item_usage_updated ON item_usage_stats(updated_at DESC);
```
> `cancel_count` 预留给取消/失败行为；默认值使用 Drizzle 的 `sql` 表达式避免固定时间戳。

### 4.2 DbUtils 扩展
- `incrementUsageStats({ sourceId, sourceType, itemId, action, timestamp })`
- `getUsageStatsBatch(keys: Array<{ sourceId; itemId }>)`
- `getUsageStatsBySource(sourceId: string)`
- `syncUsageStatsBulk(entries: ItemUsageStatsInsert[])`（供定时批同步）

### 4.3 缓存与落库
- 热点缓存：`LRUCache<string, UsageStats>`，命中直接返回；miss 时从 DB 批量加载。
- 批量写策略：使用队列聚合 100ms 内的增量，批量 `onConflictDoUpdate`，减少写放大。
- 失败兜底：写失败自动回退到 `usage_logs` 补写任务，重试后仍失败打告警。

## 5. 搜索核心改造
1. **键生成工具**：`generateUsageKey(source: { id; type }, itemId, includeType?: boolean)`，默认 `source.id:itemId`，保留 `type` 参数便于未来扩展。
2. **搜索阶段**：
   - `gatherAggregator` 回调收敛后，批量生成组合键，调用 `getUsageStatsBatch`。
   - 将查到的数据封装为 `Map` 传给排序链；缓存缺失项写入 LRU。
   - `_recordSearchUsage` 改为批量处理：写 `usage_logs`、更新缓存、异步刷新 DB。
3. **执行阶段**：
   - `recordExecute` 在写 `usage_logs`、`usage_summary` 的同时更新组合键统计。
   - 对取消/失败事件同样调用 `incrementUsageStats(action='cancel')`，记录 `lastCancelled`。
4. **排序器**：
   - `Sorter.sort` 支持注入额外 `context`；`tuffSorter.sort` 接收 `usageStatsMap`。
   - 新分数公式：`score = base + weight * 1e6 + match * 1e4 + recency * 1e2 + (executeCount*1 + searchCount*0.3 + cancelCount*(-0.5)) * decayFactor`
   - 衰减：`decayFactor = exp(-lambda * daysSinceLastInteraction)`，`lambda` 默认 0.1，可配置。
5. **Provider 调整**：对 `addon/files` 等已有二次排序逻辑的 provider，优先读取组合统计；旧字段缺失时 fallback `usage_summary`。

## 6. 运维与监控
- **科目统计**：新增 Prometheus 指标 `usage_stats_increment_failures`、`usage_stats_cache_hit_ratio`，分析写入成功率与缓存效果。
- **数据校验**：每日对比 `usage_logs` 与 `item_usage_stats` 随机抽样，确保计数偏差 < 0.1%。
- **清理策略**：复用 `search-usage-data-cleanup-plan.md`，扩展为“汇总后删除”模式：仅删除已经落表且早于保留期的 `usage_logs`。

## 7. 实施里程碑
| 阶段 | 交付 | 说明 |
| --- | --- | --- |
| Phase 1 | Schema & DbUtils | 引入新表、接口、迁移脚本、基础单测 |
| Phase 2 | 统计写链路 | 搜索/执行/取消链路写入组合键数据，完成缓存落库 |
| Phase 3 | 排序集成 | 排序器读取组合统计，调参并压测 |
| Phase 4 | 汇总任务 | 定时批同步、日志清理、指标上报 |
| Phase 5 | QA & 文档 | 单元 / 集成 / 性能回归；更新开发者文档与 READMEs |

## 8. 风险与对策
- **写入竞争**：高频键并发写导致行锁；使用批量 `UPDATE ... CASE` 或 drizzle `sql` 语句 + 指数退避重试。
- **缓存脏读**：异步落库可能造成延迟；缓存结构需要时间戳并设定 TTL（默认 15 分钟），过期强制刷新。
- **排序波动**：引入 cancel 惩罚和衰减可能让习惯项排序变化；提供开关阈值并记录 A/B 对照数据。

## 9. 测试计划
- **单元测试**：键生成、`DbUtils` 自增、缓存命中/失效、排序权重组合。
- **集成测试**：模拟多 provider 搜索，验证频次更新与排序位置；覆盖取消、重试、并发情景。
- **性能压测**：10k/100k 组合键规模下批量查询 < 10ms (P95)，批量写入 < 20ms。
- **回归测试**：确保旧 `usage_summary` 消费者（如文件 provider）仍能正常使用。

## 10. 智能化未来展望
1. **语义意图感知**：结合 `usage_logs.context` 与查询文本，训练轻量意图分类器，为排序提供 `intent` 权重（如“打开应用”“搜索代码片段”）。
2. **多模输入联想**：当输入类似 “im”“聊天”，优先拉起 QQ、微信、企业微信等即时通讯 provider；维护词库 + 行为学习，自动生成 `alias` 规则。
3. **行为模式学习**：利用 `cancel_count` 与快速重复搜索识别“不满意”信号，触发动态调参或推荐替代结果。
4. **跨设备同步**：后续可将 `item_usage_stats` 通过云端同步，实现多设备共享常用项排序。
5. **自动化运营看板**：构建统计仪表，如 TopN 使用项、热度变化趋势，为产品调优提供数据支撑。
6. **智能补全**：基于组合键热度构建查询前缀树（Trie），支持“输入三字自动补齐常用命令”，并结合意图特征排序。

## 11. ⚠️重要：Electron + Drizzle + Levenshtein 模糊匹配实现
为强化“输入 `im` 自动联想到 QQ / 微信等即时通讯工具”的智能补全能力，我们需要在 Electron 主进程中构建可复用的 Levenshtein 距离能力，并通过 Drizzle 暴露给搜索排序链路。实现要点如下：

1. **依赖安装（Electron 环境）**
   ```bash
   npm install drizzle-orm sqlite3
   ```
   - `sqlite3` 提供底层驱动，允许注册自定义函数。
   - `drizzle-orm` 负责维持 schema/查询层抽象。

2. **注册自定义 Levenshtein 函数**
   ```ts
   import { drizzle } from 'drizzle-orm/sqlite3'
   import sqlite3 from 'sqlite3'

   const sqlite = sqlite3.verbose()
   const rawDb = new sqlite.Database(dbPath)

   function levenshtein(a = '', b = ''): number {
     const lenA = a.length
     const lenB = b.length
     if (lenA === 0)
       return lenB
     if (lenB === 0)
       return lenA
     const dp = Array.from({ length: lenA + 1 }, () => new Array<number>(lenB + 1).fill(0))
     for (let i = 0; i <= lenA; i++) dp[i][0] = i
     for (let j = 0; j <= lenB; j++) dp[0][j] = j
     for (let i = 1; i <= lenA; i++) {
       for (let j = 1; j <= lenB; j++) {
         const cost = a[i - 1] === b[j - 1] ? 0 : 1
         dp[i][j] = Math.min(
           dp[i - 1][j] + 1,
           dp[i][j - 1] + 1,
           dp[i - 1][j - 1] + cost
         )
       }
     }
     return dp[lenA][lenB]
   }

   rawDb.create_function('levenshtein', 2, levenshtein)
   export const db = drizzle(rawDb)
   ```
   - 函数注册一次即可，之后所有 SQL 查询都可使用 `levenshtein(text, text)`。
   - 需要在模块初始化阶段执行，确保搜索子系统加载前函数已经可用。

3. **通过 Drizzle 执行模糊匹配查询**
   ```ts
   import { sql } from 'drizzle-orm'
   import { appsIndex } from '../db/schema' // 假设存储应用别名/热度

   function queryImCandidates(keyword: string, distance = 2) {
     return db
       .select()
       .from(appsIndex)
       .where(sql`levenshtein(${appsIndex.alias}, ${keyword}) <= ${distance}`)
   }
   ```
   - 把热词表（如 QQ、微信、企业微信、飞书等）的别名、拼音、缩写写入 `appsIndex`。
   - 将结果映射为 TuffItem 的候选权重，在排序阶段叠加 “Levenshtein 匹配分”。

4. **整合到排序流程**
   - 在 `SearchEngineCore.search` 中，如果文本长度 ≤ 4 或命中特定前缀（`im`、`liao` 等），主动调用上面的查询函数，补充候选项。
   - 查询结果的权重可根据 `levenshtein` 值、组合键频次联合计算，例如：`aliasScore = (maxDistance - distance) * 0.5`。
   - 结合第 5 节的 `usageStatsMap`，对这些候选项执行统一的排序公式，保证智能联想与行为统计协同。

5. **性能与缓存**
   - 为避免高频键重复计算，使用 LRU 缓存存储 `(keyword,distance) -> resultIds`。
   - 对自定义函数执行时间做监控（例如通过 `performance.now()` 包裹查询），超过阈值告警。
   - 如果数据量大，可在 nightly 任务中离线计算热门别名相似度表，查询时直接命中。

6. **测试**
   - 单测覆盖中英文混输（`im`、`聊天`、`liao`）以及大小写、拼音、错位输入。
   - 集成测试确保 Electron 主进程能正确注册函数，并在渲染进程通过 IPC 调用后拿到联想结果。

通过上述实现，搜索引擎即可利用数据库层面的 Levenshtein 距离实现模糊匹配，不用把全量候选加载到内存，同时为即时通讯等高频场景提供智能联想支持。

## 12. 交付清单
- 新 `item_usage_stats` 表及迁移脚本
- 扩展 `DbUtils`、缓存模块与批处理服务
- `SearchEngineCore` 搜索/执行链路改造
- `Sorter` & `tuff-sorter` 支持组合统计
- 运维指标与告警配置
- 文档更新：本方案、开发操作手册、QA 用例
