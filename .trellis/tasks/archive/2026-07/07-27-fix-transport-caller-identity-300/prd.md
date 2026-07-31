# 修正 Transport 调用身份 #300

## Goal

建立由宿主 registry 签发、绑定真实 sender/port/plugin instance/current activation 的 caller identity；任何 payload 字段或裸 `verified` 布尔值都不能单独成为权限依据。

## Confirmed Facts

- `TouchChannel.__parse_raw_data()` 已用 `webContents.id -> pluginName` registry 强制插件 sender 进入 PLUGIN channel，但 registry 只保存 plugin name，不表达 plugin instance、activation generation 或 current key。
- `TuffMainTransport.on()` 与 `onStream()` 仍以 `Boolean(data.header?.uniqueKey)` 生成 `HandlerContext.plugin.verified`；非空值不是 key validation，更不是 sender-bound proof。
- raw IPC、`ipcMain.handle`、local `transport.invoke` 与 stream/MessagePort lane 分别构造 context，目前没有统一 caller-identity contract。
- `PluginKeyManager` 只提供 key-to-name lookup；插件每次 enable 会申请新 `_uniqueChannelKey`，这个轮换点可作为 activation generation 的 authority anchor。
- `plugin.ts` 的 main-local SDK facade 多处自行构造 `{ name, uniqueKey, verified }`，因此 production local context 同样由调用者自证。
- plugin-host control port 已绑定 utility-process generation，但 `sdk-call` 仍携带 child 自报 `pluginName`，宿主据此选择 SDK context。
- `withPermission(requireVerifiedPlugin: true)` 和 localization guard 直接消费 `context.plugin.verified`，存在把布尔值误当 authorization proof 的契约风险。

## Requirements

### R1. Authoritative Activation Registry

- 插件 activation key registry 同时记录 plugin name、稳定 plugin instance id、单调 activation generation 和 current key；disable/re-enable 后旧记录不可再验证。
- plugin view registry 保存同一组宿主签发元数据与 registration token；destroyed/stale cleanup 不能误删新的 registration。
- key、plugin name、instance、generation 任一不一致时均返回 unverified plugin context，而不是降级为 first-party MAIN caller。

### R2. Sender-Bound IPC Identity

- raw channel 只从 `IpcMainEvent.sender`、plugin view registry 与 current activation registry 导出 authoritative identity；payload `uniqueKey` 仅作兼容/一致性校验，不能签发 identity。
- `ipcMain.handle` lane 使用同一 sender resolver；注册插件 sender 不得因绕开 raw channel 而得到 host context。
- unregistered、destroyed、forged-key、mismatched-plugin、stale-generation sender fail closed；已注册且 metadata 全量匹配的 sender 才获得 authoritative context。
- first-party sender 保持无 plugin context，避免改变现有 host handler 行为。

### R3. Port And Plugin-Host Binding

- plugin-scoped MessagePort 在 upgrade 时快照 authoritative identity；confirm、lookup 与 stream start 必须匹配同一 sender、plugin instance 和 activation generation。
- port 在 sender destroyed 时关闭；插件 re-enable 后旧 port 即使尚未物理关闭也不能复用。
- plugin-host `sdk-call` 不再以 child 自报 plugin name 选择 SDK context；宿主签发 opaque plugin instance handle，并同时校验当前 host generation 与 loaded instance registration。
- utility-process restart、plugin reload/unload 后的 stale handle/call fail closed，且不会路由到其他插件的 SDK context。

### R4. Local And Test Authority

- production `transport.invoke` 只接受 plugin name/current activation key 作为 lookup input，最终 context 的 instance/generation 必须从 `PluginKeyManager` registry 回填。
- caller 传入 `verified: true` 或伪造 authority 字段不得产生 authoritative identity。
- unit tests 使用单独的显式 trusted-test factory/context；该 factory 仅在 test runtime 可签发 identity，不冒充 sender 或 production host proof。

### R5. Privileged Consumption

- `HandlerContext.plugin` 暴露可审计的 authoritative identity/provenance；移除或废弃 production authorization 对 `verified` 裸布尔值的依赖。
- `withPermission(requireVerifiedPlugin: true)`、plugin localization 与现有 privileged plugin handlers 统一调用 identity verifier；结构相似但未由 transport authority 签发的对象必须拒绝。
- identity/proof 不进入 renderer reply、日志、audit、持久化或 plugin-visible payload。

## Acceptance Criteria

- [x] 任意 non-empty、stolen 或 forged caller-supplied `uniqueKey` 单独出现时均不能产生 authoritative identity。
- [x] raw IPC 与 `ipcMain.handle` 对已注册 current sender 签发相同的 plugin name/instance/generation identity。
- [x] omitted/mismatched key、unregistered/destroyed sender、stale registration 与旧 activation generation 有 focused fail-closed tests。
- [x] plugin-scoped port upgrade/start 绑定 sender + instance + generation；re-enable 后旧 port 无法继续服务。
- [x] plugin-host SDK call 由宿主 opaque handle + host generation 路由；伪造 plugin name、stale handle/generation 和 cross-plugin handle 均拒绝。
- [x] local production invoke 经 key registry lookup 签发 identity；无效/旧 key 不可信；trusted test context 只能通过显式 test factory 创建。
- [x] `withPermission` 与 localization privileged guard 不再以 `verified === true` 单独授权，伪造结构对象回归测试通过。
- [x] plugin SDK facade 不再构造 `verified: Boolean(_uniqueChannelKey)`；正常 IPC、stream、local SDK 与 first-party host 调用回归通过。
- [x] focused Vitest、CoreApp node typecheck、utils/CoreApp scoped lint 与 `git diff --check` 通过。

## Dependencies

- 依赖 `#296` 已建立的 permission guard 与后续 storage consumer contract；本任务不改 permission grant/revoke 语义。
- `#299` privileged SQLite/storage handler 应消费本任务的 authoritative identity verifier。
- `#297` 可继续强化 one-plugin-per-process 隔离，但不得重新引入 child 自报 plugin name 的 authority。

## Out Of Scope

- 完成 `#297` 的完整 plugin Prelude 进程隔离、event callback proxy 或 sandbox hard cut。
- 修改插件权限 UI、manifest schema、默认 grant 或 SDK API 版本。
- 将 activation key 暴露为日志、持久化 id 或 renderer 可读取的新字段。
- 顺手重构与 caller identity 无关的 legacy channel 或所有 transport API。

## Verification Evidence

- Runtime brand tests prove payload-only keys and caller-authored/copied identity objects are unverified; the trusted-test factory rejects production runtime.
- Sender tests cover current/omitted/mismatched/stolen/stale/destroyed/unregistered cases; all three host-created plugin WebContents surfaces register before first load/IPC.
- Port tests prove authoritative upgrade/confirm, concrete `message-port` provenance, and no old-port authority after revoke.
- Plugin lifecycle test proves stable instance id, generation 1 -> 2, key rotation and revoke-on-disable.
- Plugin-host registry/protocol uses opaque handle + host generation; reload/unload/clear invalidate old handles and child messages no longer carry authoritative plugin name.
- Production scan finds no `context.plugin?.verified`, `plugin.verified`, or `verified: Boolean(this._uniqueChannelKey)` authorization path.
- Validation: utils full suite 117 files / 905 tests; CoreApp focused 9 files / 77 tests; CoreApp node typecheck; scoped lint; `git diff --check`.

## Notes

- GitHub Issue: <https://github.com/talex-touch/tuff/issues/300>
- Task is ready for review; no commit or push was performed.
