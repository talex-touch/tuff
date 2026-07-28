# Implementation Plan — Transport Caller Identity #300

## RED 1 — Activation And Sender Authority

- [x] 为 plugin view registry 增加 tests：current registration resolves；conditional unregister 不删除 replacement；stale key/generation、name mismatch、unknown/destroyed sender fail closed。
- [x] 为 `TouchChannel` 抽取的 pure caller resolver 增加 table tests：valid sender、omitted key、forged key、stolen other-plugin key、unregistered key holder、re-enabled stale sender。
- [x] 为 `ipcMain.handle` 增加 regression：registered plugin sender 获得 plugin context，不能绕到 host context；first-party sender 保持无 plugin context。

## GREEN 1 — Activation And Sender Authority

- [x] 给 Plugin runtime 增加 stable instance id + monotonic activation generation；扩展 key manager metadata lookup 并保持旧 name lookup compatibility。
- [x] 将 plugin view registry 改为 tokenized activation snapshots，更新 CoreBox 与 DivisionBox 注册/销毁 call sites。
- [x] raw channel 与 invoke lane 接入同一 sender identity resolver；internal candidate 不进入 serialization。

## RED 2 — Runtime Brand And Local Invoke

- [x] 在 utils main transport tests 证明 non-empty/forged key 与手写 `{ verified: true }` 不产生 authoritative context。
- [x] 增加 valid current key、revoked key、wrong plugin/key pair、old generation local invoke tests。
- [x] 增加 explicit trusted-test factory tests：test runtime 可用；结构复制失去 brand；production runtime 拒绝 factory。

## GREEN 2 — Runtime Brand And Local Invoke

- [x] 增加 private runtime brand、`isAuthoritativePluginContext()` 与集中 context builder；从 `PluginSecurityContext` production contract 移除裸 boolean authority。
- [x] 修改 `TuffMainTransport.on`、`onStream`、`ipcMain.handle`、`invoke` 使用统一 builder。
- [x] 在 `plugin.ts` 增加一个 local invoke context helper，机械替换所有 `verified: Boolean(this._uniqueChannelKey)`。

## RED 3 — MessagePort And Plugin-Host Protocol

- [x] 扩展 port tests：plugin upgrade requires authoritative sender；payload plugin mismatch 拒绝；sender/port/generation mismatch 拒绝；re-enable 后旧 port/stream 失效。
- [x] 增加 host protocol tests：main-issued handle 路由正确；child pluginName 不再参与 authority；unknown/cross-plugin/stale-generation handle 拒绝；host restart 清空 handle。

## GREEN 3 — MessagePort And Plugin-Host Protocol

- [x] `PortRecord` 保存 authoritative snapshot，upgrade/confirm/lookup/stream start 校验 sender + instance + current generation。
- [x] `HostLoad` / `HostSdkCall` 改为 opaque handle + host generation；main-side contexts map 按 handle 索引并在 exit/stop/unload 清理。
- [x] 保持 plugin-host experimental flag 与 lifecycle behavior 不变，不扩展到 #297 event callback/isolation scope。

## RED 4 — Privileged Consumers

- [x] 更新 channel-guard tests：branded current/test identity 允许；`verified: true`、copied identity、stale identity 拒绝。
- [x] 更新 localization/selection/plugin-window privileged tests，证明统一 verifier 被消费。
- [x] 扫描生产代码，确保没有 `context.plugin?.verified` 或 `verified: Boolean(_uniqueChannelKey)` 剩余 authorization path。

## GREEN 4 — Privileged Consumers

- [x] `withPermission(requireVerifiedPlugin)` 与 localization helper 改用 `isAuthoritativePluginContext()`。
- [x] 按最小范围迁移直接构造 privileged test contexts 到 testing factory；不改变 permission grant fixture。
- [x] 将 verifier/API contract 记录到 `frontend/plugin-runtime-security.md`，注明 key payload、boolean 与 plugin name 都不是 identity proof。

## REFACTOR

- [x] 合并重复 metadata equality/check helpers，保持 channel-core 与 main-transport 各自职责：前者解析真实 sender，后者签发/验证 runtime brand。
- [x] 确保 key/handle 不进入 logger、error metadata、reply payload、audit 或 persistence。
- [x] 检查 destroyed listeners、port cleanup、plugin disable/re-enable 与 host restart 不泄漏 registry entries。
- [x] 更新 `#299` / `#297` dependency notes；修复成立后在安全审计 backlog 标记 F7 resolved 并附测试证据。

## Validation

```bash
pnpm -C packages/utils exec vitest run \
  __tests__/main-transport-identity.test.ts \
  __tests__/main-transport-port-identity.test.ts \
  __tests__/main-transport-stream.test.ts

pnpm -C packages/utils test

pnpm -C apps/core-app exec vitest run \
  src/main/core/channel-caller-identity.test.ts \
  src/main/modules/plugin/runtime/plugin-view-registry.test.ts \
  src/main/modules/plugin/runtime/plugin-window-boundary-contract.test.ts \
  src/main/modules/plugin/host/plugin-host-identity.test.ts \
  src/main/modules/permission/channel-guard.test.ts \
  src/main/modules/plugin/plugin-localization-channels.test.ts \
  src/main/modules/native-capabilities/index.test.ts \
  src/main/channel/system-selection-capture-handlers.test.ts \
  src/main/modules/plugin/plugin.test.ts

pnpm -C apps/core-app run typecheck:node
pnpm -C packages/utils exec eslint <scoped utils files>
pnpm -C apps/core-app exec eslint <scoped CoreApp files>
git diff --check
```

## Verification Evidence

- RED：main transport identity 4/4 failed；sender registry/resolver 2 files failed；plugin port 2/2 failed；privileged forged-context 2/18 failed；plugin-host identity module missing。
- GREEN：utils focused 3 files / 10 tests passed；CoreApp focused 9 files / 77 tests passed。
- Broad utils regression：117 files / 905 tests passed。
- CoreApp `typecheck:node`、utils/CoreApp scoped ESLint 与 `git diff --check` passed。
- CoreApp `test:core-main` 的本任务相关 tests passed；全命令另有既有环境/依赖 failures：3 suites 无 Electron binary，runtime module manifest 缺 `formdata-node`。
- Trellis implement/check subagents 因本机缺少 OpenRouter 凭据未运行；主会话完成实现、review 与全部 scoped gates。

## Review Gates

- Gate A：activation metadata/rotation 与 sender resolver RED/GREEN 通过后，才能签发 runtime brand。
- Gate B：raw IPC、ipcMain.handle、local invoke、stream/port、plugin-host 五条 production lane 都有 authoritative identity 后，才能 hard-cut privileged guards。
- Gate C：伪造、mismatch、stale、destroyed、cross-plugin tests 全绿后，才评论/关闭 GitHub #300。
- Gate D：#299 只依赖公开 verifier/type，不复制 key validation；#297 复用 opaque host identity contract。
- 不提交、不 push，除非用户另行授权。
