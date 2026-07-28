# 审计证据 — SQLite 与权限控制

> 生成：主线逐 file:line 验证 + libsql 动态复现
> confirmed = 有 file:line + 动态 repro；hypothesis = 静态可疑，需运行时确认

## 🔴 Confirmed: F1 — 插件 SQLite 可 ATTACH 越界读写

**`file:line`**
- `apps/core-app/src/main/modules/plugin/services/plugin-storage-transport-service.ts:155` — 数据库路径 `path.join(plugin.getDataPath(), 'plugin-sdk.sqlite')` 只约束了默认连接，未约束 SQL。
- `apps/core-app/src/main/modules/plugin/services/plugin-storage-transport-service.ts:662-666` — `client.execute({ sql, args })` 将插件 SQL 原样传给 libsql，不做 SQL 解析/拦截。
- `packages/utils/plugin/sdk/sqlite.ts:52-57` — SDK 端同样只 trim SQL，不做禁止词检查。

**动态复现（已执行，隔离临时目录，不读真实库）**
```
pluginPath: <tmp>/plugins/demo/plugin-sdk.sqlite
hostPath:   <tmp>/host-sensitive.sqlite  (含 fixture-secret)
ATTACH DATABASE <hostPath> AS hostdb  → 成功
SELECT value FROM hostdb.secrets     → "fixture-secret"
ATTACH DATABASE <escapedPath> AS escaped → 成功
CREATE TABLE/INSERT INTO escaped.proof   → written-outside-plugin-root
PRAGMA database_list → 3 个数据库 (main/hostdb/escaped)
```

**影响**：插件可读写宿主数据库、其他插件数据库、任意用户目录下 SQLite 文件；current path-isolation 是文件级 placement，不是 SQL 级 containment。

**修复边界**
- 方案A（防御）：handler 中禁止含 `ATTACH`/`DETACH`/`load_extension`/`PRAGMA` 关键字（需 SQL tokenizer，防止 `--`注释绕过），参数上界 `LIMIT 1000`。
- 方案B（根治）：libsql 连接级别设 `SQLITE_LIMIT_ATTACHED=0`（禁止 ATTACH）+ `SQLITE_DBCONFIG_ENABLE_LOAD_EXTENSION=0`。
- 无论哪种方案，必须跨 `execute`/`query`/`transaction` 三个 handler 统一生效。

---

## 🔴 Confirmed: F2 — Permission Module 不可用时 SQLite 静默放行（fail-open）

**`file:line`**
- `apps/core-app/src/main/modules/plugin/services/plugin-storage-transport-service.ts:170-174`：
```ts
const resolveSqlitePermissionError = (plugin: TouchPlugin): string | null => {
  const permissionModule = getPermissionModule()
  if (!permissionModule) {
    return null   // ← permission runtime 不可用时 = 无错误 → 继续执行
  }
  // ...
}
```
- 对比规范 fail-closed 模式：`apps/core-app/src/main/modules/permission/channel-guard.ts:104-110` 已有 `failClosedForPlugin: true` → `PERMISSION_UNAVAILABLE`。

**影响**：若 permission module 未初始化、已销毁或 backend-unavailable 阶段，任意插件的 SQLite 调用绕过权限检查，直接执行。当前 permission module 在 `apps/core-app/src/main/index.ts:179` 启动顺序中先于 pluginModule，正常启动不会触发；但 shutdown/异常恢复阶段风险存在。

**修复边界**：`resolveSqlitePermissionError` 改用 `withPermission(failClosedForPlugin: true)` 或等效 fail-closed 逻辑。

---

## 🔴 Confirmed: F3 — revoke/revokeAll 不清 sessionGrants

**`file:line`**
- `apps/core-app/src/main/modules/permission/permission-store.ts:453-467` — `revoke` 只删 `this.data.grants`，不删 `this.sessionGrants`。
- `apps/core-app/src/main/modules/permission/permission-store.ts:472-480` — `revokeAll` 同理。
- `apps/core-app/src/main/modules/permission/permission-store.ts:594` — `checkPermissionAccess` 中 `hasSessionGrant || hasStoredGrant`，任一为 true 即放行。

**影响**：UI 调用 `permissionSdk.revoke`（`SettingPermission.vue:271` / `PluginPermissions.vue:363`）或 `revokeAll`（SettingPermission:304 / PluginPermissions:399）后，若该权限曾以 session 方式授予（install flow grantMode='session'，`plugin-module.ts:656-658`），当前进程内 session 权限不清，插件继续可用。重启后 session 自然清空，所以不是持久化绕过，但 UI 反馈的“已撤销”与实际生效之间存在进程内窗口期。

**修复边界**：`revoke`/`revokeAll` 中同步删除 `this.sessionGrants[pluginId]` 中对应项。

---

## 🔴 Confirmed: F4 — 插件 Prelude 在主进程 vm 中执行，TUFF_PLUGIN_ISOLATION 默认关闭

**`file:line`**
- `apps/core-app/src/main/modules/plugin/plugin-feature.ts:43-78` — `vm.createContext(sandbox)` + `vm.runInContext(scriptContent, sandbox)`，在主进程 Node 上下文。
- `apps/core-app/src/main/modules/plugin/plugin-module.ts:1511` — `if (process.env.TUFF_PLUGIN_ISOLATION === '1')`，默认未设置 = 不启用。
- `docs/plan-prd/03-features/plugin-runtime-isolation-prd.md:61` — 阶段5 灰度，默认关。

**影响**：所有第三方插件代码在主进程 Node 上下文执行。require 黑名单（`plugin-require.ts`）允许 `node:child_process`/`node:fs`/`node:os`，且 `vm` 上下文可通过 `constructor.constructor` 逃逸到主进程。当前权限系统只能约束走 SDK/transport 的调用（`http`/`storage`/`clipboard` 等），不能约束主进程内任意代码执行。

**这不是本审计新发现**——仓库已文档化为 C1-A/C1-B split（`docs/engineering/security-hardening-handoff-2026-07-15.md:15`），C1-A（require 收紧）已落地，C1-B（进程隔离）stage2 实验核心已落地但默认关闭且缺事件回调 RPC + AbortSignal。

**审计结论**：在本信任边界补齐前，SQLite `storage.sqlite` 的权限声明只能约束善意插件；不可信第三方插件在主进程执行时，ATTACH 只是数十种可能越界路径之一。

---

## 🔴 Confirmed: F5 — SQL 资源无上界（无 max rows / 无 timeout / 无 statement limit）

**`file:line`**
- `apps/core-app/src/main/modules/plugin/services/plugin-storage-transport-service.ts:717-721` — `client.execute({ sql, args })` 无 timeout/nrows 参数。
- `apps/core-app/src/main/modules/plugin/services/plugin-storage-transport-service.ts:662-666` — execute handler 同上。
- `apps/core-app/src/main/modules/plugin/services/plugin-storage-transport-service.ts:789-801` — transaction for-loop 无 statement 数量上限或总字节上限。

**影响**：插件可执行 `SELECT * FROM huge_table`（全量导入）、百万行事务、无限递归 CTE、多表笛卡尔积。无 timeout 则恶意单查询可阻塞 Transport handler 的 async 上下文。

**修复边界**：handler 增加 max rows（如 1000）、statement 数量上限、单 statement SQL 长度上限、transaction for-loop 语句数上限。libsql 层可考虑 statement timeout（`sqlite3_busy_timeout` 不覆盖此场景，需 Promise.race 外部超时中断）。

---

## 🟡 Hypothesis: H1 — translation 插件权限成功缓存未随撤权失效

**来源**：`.trellis/tasks/07-27-optimize-core-utility-plugins/research/plugin-audit.md:26`
```text
网络权限和 AI 权限存在进程级成功缓存，见
plugins/touch-translation/index/main.ts:91；需要验证运行中撤权后的行为。
```
**待验证**：需要读取 `plugins/touch-translation/index/main.ts:91` 确认缓存变量作用域和失效逻辑。
