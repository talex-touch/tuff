# PRD: App Indexing 补漏与周期全量对比

## 背景
- 现状：`AppProvider/_initialize` 在加载时执行全量扫描对比（新增/更新/删除 + grace 机制），会阻塞 provider 启动。
- 问题：应用关闭期间安装新 app 的场景，启动时无法快速补漏，且全量对比成本高。
- 目标：启动后异步“只补漏”；全量对比改为周期任务，避免阻塞启动。

## 目标
- 启动后异步补漏：仅新增缺失 app 记录，确保新安装 app 可被搜索到。
- 全量对比改为周期性后台任务：处理更新与删除，保留现有 grace 机制。
- 不中断启动流程：补漏在 `ALL_MODULES_LOADED` 后异步执行。
- 失败降级：补漏任务支持指数退避重试。

## 非目标
- 启动补漏不执行更新/删除。
- 不在补漏中做全量索引重建。
- 不改变 app 扫描器的现有扫描范围。

## 现状与关联逻辑
- 全量对比：`apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts` → `AppProvider/_initialize`
- 周期扫描参考：`AppProvider/_scheduleMdlsUpdateScan` 使用 `PollingService` 进行周期任务注册。
- 执行互斥：`appTaskGate` 用于串行化 app 相关任务（参考 `_runMdlsUpdateScan`）。

## 方案设计
### 1) 启动补漏（Startup Backfill）
- 触发时机：`TalexEvents.ALL_MODULES_LOADED` 之后异步执行。
- 执行逻辑：
  1. 扫描系统 app 列表（复用 `appScanner.getApps()`）。
  2. 拉取 DB 中现有 app（`dbUtils.getFilesByType('app')`）。
  3. 以 `uniqueId || path` 为唯一标识做差集。
  4. 只插入缺失项：
     - 写入 `filesSchema` + `fileExtensions`（bundleId/icon 等）。
     - 同步关键词（`_syncKeywordsForApp`）。
  5. 不做更新/删除。
- 数据资产：
  - 需要保证 icon/bundleId 这些 extensions 完整写入（满足“前者要 assets”）。

### 2) 周期全量对比（Periodic Full Sync）
- 使用 `PollingService` 注册周期任务，参考 `_scheduleMdlsUpdateScan`。
- 任务内容：复用现有 `_initialize` 或拆分成 `fullSync()`：
  - 新增/更新/删除 + grace 保护逻辑保持不变。
  - 搜索索引同步保持现有行为。
- 建议频率：默认 24h，首次触发延迟 10-30min（避免与启动峰值冲突）。

### 3) 任务互斥与调度
- 通过 `appTaskGate` 或内部 flag 确保补漏与全量对比不并发。
- 补漏执行优先级高于全量对比。

### 4) 补漏失败退避
- 指数退避 + jitter：5s → 15s → 45s → 2m → 5m（上限 5 次）。
- 超过上限后进入低频重试（如 24h 后再尝试）。
- 所有失败仅记录日志，不阻塞 UI/Provider 初始化。

## 数据与配置
- 唯一标识：沿用 `uniqueId || path`。
- 持久化字段：
  - lastBackfillAt
  - lastFullSyncAt
- 配置建议（可后续落到 config）：
  - backfillRetryMax
  - backfillRetryBaseMs
  - fullSyncIntervalHours

## 日志与观测
- 记录扫描数、补漏新增数、耗时、失败原因。
- 记录补漏/全量对比的时间戳用于诊断。

## 风险与缓解
- 数据库锁竞争：串行化执行，避免与其他 provider 同时写入。
- 全量对比频率过高：默认 24h，后续可配置。
- 补漏多次失败：退避 + 次日重试，避免频繁扫描。

## 验收标准
- 启动后 1-3s 内补漏任务启动，不阻塞 provider onLoad。
- 新安装 app 在补漏后可搜索到（仅新增，不更新/删除）。
- 全量对比按周期执行并继续应用 grace 逻辑。
- 补漏失败有指数退避日志。

## 里程碑
1. 新增补漏任务与退避机制。
2. 全量对比迁移为周期任务（保留原逻辑）。
3. 验证补漏与全量任务互斥与日志输出。
