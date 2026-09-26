# Implement — 文件索引减负

## Checklist

### Stage A（packages/utils，不受 peer 锁定）
1. [x] `file-scan-constants.ts`：DEV_PATHS 锚定。
2. [x] `file-filter-service.ts`：`HOME_ANCHORED_TOOLCHAIN_PATHS` + home 相对段匹配 → `cache-path`。
3. [x] `packages/utils/__tests__/file-filter-toolchain-anchor.test.ts` 新增用例（6 条）。
4. [x] 验证：utils 5 个 filter/scan 测试文件 53 通过；`native-file-search-provider.test.ts` 14 通过（iCloud 例外保持）。

### Stage B（addon/files）
5. [x] 新建 `file-provider-full-scan-checkpoint-service.ts`（plan / markChildCompleted / clearRootCheckpoints / listScanChildDirectories / buildRootOnlyExcludePaths）+ 6 条单测。
6. [x] `file-provider-full-scan-run-service.ts`：可选 `checkpoints` dep；按子目录扫描、逐个记检查点、根自身最后扫、返回 `checkpointsToClear`；缺省退化为整根扫描。
7. [x] `file-provider.ts`：构造 checkpoint 服务；根记录写入成功后清理子目录检查点；cleanup 增加 `isStaleIndexPath`（父目录遍历规则 + 用户 extraPaths 豁免）。
8. [x] `file-provider-full-scan-run-service.checkpoint.test.ts`（4 条：跳过已完成子目录、abort 保留检查点、按子目录报进度、无子目录退化）；`file-provider-cleanup-delete-service.stale.test.ts`（3 条，含预算耗尽）。
9. [x] 清理预算：`staleDeleteBudgetMs`（默认 8s）——每行 FTS 删除全表扫描（见 research/fts-delete-cost-2026-09-26.md），22 万遗留行不能在启动期一次清完；预算后记录 `Stale index rows left for the next cleanup pass { pending }`。
10. [x] 验证：`typecheck:node` 通过；`addon/files/services` 247/248（唯一失败 `file-provider-index-persist-entry-mapping.test.ts` 来自其他会话修改的 `indexing-worker-persist-entry-mapper.ts`）；`file-provider-startup.test.ts` 49 通过；eslint 干净。
11. [x] 真机：重启后 `scan_progress` 出现 home 一级子目录检查点（applications、custom-workspace、go、…）；清理阶段 1.5 分钟内完成分页并报告 pending=227,848；再次重启验证 `Full scan resumes past completed subtrees`。
12. [x] 读时过滤（追加，2026-09-26 15:35）：`filterSearchItems` 现在对结果行应用无需读盘的目录规则（任意层级的 node_modules/点目录、home 锚定工具链缓存、系统目录但保留 iCloud Drive；build/dist 等上下文相关名字留给 walker）。原因：预算清理要很多次启动才能清完 22 万条遗留行，期间 `chrome` 仍返回 go/pkg/mod 文件（talex-touch-40 观察到）。真机验证：重启后 `chrome` 15 条文件结果无 go/pkg/mod；Spotlight/Everything/gather 测试 79 通过，utils 41 通过。

## Review gates
- 不改 `scan_progress` 表结构；不新增 `~/Library/*` 规则。
- 检查点写入只经 `scanProgressService`（worker 拥有的搜索库）。

## Rollback
- 见 design.md 各段。
