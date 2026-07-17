# 剩余安全加固 Backlog — 详细实施 Handoff — 2026-07-15

> 主 handoff（`security-hardening-handoff-2026-07-15.md`）的实施细节补充。
> 每一项都在本轮审计中定位过，这里给接手者可直接照做的现状 / 步骤 / 验证 / 陷阱。
> **两条共同硬约束**：① 多数项需要真机 app 或真实 D1 才能验收；② 开始前读取当前 worktree/Trellis 状态并协调文件 owner，不依赖本文的历史并行修改快照。

---

## [#15] C1-B 阶段3 — 事件式回调 RPC + AbortSignal 代理

**现状**：阶段2 实验核心（`plugin-host-process.ts` + `plugin-host-bridge.ts`，commit `11d31ca11`）只做了 **invoke 式** SDK（plugin→main：子进程 Proxy 把方法调用转发回主进程）。两个缺口：
- **事件式回调**：`channelBridge.onMain(evt, cb)`（`plugin.ts` getFeatureUtil 内）是 main→plugin 的回调注册，跨进程要反向 callback RPC。当前子进程 Proxy 把 `cb`(函数)当普通 arg，`JSON.stringify` 会丢掉它。
- **AbortSignal**：`onFeatureTriggered(id, query, feature, signal)` 的 `signal` 当前被 `toCloneable` 清成 `{}`，取消不透传。

**实施步骤**：
1. 子进程 `createSdkProxy`（`plugin-host-process.ts`）：调用时扫描 `args`，遇到函数 → 分配 `callbackId` → 存进子进程 `callbackRegistry: Map<number, Function>` → 在 `sdk-call` payload 里用 `{ __callback: callbackId }` 占位替换函数。
2. 主进程 `handleSdkCall`（`plugin-host-bridge.ts`）：反序列化 args 时遇到 `{ __callback }` → 建 wrapper `(...a) => controlPort.postMessage({ type:'sdk-callback', callbackId, args: toCloneable(a) })` → 用 wrapper 调真实 SDK（如 `context.channelBridge.onMain(evt, wrapper)`）。
3. 新增 `sdk-callback` 消息类型（`plugin-host-protocol.ts`）：子进程收到 → `callbackRegistry.get(callbackId)?.(...args)`。
4. **AbortSignal**：`callLifecycle` 若某 arg 是 AbortSignal → 传 `{ __signal: signalId }`；子进程建本地 `AbortController` 注入；主进程 signal `abort` 事件 → 发 `lifecycle-abort` → 子进程 `controller.abort()`。
5. callback 生命周期：插件/视图销毁或 `onClose` 时清 `callbackRegistry`，防泄漏。

**验证**：合成测试（一个注册 onMain 回调的测试 Prelude，主进程触发事件，断言子进程回调被调）+ **逐个用 onMain 的官方插件真机回归**。

**陷阱**：先确认 `plugin-host-bridge.ts` 当前 owner 与 generation/restart 语义；重点守住 callback registry 清理和 signal 多次 abort 幂等。

---

## [#17] C1-B 阶段5 — 灰度 + 全插件真机回归 + 性能

**现状**：`TUFF_PLUGIN_ISOLATION` 默认关；阶段2 只有合成闭环自检（`plugin-module.ts` 里 `__c1b_selfcheck__`）。

**实施步骤**：
1. **逐 `plugins/*` 真机回归**（flag 开）：每个插件测 `onFeatureTriggered` / `onItemAction` / `onInputChanged` / `onStorageChange`，比对隔离前后行为一致。重点覆盖用 `feature.pushItems`、`channelBridge.onMain`(依赖 #15)、`require('node:child_process'/'fs')` 的插件（如 touch-system-actions / touch-quickops）。
2. **安全回归断言**：在子进程 Prelude 跑 `this.constructor.constructor('return process')().pid` — 应是**子进程** pid（非主进程）；`require('node:child_process')` 可用但只在子进程隔离作用。
3. **性能**：冷/热首次触发延迟（utilityProcess fork + Prelude load 开销）、内存；进程预热（类似 `DivisionBoxPool`）；SDK 调用批处理减少 MP 往返。
4. **灰度**：默认关 → 官方插件全绿 → 默认开；保留 kill-switch。

**验证**：全 `plugins/*` 功能回归 + 安全断言 + 性能基准 + `core:dev`/打包冒烟。**这一步的本质就是真机，此环境做不到。**

---

## [#16 默认化部分] H2 — 默认安全视图 + compat 用户同意

**现状**：透明化警告 + opt-in `TUFF_PLUGIN_SECURE_VIEWS` 已做（commit `468e9b9b1`，`plugin-view-security-profile.ts`）。默认仍 compat（`nodeIntegration:on/contextIsolation:off`）for legacy 插件。

**实施步骤**：
1. `resolveCandidateProfile`（`plugin-view-security-profile.ts:113`）：默认返回 `trusted-plugin-view`；只有 legacy（`sdkapi<V260615` / `injections._.preload` / webview）**且用户已对该插件同意 compat** 时才降级 compat。
2. 安装/启用流程（`plugin-installer` / `plugin-module`）：插件需要 compat 时弹**显式同意 UI**（告知"此插件运行在不安全视图，能访问 Node"），存同意状态（每插件一条，可撤销）。
3. renderer：同意对话框组件 + 设置里的"已授予不安全视图"列表。

**验证**：逐 legacy 插件真机（同意流程 + 视图功能正常）。

**陷阱**：**默认 trusted 会破坏所有依赖 nodeIntegration 的 legacy 插件视图**——正是 C1-A 那类教训。同意流程有 bug = 插件视图集体白屏。真机必测。可先复用现有 `getPluginViewSecurityDiagnostics()` 的数据列出受影响插件。

---

## [#9] nexus batch-ingest ✅ 2026-07-16 已关闭

**交付**：`pushSyncItemsV1` 先验证完整请求，再通过 `json_each(?)` 有界批量预读 existing item/oplog。accepted candidates 按 512 KiB JSON chunks 生成 bulk oplog/item 语句；authoritative quota reconcile 与 session cursor update 一并进入单个 D1 `batch()` 事务。push route 不再在事务外二次累加 quota。

**协议保持**：`updated_at` 较新者胜；相同时间戳由字典序更大的 `device_id` 胜；existing device 为 null 时 candidate 正确让位。`(user_id, device_id, op_seq)` 仍是幂等键，重复 seq 只应用第一项；delete/tombstone 保留 stored payload size，但不计入 live quota。

**验证**：13/13 focused tests、scoped ESLint、Nexus typecheck 通过。Miniflare 1001 项写入与故障注入证明 oplog/item/quota/session 原子性。经明确批准的 `tuff-nexus-dev` 隔离表验证得到 `1001/1001/1001` 和失败后全 `0`，并验证 equal timestamp 下 null device 被替换、较高 existing device 拒绝较低 candidate；临时表清理后 prefix 查询为空，production D1 未访问。

**边界**：telemetry batch ingestion 仍是独立事项，不因 #9 关闭而自动完成。

---

## [#10] core-app usage 统计单写者 ✅ 2026-07-16 已关闭

**纠正后的根因**：旧 `summarizeUsageLogs()` 每次回放 retained logs；但 `usage_logs.source` 是 source type，不是 provider id。它主要生成 `application:<item>` / `file:<item>` 等 phantom rows，并在少数 id=type 情况直接放大原行，不是所有 provider 都命中“同一 PK”。

**交付**：

- `UsageStatsQueue` / direct fallback 成为 `item_usage_stats` 唯一增量 writer；周期服务保留 `item_time_stats` overwrite 与 retention cleanup。
- `0027_usage_stats_single_writer_repair.sql` 只删除存在 provider sibling 的明确 phantom row；只将超过 `usage_summary.click_count` 的 execute 计数向下修正。
- 不猜历史 provider id，不提升 under-count，不修改无 summary 行、search/cancel 或其它时间戳，不全量重置个性化。

**验证**：migration 重放幂等；3 个 focused files / 4 tests、scoped ESLint、CoreApp node typecheck、source-read-only migration readiness 与 execute→flush→maintenance 临时数据库 smoke 通过。

**遗留边界**：`item_time_stats` 的历史 source identity 同样受 source-type-only log 限制，需独立合同处理；本项不伪造 provider id。

---

## 运维项（非代码，未处理）

- `wrangler.toml` `[env.preview.vars]` 的 `AUTH_SECRET="change-me"` / `ADMIN_EMERGENCY_JWT_SECRET` / `ADMIN_CONTROL_PLANE_PEPPER` 移到 `wrangler secret put --env preview`。
- 生产设 `NUXT_INTELLIGENCE_ENCRYPT_KEY`（否则 intelligenceStore fail-closed）。
- 打包发布前对 `foreign_keys=ON` 再冒烟一次。

## 建议接手顺序

1. **#15 → #17**：先补 callback/AbortSignal，再做全官方插件真机回归并决定隔离默认化。
2. **#16 默认化**：最后处理 trusted view + compat 用户同意，避免在缺真机证据时破坏 legacy 插件。
