# Design — Item freshness recommendations

行号为 2026-08-06 工作树快照,实施前先核对。核心决策:**不做 DB 迁移**,安装时间走
`file_extensions` KV;**不新开事件线**,缓存失效挂现成的 `handleSearchIndexCommit`。

## 1. 数据契约(A/B 两块实施的唯一接口)

**`file_extensions` 新增 key `installedAt`**,value = epoch 毫秒整数字符串,挂在 app 的
`files` 行上:

- 语义:该 app 在本机文件系统上的创建时间(birthtime),首次索引时写入,**此后永不刷新**
  (app 自更新会重建 bundle 刷新 birthtime,若跟着刷会把更新误判为新装)。
- 写入规则(app-provider,插入/批量插入/更新三条路径统一走 `syncScannedAppExtensions` 漏斗):
  - 插入:`appInfo.createdAt` 有效 → 写 birthtime;无效且 `discovery === 'watch'` → 写 now
    (Linux 常无 birthtime,watcher 发现即近似安装时刻);无效且全量扫描 → 不写。
  - 更新:仅当现存 extensions 缺 `installedAt` 时回填(规则同上,但**无** watch-now 回退)。
  - 陈旧键清扫(`staleExtensionKeys` 逻辑)不得把 `installedAt` 当陈旧键删掉。
- **新鲜判定(双门,engine 侧)**:`installedAt` 在 7 天内 **且** `files.ctime`(首次入库时刻,
  插入后从不被 onConflict 更新,语义现成)在 7 天内。
  - 自更新的老 app:birthtime 新但 ctime 旧 → 排除 ✅
  - Touch 首装全量扫描老机器:ctime 全新但 birthtime 旧 → 排除 ✅
  - 关机期间装的 app、下次启动扫描发现:双新 → 命中 ✅(纯 watcher 方案会漏这条)

**扫描器**:`ScannedAppInfo`(app-types.ts:19)加可选 `createdAt?: Date`,darwin/win/linux
从 `stats.birthtime` 取,有效性判定:`getTime() > 0` 且 ≤ now + 24h(时钟偏移容忍);无效不填。
`processAppPath` options 加 `discovery?: 'watch' | 'scan'`(默认 'scan'),
`handleIndexedSourceWatchEvent`(app-provider.ts:1144)传 'watch'。

## 2. 引擎(零查询推荐)

- **维度 6**:`getCandidates`(engine:1511)追加 `getNewlyInstalledItems(10)`:app catalog +
  extensions 按双门过滤,join 现有 usage 批量查询(无行则 `EMPTY_USAGE_STATS`),产出
  `{ sourceId: 'app-provider', itemId: path, sourceType: 'application', source: 'newly-installed', installedAt }`。
  `CandidateItem`/`ItemCandidate` 类型加 `installedAt?: number`。
- **稳定层加分**(`calculateRecommendationScore`,engine:1974,与 recency boost 并列):
  `if (installedAt && usageStats.executeCount === 0) score += noveltyFactor(age) * 1e7`。
  - `noveltyFactor(age) = age ≤ 48h ? 1 : max(0, 1 − (age − 48h) / (7d − 48h))`(线性淡出)。
  - `executeCount > 0` ⇒ 加成归零 = **交棒 frecency**;item 仍可经 frequent/recent 维度进候选。
  - 量级论证:频率项 `executeCount × 1e4` 需 1000+ 次执行才压过 1e7(可接受);易变层
    contextMatch ≤ ~1e8 可压过(剪贴板等显式意图理应更强)。装了就进 top 3 由 1e7 保证。
  - 安装时间属慢变信号,进 30min 缓存符合稳定层约定(engine:1992-1995 注释)。
- **多样性过滤**(engine:2720)不改:novelty 把新装项排进前几槽,cap 只影响后半段;
  补一条 limit=10 时新装项存活的单测作防回归。
- **冷启动重构(S1.5)**:`resolveInstallTime`(engine:248)升级为优先 `installedAt`
  extension、退回 ctime/mtime;`getColdStartRecommendations`(engine:1469)直接以
  `source: 'cold-start'` 过 rebuildItems(删掉现在先传 'frequent' 再事后补
  meta.recommendation.source 的 hack,engine:1487/1492-1499)。

## 3. 类型与 UI 可解释

- `packages/utils/core-box/recommendation.ts`:`ScoredItem['source']`(:83)+=
  `'newly-installed' | 'cold-start'`;`RecommendationBadge['variant']`(:130)+= `'newly-installed'`。
- `packages/utils/types/tuff-dsl.ts`:核对 `TuffMeta.recommendation.source`(~:1167)含
  `'cold-start'`,补 `'newly-installed'`,两处联合从此一致。
- `item-rebuilder.ts` badge map(:571-587)+=
  `'newly-installed': { text: '新安装', icon: 'i-ri-download-2-line', variant: 'newly-installed' }`、
  `'cold-start': { text: '推荐', icon: 'i-ri-lightbulb-line', variant: 'intelligent' }`;
  reason map(:559-569)+= `'newly-installed': 'Just Installed'`、`'cold-start': 'Suggested'`。
  渲染端 badge 是通用渲染(BoxGridItem/ItemSubtitle),无需改。

## 4. 缓存失效与卸载

- **挂点**:`search-core.handleSearchIndexCommit`(:430)已在索引提交时清 searchCache,
  同点追加 `this.recommendationEngine?.invalidateCache()`。先查
  `CoreBoxSearchIndexCommitPayload` 能否辨识来源:能 → 仅 app-provider 增删时失效;
  不能 → 无条件失效并注释原因(索引提交已合并批次,频率可接受)。
- **DB 层缓存**:`invalidateCache()`(engine:1024)目前只清内存;`recommendation_cache`
  表行 30min 过期,内存失效后同 key 的 DB 行会把旧结果拉回来 → `invalidateCache` 需一并
  删 DB 行(或加 generation salt 进 cacheKey)。实施时先读 recommend() 的 DB 缓存读路径核实,
  确认存在此洞再修;不存在则记录证据。
- **卸载(S1.3)**:delete delta 走同一提交链 → 同点失效;索引行+extensions 本就级联删
  (app-provider.ts:3381)。需核实 `rebuildItems` 对 catalog 已无行的 app 候选是丢弃还是
  保留——若保留,给 'application' 候选加存在性过滤,否则 frequent/recent 维度会把已卸载
  app 带回来。usage 统计行保留(重装恢复 frecency)。

## 5. 曝光切片(可评估)

- engine 记录最近一次 recommend() 结果中 newly-installed 项的 key 集合(key 格式与
  exposure service 的 `sourceId:itemId` 对齐,实施时核对 recordExposure/recordClick 的
  itemKeys 形态,search-core:2049-2054)。
- `recommendation-exposure-service` 增加 tag 通道:被标记 key 的曝光/点击额外累加
  `(day, surface + ':newly-installed', k)` 行。surface 是自由文本,**无 schema 迁移**;
  仍仅计数、不存 id,隐私守恒。全部主进程内传递,不改 renderer 与 transport 类型。

## 6. 实施分块(文件所有权,严格不重叠)

| 块 | 文件 | 内容 |
|---|---|---|
| A(数据层) | `addon/apps/app-types.ts`、`darwin.ts`、`win.ts`、`linux.ts`、`app-provider.ts` + 就地测试 | §1 全部 |
| B(引擎层) | `packages/utils/core-box/recommendation.ts`、`packages/utils/types/tuff-dsl.ts`、`recommendation-engine.ts`、`item-rebuilder.ts`、`recommendation-exposure-service.ts`、`search-core.ts` + 就地测试 | §2-§5 全部 |

A/B 之间只以 §1 的 DB 契约耦合,可并行;B 的测试用直写 DB 行/extensions 构造夹具,不依赖 A 代码。

## 7. 风险与取舍

- birthtime 语义因平台/安装方式而异(APFS 拷贝=拷贝时刻,符合预期;个别安装器保留源日期 →
  漏报)。漏报可接受,误报(更新/首扫)已被双门挡住。
- 重度使用项频率分可超 1e7 → 新装项排第 4+:罕见且可后续用曝光切片数据调常量。
- 易变层强上下文匹配可压过 novelty:有意为之,显式意图 > 新鲜度。
