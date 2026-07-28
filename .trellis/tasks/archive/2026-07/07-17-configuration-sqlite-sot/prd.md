# Configuration SQLite Source of Truth

## Goal

将 CoreApp 的 application configuration 域从 `modules/config/*` JSON/INI 文件迁移到主 SQLite 数据库，使 SQLite 成为运行期唯一权威来源，同时保留可审计的一次性旧数据导入、明确的文件后端回退开关、有限兼容期镜像与可恢复的启动路径。

## Confirmed Facts

- `StorageModule` 当前以同步内存 cache + 轮询异步落盘实现 application configuration；`getConfig()`、`saveConfig()`、`reloadConfig()` 和 `persistConfig()` 直接读写 `modules/config/*`（`apps/core-app/src/main/modules/storage/index.ts:493-823`）。
- `StorageEvents.app.*` 与 `getMainConfig` / `saveMainConfig` 共用 `StorageModule`，因此 Settings、启动配置和主进程消费者已经收敛到同一 API 边界；plugin config 位于独立 `modules/config/plugins` 边界，不属于本迁移。
- `databaseModule` 在 `storageModule` 之前完成主库迁移和初始化（`apps/core-app/src/main/index.ts:165-168`），Storage 可以在 `onInit()` 中安全取得主库 client。
- `TouchApp` 构造阶段仍会在 Storage 初始化前直接读取 `app-setting.ini`，用于 silent launch 和初始窗口 bounds（`apps/core-app/src/main/core/touch-app.ts:66-89,348-367`）；此路径必须改为 SQLite-first preflight，否则 SQLite 不是启动配置 SoT。
- 主库已有通用 `config` 和 `system_config` 表，但前者由 intelligence/config key 使用，后者服务 system update；复用任一表都会制造新的跨域写入所有权。
- 当前 API 的 `saveConfig()` 是同步 cache mutation，durability 由 `StoragePollingService` 或显式 `persistMainConfig()` 提供；迁移必须保持该调用语义，避免全局异步签名切换。
- 当前 delete/clear 只驱逐 cache，不能可靠删除已落盘文件；SQLite 迁移需要显式 tombstone，避免旧文件在回退/import 时复活。

## Requirements

1. **边界**：迁移所有经 `StorageModule` / `StorageEvents.app` 管理的 application configuration key；排除 plugin storage、secure storage、renderer override、数据库业务表及用户内容。
2. **SQLite schema**：新增 application-config 专属表，至少保存 `key`、JSON `value`、持久化 `revision`、tombstone/deleted 状态与 `updated_at`；不得复用 intelligence `config` 或 update `system_config`。
3. **单写者**：只有 main-process `StorageModule` 可以写该表；renderer 继续通过 typed transport，plugin SDK 继续使用自身 storage 边界。每 key 的持久化按顺序执行，旧 revision 不得覆盖新 revision。
4. **同步读取兼容**：Storage 初始化时一次性 hydrate SQLite rows 到现有 cache，之后保持 `getConfig()` 同步；重启后 version/conflict 语义必须从持久化 revision 恢复。
5. **旧数据迁移**：首次 SQLite 模式启动时递归发现合法 legacy config 文件，排除 `plugins/`、备份目录和 migration marker；先创建不可变 backup，再在事务中仅导入 SQLite 尚不存在的 key。重复启动、崩溃重试和已有 SQLite row/tombstone 均不得被 legacy 覆盖。
6. **无损失败**：非法 JSON、不可读文件或事务失败不得删除/覆盖原文件；记录 key 级结果与迁移状态。SQLite hydrate/import 失败时必须进入显式 legacy fallback，而不是混合读取两个来源。
7. **兼容镜像**：默认 SQLite 模式在 SQLite 写成功后更新 legacy mirror，供有限兼容期回滚；mirror 失败不得回滚已提交 SQLite，但必须留下明确日志/诊断。通过环境开关可关闭 mirror。
8. **回滚**：环境开关可在不删除 SQLite 数据的情况下选择 legacy primary，启动、读取、修改和关闭均可工作；回滚模式不得把 legacy 值静默覆盖回 SQLite。恢复 SQLite 模式前以 SQLite 数据为准。
9. **删除语义**：delete/clear 持久化 tombstone，并在 SQLite commit 后移除 legacy mirror；后续启动不得从遗留备份或旧文件复活该 key。
10. **启动 preflight**：silent launch 与初始 window bounds 使用 SQLite app-setting row；只有表不存在、row 不存在或显式 legacy rollback 时才读取 legacy 文件。preflight 连接只读、短生命周期，并在 DatabaseModule 打开主库前关闭。
11. **Settings/启动兼容**：现有 renderer storage API、Settings store hydration、logger/theme subscription、auto-start、silent launch、窗口 bounds 和 onboarding gate 的 payload 与同步调用契约保持不变。
12. **可观察性**：日志/诊断至少暴露 active backend、migration phase/imported/skipped/failed counts、fallback reason、mirror failure 和 pending dirty count；不得记录配置 value 或敏感路径内容。

## Non-goals

- 不迁移 plugin config/data、secure storage、IndexedDB/localStorage 或业务数据表。
- 不改变 renderer-facing StorageEvents payload、Settings UI 信息架构或 AppSetting schema。
- 不删除 legacy backup；关闭兼容 mirror 与最终清理旧文件属于有真实发布证据后的后续 hard-cut。
- 不把同步 `saveMainConfig()` 全局改为 Promise。

## Acceptance Criteria

- [x] 新 schema migration 可在空库和既有库上重复验证，application-config 表与 revision/tombstone 约束正确。
- [x] 首次启动从多份合法 legacy config 导入 SQLite，创建 backup；第二次启动不重复覆盖，SQLite 既有 row 和 tombstone 优先。
- [x] 非法 JSON、部分不可读文件和中途事务失败均保留源文件，并产生可诊断结果；Storage 可按策略回退或明确失败。
- [x] 默认运行期读来自 hydrated SQLite cache，写按 revision 顺序落 SQLite；重启后数据、version 和 delete tombstone 保持。
- [x] SQLite 模式 mirror 可供 legacy rollback 启动；关闭 mirror 开关后不再写 legacy；显式 legacy 模式不写回 SQLite。
- [x] preflight 从 SQLite 恢复 silent launch/window bounds，并在 row/table 缺失时正确 fallback；连接关闭后 DatabaseModule 正常迁移启动。
- [x] StorageEvents app get/getVersioned/set/save/delete/updated 及 renderer conflict retry 合约不变。
- [x] Settings hydration、logger/theme live update、auto-start、onboarding gate、正常启动与 silent startup 均通过 focused regression/smoke。
- [x] CoreApp focused tests、完整 node typecheck、scoped ESLint、Electron build和实际 CoreApp 启动 smoke 通过。

## Rollback

- 设置 `TALEX_CONFIG_STORAGE_BACKEND=legacy` 后使用 legacy 文件作为 primary，不删除或改写 SQLite rows。
- SQLite 默认模式保留 `TALEX_CONFIG_LEGACY_MIRROR=1` 兼容镜像；确认发布证据前不关闭。
- 数据/代码回退不需要 downgrade schema：旧版本忽略新增表并继续读取 mirror 文件。
