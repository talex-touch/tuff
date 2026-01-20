---
mode: plan
cwd: /Users/talexdreamsoul/Workspace/Projects/talex-touch
task: 整理 config storage（SQLite/JSON 同步）上下文与需求
complexity: medium
planning_method: builtin
created_at: 2026-01-20T18:55:06+08:00
---

# Plan: 配置存储 SQLite/JSON 同步 - 上下文与需求整理

🎯 任务概述
当前仓库存在配置存储的 SQLite 与 JSON 双体系，需要先明确现状与目标范围。
本计划用于系统化收集上下文、梳理需求边界，并形成可执行的后续工作输入。

📋 执行计划
1. 读取现有计划与历史记录，提炼已有决策、未决问题与假设前提。
2. 盘点当前主进程配置存储实现与入口（读/写/订阅/广播），明确 JSON 存储路径与生命周期。
3. 盘点 SQLite 配置表结构与写入点，确认与 JSON 的字段范围重叠情况。
4. 梳理调用链与使用方（renderer、插件、核心模块），识别同步触发点与一致性要求。
5. 明确需求口径：同步方向、时序/冲突策略、迁移/回滚、兼容性与可观测性指标。
6. 输出需求清单与风险清单，并形成后续实现/测试的验收标准草案。

🧭 主进程配置存储入口与 JSON 路径
- 读入口：`getMainConfig` → `StorageModule.getConfig`（`apps/core-app/src/main/modules/storage/index.ts:820` / `apps/core-app/src/main/modules/storage/index.ts:443`）
- 写入口：`saveMainConfig` → `StorageModule.saveConfig`（`apps/core-app/src/main/modules/storage/index.ts:826` / `apps/core-app/src/main/modules/storage/index.ts:582`）
- 订阅入口：`subscribeMainConfig` → `StorageModule.subscribe`（`apps/core-app/src/main/modules/storage/index.ts:842` / `apps/core-app/src/main/modules/storage/index.ts:727`）
- 广播入口：`broadcastUpdate`（IPC 广播 `storageLegacyUpdateEvent`，50ms 去抖）（`apps/core-app/src/main/modules/storage/index.ts:68`）
- JSON 路径：`StorageModule` 使用 BaseModule `dirName: 'config'`，在 `onInit` 读取 `file.dirPath`，插件配置在 `${file.dirPath}/plugins`（`apps/core-app/src/main/modules/storage/index.ts:121` / `apps/core-app/src/main/modules/storage/index.ts:141`）
- 生命周期：`onInit` 启动 `StoragePollingService` 与 LRU 清理；`persistConfig` 在空闲后写入 `path.join(this.filePath, name)`（`apps/core-app/src/main/modules/storage/index.ts:141` / `apps/core-app/src/main/modules/storage/index.ts:662`）

🧾 SQLite config 表与写入点
- 表结构：`config(key text primaryKey, value text)`，`value` 为 JSON 字符串（`apps/core-app/src/main/db/schema.ts:278`）
- 写入点：`StorageModule.upsertSqliteConfig` 使用 `db.insert(configSchema)` upsert（`apps/core-app/src/main/modules/storage/index.ts:230`）
- 触发来源：
  - `runSqlitePilotMigration` 启动时遍历 `SQLITE_PILOT_CONFIGS` 写入（`apps/core-app/src/main/modules/storage/index.ts:212` / `apps/core-app/src/main/modules/storage/index.ts:60`）
  - `saveConfig` 写入内存后触发 SQLite upsert（`apps/core-app/src/main/modules/storage/index.ts:582`）
- JSON 重叠范围：仅 `SQLITE_PILOT_CONFIGS` 内 key（当前为 `StorageList.SEARCH_ENGINE_LOGS_ENABLED`）同时存在 JSON 文件与 SQLite 记录，其余 key 仅走 JSON（`apps/core-app/src/main/modules/storage/index.ts:60`）

🔗 调用链与一致性要求
- Main 调用链：
  - 入口由 `registerTransportHandlers` 处理（`StorageEvents.app.*` 与 legacy `storage:*`）→ `getConfig`/`saveConfig`（`apps/core-app/src/main/modules/storage/index.ts:283` / `apps/core-app/src/main/modules/storage/index.ts:582`）
  - `saveConfig` 触发 `broadcastUpdate`（IPC 广播）与 `notifySubscribers`（本地订阅），具备版本冲突检测（`apps/core-app/src/main/modules/storage/index.ts:582` / `apps/core-app/src/main/modules/storage/index.ts:68`）
  - 一致性要求：主进程内读取与写入为强一致（同进程内缓存即时更新），跨窗口/跨进程通过 IPC 异步广播 → 最终一致
- Renderer 调用链：
  - `TouchStorage` 通过 `storage:get`/`storage:save` 或 `StorageEvents.app.save` 访问主进程（`packages/utils/renderer/storage/base-storage.ts:278` / `packages/utils/renderer/storage/base-storage.ts:308`）
  - 更新订阅通过 `storage:update` 或 `StorageEvents.app.updated` 拉取新版本（`packages/utils/renderer/storage/base-storage.ts:318`）
  - 一致性要求：窗口间更新依赖异步广播与版本比较，默认最终一致
- Plugin 调用链：
  - `usePluginStorage` 通过 `plugin:storage:*` 通道读写（`packages/utils/plugin/sdk/storage.ts:24`）
  - `onDidChange` 监听 `plugin:storage:update` 变更（`packages/utils/plugin/sdk/storage.ts:109`）
  - 一致性要求：插件侧更新基于事件通知与异步 IPC，默认最终一致

🧭 同步口径与策略（初稿）
- 同步方向：JSON 作为主源；仅 `SQLITE_PILOT_CONFIGS` 内 key 做 JSON → SQLite 镜像写入（`apps/core-app/src/main/modules/storage/index.ts:60` / `apps/core-app/src/main/modules/storage/index.ts:230`）
- 时序/冲突策略：主进程 `saveConfig` 先更新内存与 JSON，再异步 upsert SQLite；客户端携带版本号时执行冲突检测（旧版本拒绝），未携带版本默认接受并以最新写入为准（`apps/core-app/src/main/modules/storage/index.ts:582`）
- 迁移/回滚：启动时执行 JSON → SQLite pilot 迁移；回滚只需移除 pilot key 或忽略 SQLite，JSON 文件仍为可用主源（`apps/core-app/src/main/modules/storage/index.ts:212`）
- 兼容性：保留 legacy `storage:*` IPC 与 JSON 文件格式，SQLite 表结构保持 key/value 不变，避免破坏已有读写路径（`apps/core-app/src/main/modules/storage/index.ts:283` / `apps/core-app/src/main/db/schema.ts:278`）
- 可观测性：利用 `storageLog` 记录 SQLite 写入失败与慢写入告警，保持问题可追踪（`apps/core-app/src/main/modules/storage/index.ts:230` / `apps/core-app/src/main/modules/storage/index.ts:662`）

✅ 已决事项
- 本阶段仅做上下文与需求整理，目标是形成后续工作输入（来源: `plan/2026-01-20_18-55-03-context-requirements.md:14`）

❓ 未决问题
- 同步方向、时序/冲突策略、迁移/回滚方式仍需明确（来源: `plan/2026-01-20_18-55-03-context-requirements.md:21`）

🧩 假设前提
- 当前存在 SQLite 与 JSON 双配置存储并需统一梳理（来源: `plan/2026-01-20_18-55-03-context-requirements.md:13`）

⚠️ 风险与注意事项
- SQLite/JSON 双写或迁移策略不清晰可能引入数据不一致与回滚困难。
- 配置存储被多处依赖，改动需评估启动流程、IPC 通道与热更新行为。
- 需避免在 renderer 侧引入 main-only 依赖（Electron/Node）。

📎 参考
- `plan/2026-01-20_18-47-54-config-storage-sqlite-json-sync.md:10`
- `apps/core-app/src/main/modules/storage/index.ts:84`
- `apps/core-app/src/main/db/schema.ts:279`
- `packages/utils/common/storage/index.ts:1`
- `packages/utils/renderer/storage/index.ts:1`
