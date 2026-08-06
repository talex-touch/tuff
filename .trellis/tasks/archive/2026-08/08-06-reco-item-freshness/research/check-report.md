# 复查报告(freshness-check,2026-08-06)——通过

PRD 7 条验收全过;6 个重点核验项逐一证伪尝试,全部证伪失败(实施报告声称属实)。
门禁:box-tool 全量 152 文件 1231 测试连跑 2 次绿;typecheck node+web exit 0;
eslint --max-warnings=0 全清(core-app 20 文件包内跑,utils 3 文件包内跑)。
contracts flaky 本轮两次全量均未复现。

## 复查中直接修复的 2 处

1. **第三份 source 联合(真实 IPC 契约漏洞)**:`packages/utils/transport/events/types/core-box.ts:419`
   的 `TuffMeta.recommendation.source` 是 `CoreBoxRecommendationResponse.items` 的类型——真正
   过 IPC 到渲染端的契约,同时缺 `newly-installed` 和 `cold-start`(后者为 R2 时代旧 drift)。
   已补;全仓无 exhaustive-check 该联合的消费方,放宽安全。
2. **冷启动排序测试假绿**:原用例 catalog stub 缺 `getFileExtensionsByFileIds` → 调用抛错被
   `loadInstalledAtByFileId` 降级吞掉 → 实测的是 ctime 路径(删掉 installedAt 逻辑照样绿)。
   新增判别性用例:两 app 的 ctime 与 installedAt 方向相反(仅差 1ms),断言 stamp 生效。

## 复查额外确立的证据(设计口头断言 → 已核实)

- `file_extensions` 有 `(fileId, key)` 复合 PK,`ON CONFLICT ... DO NOTHING` 合法(否则运行时报错)。
- `files.ctime` 插入写 `new Date()` 且不在 onConflictDoUpdate set 里 → 「首次入库时刻」语义成立。
- generation 快照先于任何读;DB 写仅在内存写通过时执行;`createdAt` notNull,秒精度截断偏保守。
- providerIds 口径:`markCommitted([sourceId])` 与 `APP_INDEXED_SOURCE_ID='app-provider'` 同字面量。
- R1/R2 已修 bug 相关函数在本次 diff 命中 0 行,无回退。

## 决策记录(主会话,2026-08-06)

**风险 1「badge 口径不对称」保持现状**:`getNewlyInstalledItems` 对过双门者一律标
newly-installed(含 executeCount>0),去重路径仅 executeCount===0 才提升。对只靠新鲜度通道
进池的候选,「新安装」正是它出现在列表里的真实原因;改成同一条规则反而更不诚实。

## 遗留风险(记录备查,均不阻塞)

2. `getNewlyInstalledItems` 每次缓存 miss 跑 `getFilesByType('app')` select *;几百 app 量级无碍,
   门 1 空时跳过扩展表查询。
3. `readSliceTag` 依赖「基础 surface 不含冒号」;surface 是渲染端自由文本,新增 surface 需守此约定。
4. 曝光 tag 为单一全局 map、每次 recommend() 整体替换;双 surface 并发可能互清,只影响切片指标。
5. `getRecommendationCache` 对主库遗留行有回退读,而删除只打 aux;进程内 cacheInvalidatedAt 兜底,
   仅剩跨重启清理小缺口。
6. Chunk A 的 4 个相邻缺口仍开(见 chunk-a-report.md)。
