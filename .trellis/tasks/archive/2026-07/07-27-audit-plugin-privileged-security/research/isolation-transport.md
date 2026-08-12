# 审计证据 — 隔离与调用者身份

## ✅ 已闭环: G1 — webContents 注册表防 IPC sender 伪造

**`file:line`**
- `apps/core-app/src/main/core/channel-core.ts:186-192` — `__parse_raw_data` 先查 `keyToNameMap(uniqueKey)`，再用 `resolvePluginNameByWebContents(e.sender?.id)` 覆盖。
- `apps/core-app/src/main/modules/plugin/runtime/plugin-view-registry.ts:1-30` — `registerPluginWebContents`/`resolvePluginNameByWebContents` 维护 webContentsId→pluginName 注册表。
- `packages/utils/transport/sdk/main-transport.ts:543-547` — HandlerContext 中 `verified: Boolean(data.header?.uniqueKey)` 依赖 channel-core 已正确路由后的 plugin name。

**评估**：此机制已在 commit `83d292fc3`（2026-07-15）落地。插件视图即使伪造 payload 中的 `uniqueKey`，`resolvePluginNameByWebContents` 仍会按 webContentsId 查出真实 sender → 强制走 PLUGIN channel → 进入 permission gate。已缓解该攻击面。

**残留关注**：若存在未注册的 webContents（如 `window.open` 产的新窗口）但通过某种方式拿到 key → 走 MAIN channel。`plugin-window-policy.ts:551` 的 `setWindowOpenHandler(() => ({ action: 'deny' }))` 阻止该窗口被创建，但需确认所有 first-party 窗口也注册到了正确的 sender 路径。

---

## 🔴 Confirmed: F6 — legacy 插件视图默认 nodeIntegration:true / contextIsolation:false

**`file:line`**
- `apps/core-app/src/main/core/window-security-profile.ts:37-43`：
```ts
const COMPAT_PLUGIN_VIEW_SECURITY_BASE = {
  webSecurity: false,
  nodeIntegration: true,
  nodeIntegrationInSubFrames: true,
  contextIsolation: false,
  sandbox: false,
  webviewTag: true
}
```
- `apps/core-app/src/main/modules/plugin/runtime/plugin-view-security-profile.ts:109-125`：`V260615` 以下的 sdkapi（含 21/22 个内部官方插件的 260428），`resolveCandidateProfile` 默认返回 `compat-plugin-view`。
- `apps/core-app/src/main/modules/plugin/runtime/plugin-view-security-profile.ts:64-68`：`TUFF_PLUGIN_SECURE_VIEWS` 默认不设置，不强制升级。

**影响**：插件 renderer 视图（WebContentsView）在 compat profile 下有 `nodeIntegration:true` + `contextIsolation:false`。这意味着插件渲染页面可直接 `require('electron').remote` / `require('child_process')` / 访问 Node API。虽然 window policy（`plugin-window-policy.ts:546-572`）阻止了 will-navigate 和 window.open，但不阻止 preload 内或注入的脚本执行 Node 代码。

**审计结论**：compat 视图给了插件页面相当于宿主进程的 Node 权限。H2 加固（`TUFF_PLUGIN_SECURE_VIEWS`）已实现但默认关闭；现有官方插件中 21/22 个会受影响。与 C1-B 同理，这是仓库已认知的已文档化 backlog，不是新发现，但本审计必须标记为高危边界。

---

## ✅ 已闭环: G2 — Prelude require 黑名单

**`file:line`**
- `apps/core-app/src/main/modules/plugin/runtime/plugin-require.ts:10-23` — DENIED_MODULE_EXACT_IDS: `electron`, `@libsql/client`, `@crosscopy/clipboard`, `extract-file-icon`
- `apps/core-app/src/main/modules/plugin/runtime/plugin-require.ts:33-46` — DENIED_NODE_BUILTINS: `net`, `dgram`, `tls`, `http`, `https`, `http2`, `vm`, `cluster`, `module`, `inspector`, `repl`, `v8`
- `apps/core-app/src/main/modules/plugin/runtime/plugin-require.ts:28-31` — 注释明确：`child_process / fs / os / process` 有意允许，因为官方插件使用它们；进程隔离是根治。

**评估**：C1-A require 收紧（commit `3bd386741` + 修正 `b422f81fe`）已落地。测试覆盖了拒绝 electron/@libsql/client/net/http/vm 等模块（`plugin-require.test.ts:23-43`），并确认为官方插件保留 `child_process/fs/os`。

**残留风险**：主进程执行 + `child_process`/`fs`/`os` 可用 = 恶意插件可执行任意系统命令、读写任意文件、查看进程列表。但这不是 require 黑名单的失败——这是主进程执行模型的选择。

---

## ✅ Resolved: F7 — transport caller identity 由 sender/activation authority 签发

**`file:line`**
- `packages/utils/transport/sdk/main-transport.ts:543-547`：
```ts
plugin: data.plugin ? {
  name: data.plugin,
  uniqueKey: data.header?.uniqueKey || "",
  verified: Boolean(data.header?.uniqueKey),
} : undefined
```
- `apps/core-app/src/main/modules/permission/channel-guard.ts:98-99`：
```ts
if (requireVerifiedPlugin && (!pluginId || context.plugin?.verified !== true)) {
```

**分析**：`verified === Boolean(data.header?.uniqueKey)` 表示只要有 non-empty uniqueKey 就算 verified。当前防护链是：channel-core 先按 webContents registry 强制路由 → transport 再设 verified。但如果 channel-core 的 webContents registry 覆盖逻辑被绕过（例如 handler 通过 `invoke` 而非 `channelHandler` 路径到达），context 就可能带着错误的 verified 标志。

对比 Intelligence 模块——高层 agent/workflow/control-plane handler 使用 `withPermission(requireVerifiedPlugin: true)` + `failClosedForPlugin: true`，形成了双层防护。而 SQLite handler 是自己手写 permission 检查（F2），不走 `withPermission` 统一 middleware——即使上线 failClosedForPlugin 也无法自动受益。

**审计结论（历史）**：不是 confirmed vulnerability（channel-core 的路由逻辑本身正常），但 `verified` 字段的松散定义降低了 defense-in-depth 强度。

**Resolution（#300）**：

- `TouchChannel` activation registry 现记录 plugin instance、generation 与 current key；CoreBox、DivisionBox、public plugin window 都在首次 load/IPC 前 tokenized 注册 WebContents。
- raw channel 与 `ipcMain.handle` 从真实 sender registration 导出 identity candidate；forged/stolen/stale key 只保留 unverified PLUGIN scope。
- `TuffMainTransport` 通过 private runtime brand 签发 `web-contents` / `local-host` / `message-port` identity；local caller 的 `verified` 字段被忽略。
- `withPermission`、localization 与 native capability guards 改用 `isAuthoritativePluginContext()`，不再消费布尔值。
- plugin-scoped MessagePort 绑定 sender/instance/generation/portId；plugin-host SDK context 改为宿主 opaque handle + host generation。
- Evidence：utils full suite 117 files / 905 tests；CoreApp focused identity/security suite 9 files / 77 tests；CoreApp node typecheck 与 scoped lint通过。
