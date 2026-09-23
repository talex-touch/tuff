# 应用索引新鲜度加固

## Goal

让「新装 / 删除应用」在更多真实场景下可靠反映到索引：大应用拖入、事件密集到达、外接盘临时离线、用户关闭补全开关。

## Background（2026-09-21 审计 + 复核）

| # | 缺陷 | 位置 | 复核 |
|---|---|---|---|
| A | 稳定探针比较 `.app` 目录自身 `st_size`，APFS 上目录大小恒为 96，与内容拷贝无关 → 等待立即返回 | `app-provider.ts _waitForItemStable` | 已实测（50MB 写入目录大小不变） |
| B | `Info.plist` 尚不可读时 `resolveAppInfoByPath` 归为 `not-app` 终态，不进重试阶梯 → 大应用拖入可能永不入索引 | `app-scanner.ts resolveAppInfoByPath` + `processAppPath` | 代码确认 |
| C | 解析进行中到达的第二个 watch 事件因 `processingPaths` 早退被静默丢弃，不重排 | `processAppPath` `reason: 'processing'` | 代码确认 |
| D | mdls 十分钟轮询发现路径缺失时**立即删行**，绕过 2 次未命中 + 3 分钟的宽限账本 | `_performMdlsUpdateScan` deletedApps 分支 | 代码确认 |
| E | 引导路径 `scanIndexedSource → _runStartupBackfill → _performStartupBackfill` 不检查 `startupBackfillEnabled` | `app-provider.ts` | 代码确认 |

## Requirements

- **R-A** 稳定探针对目录（`.app` bundle）比较 `mtime`（目录 mtime 随子项增删变化）并附带 `Contents/Info.plist` 的可读性；对文件仍比较 size。
- **R-B** 对 macOS 上「路径仍存在但 `Info.plist` 暂不可读」的情况归为 `failed`（可重试），只有整个 bundle 目录不存在才是 `not-app`。
- **R-C** `processAppPath` 遇到 `processing` 时记「dirty」，当前解析完成后对同一路径再跑一次（结果按 watch 路径发布）。
- **R-D** mdls 轮询发现的缺失应用走 `_processAppsForDeletion` 宽限账本，不直接删除。
- **R-E** 引导路径尊重 `startupBackfillEnabled=false`：跳过补全但仍产出当前记录批次（索引不为空）。

## Acceptance Criteria

- [x] 每项各至少一条回归测试，修复前失败、修复后通过；`app-provider*.test.ts`、`app-scanner.test.ts`、`darwin.test.ts` 全部通过。
- [x] `typecheck:node` 通过。
- [x] 真机：模拟「大应用拖入」（先建空 `.app` 目录，1.5s 后再写 `Info.plist` 与可执行文件）→ 应用最终入索引可搜；正常装卸回归不变。

## Notes

- Windows/Linux 的对应问题（Linux 扩展名过滤、Windows 稳定探针）不在本任务。
- `watchState` 硬编码 `'active'`、诊断页读错库、系统目录未 watch 等审计项记入父任务 Notes，不在本任务。

## Verification record (2026-09-21)

- 回归：A/B/C/D/E 五条新用例修复前失败（A 目录 mtime 变化仍判稳定；B `not-app`；C 第二个事件丢弃；D 直接删行；E 关掉开关仍补全），修复后通过；`addon/apps` 24 个文件 246/246 通过；`typecheck:node`、eslint、`git diff --check` 通过。
- 真机（隔离栈）：先建空 `TuffProbeZeta.app/Contents/MacOS` 目录，1.5s 后写 `Info.plist` 与可执行文件。日志：`App info unresolved for an existing bundle, will retry` → `retry 1/3 in 2s` → `New app TuffProbeZeta added successfully` → `App resolution recovered on retry`；t+4s 入库，CoreBox 搜索可见。修复前同场景为终态 `Not an app, skipping`。
