# 插件停用、撤权与卸载生命周期调研

## 1. 范围与快照

本文只记录 #301 规划所需的现状与缺口，不修改产品代码。调研快照基于提交
`ef4fba34ba4b7e77e0bc13aecb22e4eb2031487a`，并核对当前工作区；目标生产文件在调研时
没有未提交 diff。

覆盖范围：`PluginModule` / `TouchPlugin`、resolver / installer、插件文件存储、SQLite
owner / worker、Secret、权限撤销、缓存与临时目录，以及当前 renderer 确认/导出入口。

最小验证命令：

```bash
corepack pnpm -C apps/core-app exec vitest run \
  src/main/modules/permission/index.test.ts \
  src/main/modules/permission/permission-store.test.ts \
  src/main/utils/secure-store.test.ts \
  src/main/modules/plugin/runtime/plugin-sqlite-resource-owner.test.ts \
  src/main/modules/plugin/host/plugin-runtime-service.test.ts \
  src/main/modules/plugin/plugin.test.ts \
  src/main/modules/plugin/plugin-resolver.test.ts
```

结果：7 个文件、117 个测试全部通过。注意：测试集中没有调用真实
`createPluginModuleInternal().uninstallPlugin()` 的卸载编排测试；卸载顺序与失败行为主要是
静态代码证据。

## 2. 数据与资源所有权

| 面 | 当前位置 / owner | disable | revoke | uninstall 当前行为 |
| --- | --- | --- | --- | --- |
| 插件代码 | `<pluginRoot>/<folder>` | 保留 | 保留 | 尝试递归删除，错误被吞掉 |
| runtime session logs | `<pluginRoot>/<folder>/logs/**`；`PluginLoggerManager` | 保留 | 保留 | 随代码目录删除，但 logger flush 未纳入 barrier |
| 插件持久数据根 | `<appRoot>/modules/plugins/<manifestName>/data` | 保留 | 保留 | 尝试递归删除，错误被吞掉 |
| 文件型业务存储 | `data/config/**` | 保留 | `storage.plugin` 只撤权，不删 | 被 data 根覆盖 |
| data logs / verify / temp | `data/logs`、`data/verify`、`data/temp` | 保留 | 保留 | 被 data 根覆盖 |
| 插件 SQLite | `data/plugin-sdk.sqlite` 及 sidecar；activation-bound worker owner | worker 关闭，文件保留 | `storage.sqlite` 关闭 worker，文件保留 | unload 先关闭 worker，随后 data 根删除 |
| legacy renderer Secret | 全局 `config/secure-store.json` 的 `plugin.<name>.` 前缀 | 保留 | `storage.plugin` 只撤权，不删 | 前缀删除 |
| isolated Prelude Secret | 同一 secure store 的 `plugin.v2.<base64url(name)>.` 前缀 | 保留 | 同上 | 前缀删除 |
| Core DB plugin data | `plugin_data(plugin_id,key,value)` | 保留 | 保留 | 尝试按 manifest name 删除，错误被吞掉 |
| 权限 grants / session grants | 全局 `permissions.db` + memory | 保留 | 事务性删除对应 grant | **卸载不调用 revokeAll，全部遗留** |
| 权限 audit logs | 全局 `permissions.db` | 保留 | 新增 revoke audit | **卸载无处置策略** |
| plugin analytics | 内存 `PluginTracer` + `plugin_analytics` | 保留 | 保留 | **卸载无处置策略** |
| renderer 插件 UI preference | `localStorage`，例如 widget preview size | 保留 | 保留 | **卸载不清理** |
| pending permission retry | `pendingPermissionPlugins` memory map | 保留 | grant 时删除 | **unload / uninstall 不清理** |
| plugin log subscriptions | `PluginLogModule.subscriptions` | 依赖 renderer 自行 unsubscribe | 无关 | **没有 plugin lifecycle 清理 hook** |

路径定义证据：`TouchPlugin` 的 data/config/logs/verify/temp 路径在
`apps/core-app/src/main/modules/plugin/plugin.ts:1283-1309`，目录初始化在
`plugin.ts:1413-1424`；runtime logs 则由
`packages/utils/plugin/node/logger-manager.ts:31-41` 放在插件代码根下。文件型业务存储直接
使用 `getConfigPath()`，见 `plugin.ts:1869-1895`，因此卸载删除 data 根能覆盖 legacy JSON
和新的 business file API。SQLite 固定文件名见
`apps/core-app/src/main/modules/plugin/runtime/plugin-sqlite-resource-owner.ts:150-197`。

Secret 有两个命名空间：legacy transport 使用 `plugin.<name>.<key>`
（`apps/core-app/src/main/modules/plugin/services/plugin-storage-transport-service.ts:110-119,312-421`），
isolated Prelude 使用碰撞安全前缀
（`apps/core-app/src/main/modules/plugin/host/plugin-business-capabilities.ts:1451-1453,2440-2496`）。

## 3. Disable 的实际 barrier

### 3.1 顺序

manager 入口先停止 health monitor，再等待 `plugin.disable()`，随后无条件等待该插件的
SQLite owner 关闭；只有 `plugin.disable()` 返回成功时才清 localization、从
`enabledPlugins` 删除并持久化：
`apps/core-app/src/main/modules/plugin/plugin-module.ts:1019-1032`。

`TouchPlugin.disable()` 的顺序是：

1. 仅允许 LOADING / ENABLED / ACTIVE / CRASHED / LOAD_FAILED 进入，状态切换为
   DISABLING，并清 lifecycle、abort feature controllers：
   `apps/core-app/src/main/modules/plugin/plugin.ts:2448-2464`。
2. 先同步撤销 activation key / 清本地 key，再等待 utility process 停机：
   `plugin.ts:2467-2483`。该顺序有回归测试：
   `plugin.test.ts:3293-3347`。
3. 等待 retained capability（filesystem、browser、process、window、workspace 等）逐一
   close；失败会继续其他 close，并最终返回 false：`plugin.ts:2182-2218,2485-2495`。
4. 清 CoreBox items，并等待 widget watcher/cache release：`plugin.ts:2496-2498`。
5. 请求关闭插件窗口、退出 UI mode、释放 cached views：`plugin.ts:2499-2538`。
6. 注销 recommendation providers，最后设置 DISABLED；任一 runtime/resource teardown
   失败则设置 CRASHED 并返回 false：`plugin.ts:2540-2557`。

utility process 内部的更细 barrier 是：停止接收新 lifecycle work；可选等待插件
`onDestroy`；关闭 capability/resource dispatchers 和 activation-owned business/SQLite
资源；撤销 authority；等待 graceful shutdown，超时后 force-kill，并等待真实 child exit。
实现见 `apps/core-app/src/main/modules/plugin/host/plugin-runtime-service.ts:1077-1100` 和
`plugin-runtime-host.ts:1493-1630`。测试证明停机等待 `onDestroy`、资源和真实进程退出，且
重复 stop/dispose 幂等：`plugin-runtime-service.test.ts:519-576,986-1004`；pending work 在
退出 barrier 前已拒绝：`plugin-runtime-host.test.ts:2262-2283`。

### 3.2 语义与缺口

- disable 不删除 config、SQLite 文件、Secret、权限或 Core DB plugin data，符合“停用保留
  persistent plugin data”的目标语义。
- SQLite worker 关闭发生在 `TouchPlugin.disable()` 完成之后。若 SQLite close reject，
  `disablePlugin()` 会抛出，插件可能已经是 DISABLED，但 `enabledPlugins` 尚未更新，形成
  runtime 状态与 persisted enable 状态不一致；这里没有 manager-level 回归测试。
- 非 packaged/dev 环境窗口关闭通过 50ms timer 延迟执行，且不等待窗口 destroyed：
  `plugin.ts:2504-2525`。这对普通 disable 影响有限，但卸载紧接着删除代码时不是严格
  renderer-exit barrier。
- `sendToPlugin(...disabled)` 是 fire-and-forget，且发生在 utility process 已停止之后：
  `plugin.ts:2499-2502`，不能作为插件已收到 disabled 通知的证据。

## 4. Unload 与更新安装

`unloadPlugin()` 是卸载前的资源 barrier：

1. 非 DISABLED / LOADED 状态先等待 `plugin.disable()`；false / throw 立即阻止 unload：
   `apps/core-app/src/main/modules/plugin/plugin-module.ts:1249-1263`。
2. untrack README、移除 dev watcher、停止 health monitor：`plugin-module.ts:1265-1269`。
3. 删除 name index 后等待 `pluginSqliteResources.closePlugin()`：
   `plugin-module.ts:1271-1274`。
4. 调用 logger manager `destroy()`，再清 declared permission snapshot、issue/localization 和
   manager maps，广播 removed：`plugin-module.ts:1276-1295`。

这里的 `destroy()` 不是可等待 barrier。`PluginLoggerManager.destroy()` 只注销 polling 并
fire-and-forget `flush()`；flush 会重新 `mkdir` runtime log 目录：
`packages/utils/plugin/node/logger-manager.ts:104-110,134-170`。因此卸载删除代码目录与最后
一次日志 flush 存在竞态，flush 可能在删除后重建 `<pluginDir>/logs/**`。当前没有 logger
destroy/卸载竞态测试。

外部直接删除插件目录只触发 unload，不触发数据、Secret、权限清理：
`plugin-module.ts:1647-1653`。因此文件管理器删除代码不等价于产品“卸载”。

force update 会先等待 disable + unload，再删除旧代码目录并解包新版本；data、Secret、
权限都保留，符合升级保留状态的常规预期：
`apps/core-app/src/main/modules/plugin/plugin-resolver.ts:104-188`。原 teardown 失败时旧代码
保持不变的测试在 `plugin-resolver.test.ts:84-120`。但旧代码删除后没有 staging backup；
后续完整性检查或加载失败会删除新 target，不能自动恢复旧版本：
`plugin-resolver.ts:142-209`。这不是 uninstall 缺陷，但备份恢复/rollback 设计不能复用
当前 resolver 作为事务保障。

## 5. Permission revoke 的实际 barrier

权限 store 先在内存删除 persistent/session grants 和写 revoke audit，再等待 SQLite
持久化；持久化失败会恢复 data、dirty flag 和 session grants：
`apps/core-app/src/main/modules/permission/permission-store.ts:402-417,453-515`。回滚测试在
`permission-store.test.ts:288-310`；backend 不可用时 mutation fail-closed：
`permission-store.test.ts:349-387`。

提交成功后，`PermissionModule.publishRevocation()` 的顺序是：

1. 对 revoke-all 或 `storage.sqlite`，等待 `teardownPluginStorage(pluginId)`；
2. 同步 emit `PERMISSION_REVOKED`；
3. broadcast renderer projection；

见 `apps/core-app/src/main/modules/permission/index.ts:259-277`。SQLite teardown 由
`PluginModule` 注册并等待 owner close：`plugin-module.ts:2379-2382`。测试证明 renderer
更新不会越过 SQLite barrier：`permission/index.test.ts:69-94`。

其他 capability 的 revoke watcher 通过同步 `TouchEventBus.emit()` 触发；event bus 不等待
listener 返回的 Promise：`apps/core-app/src/main/core/eventbus/touch-event.ts:95-113`。
当前 watcher 会同步 abort in-flight calls，retained resource revoke 会 fail-close 整个
activation 并异步进入 host cleanup：`plugin-module.ts:1959-1973`、
`plugin-host-capabilities.ts:595-623`、`plugin-host-resources.ts:538-565,633-640`。单元测试证明
调用立即拒绝和最终 native resource -> external resources -> crash 顺序：
`plugin-host-capabilities.test.ts:172-227`、`plugin-runtime-service.test.ts:835-910`。

结论：授权状态在 store commit 后立即失效，新调用每次重新检查权限；但除 SQLite 外，权限
API 的成功响应不表示所有 native/process/stream 临时资源已经完成清理。#301 若要求
“revoke 返回时 capability-owned temporary resources 已清空”，需要统一可等待 revocation
barrier，而不能只依赖同步 event notification。

撤权不会删除 persistent plugin data 或 Secret，符合 PRD；当前也不会 disable 整个插件。

## 6. Uninstall 当前顺序与失败行为

renderer 只有二选一确认框，确认后直接调用 bool API：
`apps/core-app/src/renderer/src/components/plugin/PluginInfo.vue:211-245,552-560`。提示文案只说
“删除插件文件及缓存数据”，没有列出 config/SQLite/Secret，不提供导出按钮：
`apps/core-app/src/renderer/src/modules/lang/zh-CN.json:1618-1624`。

main 的实际顺序在 `apps/core-app/src/main/modules/plugin/plugin-module.ts:1310-1357`：

1. 从 manager map 解析 folder、manifest name、plugin code path 和 data root；找不到返回 false。
2. 等待 `unloadPlugin(folderName)`；失败时在任何持久数据删除前返回 false。
3. fire-and-forget 上报 store uninstall。
4. 并发提交 legacy + v2 Secret 前缀删除，并等待两者 settled；任一 reject 返回 false。
5. 删除 plugin code dir；失败仅 warning，继续。
6. 删除 data root（含 config/temp/verify/SQLite）；失败仅 warning，继续。
7. 删除 Core DB `plugin_data` rows；失败仅 warning，继续。
8. 持久化 enabled set，记录 success 并返回 true。

Secret prefix 删除本身走同一 root mutation queue，使用 atomic temp-file + fsync + rename；
不会覆盖其他插件 secret：`apps/core-app/src/main/utils/secure-store.ts:41-65,163-191,533-547`，
测试在 `secure-store.test.ts:102-131`。两个前缀用 `Promise.allSettled`，所以会都尝试；但它们
是两次独立 store mutation，可能一个已删、另一个失败，没有跨前缀 rollback。

SQLite owner 在记录从 map 删除后才等待 worker close，worker close 会 reject queued/active
操作并等待 `worker.terminate()`：
`plugin-sqlite-resource-owner.ts:263-288`、
`plugin-sqlite-worker-client.ts:95-117,245-254`。worker-exit barrier 测试在
`plugin-sqlite-resource-owner.test.ts:110-137`。

失败可见性如下：

| 失败点 | 当前返回 | 残留 / 后果 |
| --- | --- | --- |
| runtime/capability teardown | false | 插件实例仍在 manager，authority 已撤；可再次尝试 |
| SQLite close in unload | transport catch 后 false | unload 已删除 name index 等部分 runtime bookkeeping；状态可能半完成 |
| Secret 任一前缀删除 | false | 插件已经从 manager 删除，但 code/data 仍在；同一进程中 API 无法再次解析该插件重试 |
| plugin code 删除 | **仍 true** | code 或 runtime logs 残留 |
| data root 删除 | **仍 true** | config、SQLite、temp、verify 等残留 |
| Core DB plugin_data 删除 | **仍 true** | install source / plugin KV 残留 |
| enabled state persistence | **仍 true** | `persistEnabledPlugins()` 自己吞错，重启状态可能陈旧 |

API 又把所有 false 统一映射为“Plugin `<name>` not found”，SDK 只返回 boolean，UI 只显示
通用失败：`plugin-api-transport-service.ts:373-388`、
`apps/core-app/src/renderer/src/modules/sdk/plugin-sdk.ts:337-347`、
`packages/utils/transport/events/types/plugin.ts:401-414`。因此无法向用户报告失败 category、
剩余数据面或重试动作。

`reportPluginUninstall()` 在持久数据删除之前就发出，且 fire-and-forget；Secret 或文件删除
失败时远端仍可能已记录卸载：`plugin-module.ts:1329-1334`、
`apps/core-app/src/main/service/store-api.service.ts:158-178`。

## 7. 明确缺失的删除与导出面

### 7.1 必须纳入 plugin-owned deletion barrier

- **权限 grants/session grants**：unload 只清当前 manifest declaration snapshot
  (`plugin-module.ts:1282`；`permission-store.ts:568-573`)，没有 `revokeAll`。重装同名插件后
  历史 grant 仍可生效。卸载应在实例身份仍可解析时先 commit revoke-all，并等待资源 barrier；
  permission audit 是否保留应按 #301 retention policy 单独决定，不能把 grant 和 audit
  混为一项直接清空。
- **logger final flush**：必须改成 awaitable close/flush，且在 code dir rename/delete 前完成；
  否则会重建已删目录。
- **plugin data/code 删除结果**：当前错误被吞掉，必须逐项 verify absent，并返回稳定状态。
- **pending permission retry**：`pendingPermissionPlugins` 只在 grant event 删除，写入点在
  `plugin-permission-gate.ts:67-107`；unload/uninstall 应删除对应 entry，避免卸载后的陈旧
  auto-retry intent。
- **renderer scoped preference**：widget preview key 包含插件名并写 localStorage：
  `PluginFeatures.vue:158-163,198-222`、`ui-preference-storage.ts:6-38`。目前没有按插件前缀
  enumerate/delete API。它不一定是敏感数据，但属于“卸载清缓存”的可观测残留。
- **PluginLogModule subscription**：subscriptions 只有 renderer unsubscribe / webContents
  destroyed 时清理，见 `plugin-log.service.ts:175-215,378-407`；PluginModule unload 没有
  plugin-specific cleanup hook。需要将 active subscription 纳入 disable/unload 资源 owner，
  或证明 renderer route 一定先销毁。

### 7.2 需要产品 retention 决策的 host-owned 数据

- **权限 audit logs**：撤权会新增审计，不应未经 retention 决策随卸载静默删除。
- **plugin analytics**：`plugin_analytics` 以 plugin name 持久化
  (`apps/core-app/src/main/db/schema.ts:1066-1086`)，内存 `PluginTracer` 也没有 per-plugin reset
  (`apps/core-app/src/main/modules/analytics/collectors/plugin-tracer.ts:34-170`)。这属于 host-owned
  usage/telemetry category，应按 #301 的 30 天/clear controls 处理，而不是混进 plugin data
  删除事务。
- **flow / usage / search 历史中的 plugin identity**：这些是跨 actor 审计或推荐数据，可能
  引用 plugin name。是否删除、匿名化或按全局 retention 到期，需要数据分类清单；当前
  `uninstallPlugin()` 只删除 `plugin_data`，没有统一 lifecycle registry。

### 7.3 当前所谓导出并不是卸载前数据导出

Storage tab 只有 refresh/open folder/open editor/clear，没有 export：
`apps/core-app/src/renderer/src/components/plugin/tabs/PluginStorage.vue:272-325,490-533`。
clear 只清 config、runtime logs、data logs、temp；`getStorageRoots()` 不含 data 根本身、
`verify`、SQLite 文件或 Secret：`plugin.ts:1312-1318,3910-3932`。现有测试只覆盖上述四类
root：`plugin.test.ts:1982-2031`。

Logs tab 的 export 仅把当前 renderer 已加载的 `terminalLogs` 文本生成下载，不含全部历史
session，也不含 config/SQLite/Secret：
`apps/core-app/src/renderer/src/modules/hooks/usePluginLogManager.ts:22-64`、
`PluginLogs.vue:137-144,396-417`。因此 PRD 的“uninstall offers export before deletion”目前
完全缺失，不能复用现有 log export 作为证据。

## 8. 建议的可等待卸载协议

### 8.1 前置与 barrier 顺序

建议把 bool API 改成 versioned operation/result，并固定以下顺序：

```text
1. snapshot immutable owner identity + canonical code/data roots
2. user confirmation (explicit categories) + optional ordinary export
3. create durable uninstall intent/tombstone; block enable/reload/install for this name
4. commit revokeAll while permission/plugin identity still exists
5. await all revocation resource barriers
6. revoke activation authority; await onDestroy, capability/resource close, renderer/process exit
7. await SQLite worker close and logger final flush
8. remove runtime registries/subscriptions/pending retry state
9. delete both Secret prefixes
10. quarantine/rename code and data roots on their own filesystems, then delete
11. delete plugin_data and apply host-owned retention decisions
12. verify every required surface absent; persist enabled state
13. clear tombstone, broadcast removed, then report remote uninstall
```

authority 必须在任何耗时 cleanup 前失效；但持久数据删除必须等进程、worker、logger 和
renderer 都不再持有/重建文件之后开始。remote report 必须移到本地 commit 后。

### 8.2 幂等与失败恢复要求

- operation 以 immutable `pluginName + folderName + instanceId + canonical roots` 为 owner，
  不要在 unload 删除 manager entry 后再靠 manager 查找剩余路径。
- 同名并发 uninstall single-flight；disable/unload/revoke/retry 可以重复调用，已完成 step
  返回 `already-complete`，不能把第二次调用误报 `not-found`。
- 每个 destructive step 在 tombstone 中记录 `pending/completed/failed`，重启后可 resume；
  文件不存在、Secret prefix count=0、SQLite owner absent、DB row count=0 都应视为成功的
  幂等终态。
- barrier 失败时不开始持久删除，并保留可重试 owner metadata；authority 仍保持撤销。
- destructive phase 开始后不承诺“回滚已删除用户数据”。安全策略应是 resumable completion，
  不是伪事务；用户 export 必须在该 phase 前完整完成并验证。
- code/data 可先在同一 filesystem 内原子 rename 到不可加载 quarantine，再异步删除；两个
  root 不在同一 filesystem 时分别 journal，不能声称跨根原子性。
- Secret 两个前缀要么提供单次多前缀 atomic mutation，要么在 tombstone 中分别记录并可
  重试；不得因一个 prefix 已删除而无法继续另一个。
- 返回稳定 per-category 结果，例如 `runtime`, `permissions`, `sqlite`, `logger`, `secrets`,
  `code`, `data`, `pluginData`, `hostRetention`, `remoteReport`，UI 只在 required local categories
  全部 verified 后显示成功。

### 8.3 最小回归测试清单

1. active plugin uninstall 的严格调用顺序，所有 deferred barrier 释放前不得触发删除。
2. disable preserves config/SQLite file/Secret/grants，但关闭 process/worker/capability/view。
3. revoke-all commit 失败全回滚且不删数据；成功后等待所有 capability temporary resources。
4. logger pending flush 不会在 code root 删除后重建目录。
5. Secret legacy/v2 prefix 其中一个失败后可重试，其他插件 Secret 保持不变。
6. code/data/DB 任一删除失败返回 category failure，不报告 success/remote uninstall。
7. 失败、并发和重启后的重复 uninstall 都幂等完成，不依赖 manager 中仍有实例。
8. Windows 上真实 SQLite worker/WAL/SHM exit 后再删 data root。
9. export 成功是 destructive phase 前置条件；取消/失败时零删除。
10. 普通 export 不含 plaintext Secret；单独加密 Secret envelope 的测试归 #301 backup/export
    设计，不应塞进现有 log export。

## 9. 结论

现有 runtime hard-cut 已提供较强的 activation/process/SQLite close 基础，disable 的“保留
持久数据、终止 active resources”大体成立；`storage.sqlite` 撤权也有专门 awaited barrier。
但当前 uninstall 不是可证明完成的 deletion barrier：它缺少 export、revokeAll、awaitable
logger close、稳定分阶段结果、删除核验和 durable retry owner；并且会在文件/DB 删除失败时
返回成功。#301 应在现有 runtime/SQLite primitives 上增加一个单一、可恢复、幂等的
uninstall coordinator，而不是继续向 `uninstallPlugin(): Promise<boolean>` 追加独立
best-effort cleanup。
