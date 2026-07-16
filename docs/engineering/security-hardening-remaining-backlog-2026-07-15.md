# 剩余安全加固 Backlog — 详细实施 Handoff — 2026-07-15

> 主 handoff（`security-hardening-handoff-2026-07-15.md`）的实施细节补充。
> 每一项都在本轮审计中定位过，这里给接手者可直接照做的现状 / 步骤 / 验证 / 陷阱。
> **两条共同硬约束**：① 多数项需要**能真机操作 app / 真实 D1** 的环境才能验证；② `core-app` 部分正被并行进程改动，接手前先合并它们的在途改动。

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

**陷阱**：`plugin-host-bridge.ts` 正被并行进程改（已加 generation 守卫 + 重启稳定窗口），先合并；callback registry 的清理时机；signal 的多次 abort 幂等。

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

## [#9] nexus batch-ingest — pushSyncItemsV1 分块 db.batch

**现状**：`syncStoreV1.ts` `pushSyncItemsV1`(:495-560+) 循环里每个 item：JS 验证 + `existing` 查询（读）+ 冲突检测 + 写，全是独立 awaited D1 语句。>1000 项超 Cloudflare Workers ~1000 子请求上限 → 中途抛错 + 已提交的部分半写（D1 无事务）。

**实施步骤**：
1. 循环前**一次批量预读**所有 item 的 existing：`SELECT ... WHERE user_id=?1 AND (namespace, key) IN (...)`（或分块 IN），建 `Map<namespace:key, existingRow>`。
2. 循环改为**纯内存**冲突检测（用预读 map，保持原 `updated_at >=` / `>` 语义**逐字不变**）。
3. 收集写语句成数组，**分块 `db.batch()`**（每块 ~50-100，兼顾子请求上限）。参考 `authStore.ts` mergeUsers 的 `db.batch` 用法（commit `2a69fa3b1`）。
4. telemetryStore 的批量入口同样处理。

**验证**：**真实 D1** + >1000 项 payload，断言冲突结果与原逐条实现完全一致 + 无半写。

**陷阱**：冲突检测语义（`updated_at` 比较、tombstone/deleted_at）必须与原实现字节级一致——改错=数据同步损坏，比现状更糟。

---

## [#10] core-app usage 双写去重（数据损坏）

**现状**：`usage-summary-service.ts` `summarizeUsageLogs`(:158-281) 每 24h 从 `usage_logs` 全窗口重聚合并**加性写** `item_usage_stats`（`executeCount + ...`）；实时 `usage-stats-queue.ts` `persistAggregates`(:326) 也加性写**同一表同一 PK**。→ 同一次点击被计 ~31× + 无 watermark 随时间膨胀，污染 frecency/推荐。

**需先做架构决策**（两个审计 agent 一致判断 queue 是权威 writer、summary 冗余）：
- **选项 A（推荐）**：让 summary **不再写** `item_usage_stats`（queue 独占）。前置：确认 `recordExecute`(`search-usage-service.ts`) 所有路径都入 queue。
- **选项 B**：summary 加 `last_summarized_at` watermark 只聚合增量 —— 但仍与 queue 双计，除非同时砍掉重复列，**不推荐单独用**。

**实施步骤（A）**：移除 `summarizeUsageLogs` 里 `updateFields.searchCount/executeCount` 的加性 `sql\`... + ...\`` 写；若 summary 还有别的产出则保留（本轮确认它**唯一产出**就是 item_usage_stats，故可能整个 summary 定时任务都可停）。

**验证**：运行 + 观察 frecency 不再膨胀 + 排名正确；**需一次性重置/重算已被膨胀污染的既有 item_usage_stats**。

**陷阱**：**此文件在 core-app，正被并行进程改**——先合并。清空/重算既有数据要谨慎（备份）。

---

## 运维项（非代码，未处理）

- `wrangler.toml` `[env.preview.vars]` 的 `AUTH_SECRET="change-me"` / `ADMIN_EMERGENCY_JWT_SECRET` / `ADMIN_CONTROL_PLANE_PEPPER` 移到 `wrangler secret put --env preview`。
- 生产设 `NUXT_INTELLIGENCE_ENCRYPT_KEY`（否则 intelligenceStore fail-closed）。
- 打包发布前对 `foreign_keys=ON` 再冒烟一次。

## 建议接手顺序

1. 先合并并行进程的 core-app 在途改动 + push 本轮 13 提交。
2. **#10 → #9**（数据正确性/损坏，纯逻辑 + D1 验证，不依赖真机 UI）。
3. **#15 → #17**（C1-B 事件式 → 全插件真机回归，默认开 C1-B）。
4. **#16 默认化**（H2 同意 UI，最需 renderer + 真机）。
