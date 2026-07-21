# 统一系统错误上报与数据库诊断 — 详细实施规划

## 0. 当前状态与执行原则

### 当前状态

- Trellis 任务：`.trellis/tasks/07-20-unify-operational-error-reporting/`。
- Wave A–D 的实现已完成；Wave E 的真实锁竞争、恢复、聚焦测试、typecheck、lint、生产构建与 Electron smoke 已于 2026-07-21 完成。
- 最终实现包含 shared contract、main/renderer facade、Sentry/Nexus adapters、SQLite observer/health、文件重建安全闭环、App Provider 调度过渡层和 P0/P1 系统边界接入。
- 验收证据见本文件第 11 节和 `report.md` 第 7 节；R9 保持 open 并列明后续单写者迁移项。

### 不变量

1. 业务模块只依赖 operational reporter，不直接依赖 Sentry SDK。
2. 本地日志保留诊断能力；Sentry 和 Nexus 都是 best-effort sink，失败不得改变业务结果。
3. 原始 Error/cause 只留在进程内和本地日志；transport/UI/Nexus 不接收 SQL、params、绝对路径、搜索词、剪贴板或 payload。
4. Sentry 接收脱敏异常明细；Nexus 只接收时间窗聚合健康计数。
5. SQLite retry 是恢复机制，不是写入所有权模型；共享表最终必须收敛到单写者。
6. writer admission 暂停窗口内不得调用任何需要重新获取 writer admission 的 API，避免自锁。
7. expected failure（取消、离线、权限拒绝、校验失败）不是 Sentry exception。

## 1. 工作流总览

```text
Wave A — 上报基础设施
  A0 当前 scaffold 体检
  A1 shared contract
  A2 OperationalErrorService
  A3 Sentry/Nexus sink adapter

Wave B — 首个端到端闭环
  B1 SQLite retry exhaustion observer
  B2 Database health aggregation
  B3 File rebuild 安全错误契约
  B4 writer quiescence barrier

Wave C — 写入治理
  C1 App Provider 遗留直写收口
  C2 DB mutation inventory 与 owner 表
  C3 单写者 typed port 后续设计

Wave D — 系统接入
  D1 bootstrap / transport / worker P0
  D2 renderer / update / sync / lifecycle P1
  D3 plugin-host 边界

Wave E — 真实验证与收尾
  E1 正常路径 smoke
  E2 持锁故障验收
  E3 生产构建与 Electron smoke
  E4 规范、审计 backlog 与任务证据
```

依赖关系：A 是所有接入的前置；B 依赖 A；C1 可在 B3/B4 后实施；D 可以在 B 完成后分批接入；E 按 A→B→C→D 的已完成范围验证。

---

## 2. Wave A — 上报基础设施

### A0. 当前 scaffold 体检

**目标**：先确认当前未验证代码是否符合 repo 约束，再继续扩展。

**检查文件**：

- `packages/utils/types/operational-error.ts`
- `packages/utils/types/index.ts`
- `apps/core-app/src/main/modules/observability/operational-error-service.ts`
- `apps/core-app/src/main/modules/observability/index.ts`
- `apps/core-app/src/main/modules/sentry/sentry-service.ts`
- `apps/core-app/src/main/modules/sentry/telemetry-sanitizer.ts`

**检查项**：

1. import graph 不得形成 `precore -> observability -> sentry -> precore` 或 `database -> observability -> database` 循环。
2. shared contract 不得引入 Electron、Node-only runtime 或 Sentry 类型。
3. service 的 buffer、dedupe map 必须有硬上限和生命周期清理。
4. sink Promise rejection 不得递归调用 reporter。
5. fingerprint 只能由稳定枚举/identifier 构成，不能由 message/path 生成。
6. `publicMessage` 不得回退到原始 `error.message`。
7. 当前 Sentry 配置关闭时不能继续积累待上传 detail event。

**完成门**：scaffold 经 scoped diagnostics、lint 和 node typecheck 后才进入 A1/A2；失败则修正 scaffold，不扩展调用点。

### A1. 固化 shared contract

**Owned files**：

- `packages/utils/types/operational-error.ts`
- `packages/utils/types/index.ts`
- 必要时 `packages/utils/index.ts`

**交付**：

1. `OperationalErrorInput`
   - `domain`、`operation`、`error`
   - 可选稳定 `code`
   - `severity`、`retryable`、`userImpact`
   - primitive-only context
   - caller 提供的安全 `publicMessage`
   - `dedupeWindowMs`
2. `OperationalErrorReport`
   - `id`、稳定分类字段、`occurredAt`、`occurrenceCount`
   - 脱敏 `publicMessage`
   - allowlisted context
3. 明确 report 是可序列化 descriptor；原始 `Error` 不属于该类型。
4. 对 identifier/code/context 做运行时规范化，不能只依赖 TypeScript。

**完成门**：main、renderer、worker 可 import type；不会把 Node-only implementation 打入 renderer bundle。

### A2. 完成 `OperationalErrorService`

**Owned files**：

- `apps/core-app/src/main/modules/observability/operational-error-service.ts`
- `apps/core-app/src/main/modules/observability/index.ts`

**职责**：

1. 有界遍历 `cause/original/error/AggregateError.errors`。
2. 识别 `code/rawCode` 与 SQLite busy family。
3. 生成稳定 code、retryable、impact 和 public message。
4. 敏感 context key 拒绝；字符串 context 仅接受稳定 identifier/枚举。
5. 本地首次错误记录完整 Error；重复错误记录计数汇总。
6. detail sink 与 aggregate sink 分开注册、替换和释放。
7. Sentry 未就绪前只缓冲 error/fatal；buffer 满时丢最旧项并记录 dropped count。
8. 相同 `domain + operation + code` 在时间窗内最多一次 detail delivery。
9. 提供显式 `clearPendingDetails()` / `dispose()`，支持 Sentry 配置关闭和测试隔离。

**禁止**：

- import Sentry、DatabaseModule、FileProvider 或 renderer module。
- 使用动态 error message 作为 code/fingerprint。
- sink 失败后再次 `report()`。

### A3. Sentry 与 Nexus adapter

**Owned files**：

- `apps/core-app/src/main/modules/sentry/sentry-service.ts`
- `apps/core-app/src/main/modules/sentry/telemetry-sanitizer.ts`

**Sentry detail sink**：

1. Sentry 成功初始化后绑定，shutdown/config disabled 时解除。
2. fingerprint：`operational / domain / operation / code`。
3. tags：domain、operation、code、retryable、userImpact。
4. context：reportId、occurrenceCount 和 allowlisted numeric/enum fields。
5. exception value、filename、abs_path、source context 继续脱敏。
6. config disabled 时清空 pending detail，重新启用不得补发禁用期间事件。

**Nexus aggregate sink**：

1. 只发 `kind=operational-error`、分类、count 和安全健康数值。
2. sanitizer 为 error event 单独维护 allowlist，不能复用过宽 generic metadata。
3. 不发 Error、message、stack、SQL、路径或 payload。
4. aggregate sink 失败只走现有 telemetry outbox/noise policy，不反馈到业务 reporter。

**完成门**：同一 report 在 detail sink 至多一次；关闭 Sentry 后本地报告继续工作且业务返回不变。

---

## 3. Wave B — SQLite 与文件重建端到端闭环

### B1. SQLite retry exhaustion observer

**Owned files**：

- `apps/core-app/src/main/db/sqlite-retry.ts`
- `apps/core-app/src/main/modules/database/index.ts`

**新增低层事件**：

```ts
interface SqliteRetryExhaustedEvent {
  label: string;
  attempts: number;
  elapsedMs: number;
  code?: string;
  rawCode?: number;
  error: unknown;
}
```

**实现规则**：

1. `sqlite-retry.ts` 只暴露 listener registration，不 import observability。
2. 仅在 SQLite busy retries 真正耗尽时触发一次；成功恢复只累计 retry metric，不发 detail exception。
3. DatabaseModule 负责注册 listener，将低层事件报告为：
   - domain=`database`
   - operation=稳定 label
   - code=`DATABASE_BUSY`
   - severity=`warning`
   - retryable=`true`
   - userImpact=`none/degraded`
4. 低层事件默认只进入 local + aggregate；具体业务失败由业务边界升级为 detail Sentry event，避免双报。
5. listener 在 DatabaseModule destroy 时解除，防止测试和热重载泄漏。

**完成门**：scheduler 内与直接 `withSqliteRetry` 调用都能被观察；一次耗尽只产生一次低层事件。

### B2. Database health 聚合

**Owned files**：

- `apps/core-app/src/main/modules/database/index.ts`
- `apps/core-app/src/main/db/db-write-scheduler.ts`（仅补只读 snapshot 时）
- `apps/core-app/src/main/modules/box-tool/search-engine/search-index-writer.ts`（复用 status，不新增第二状态源）

**快照字段**：

- `busyRetryDelta`（窗口增量，不是进程累计值）
- `schedulerQueueDepth/Peak`
- `schedulerBusyFailureDelta`
- `writerPending/active/admissionPaused`
- `walSizeBytes/Peak`
- `openFdCount`

**阈值策略**：

1. 正常窗口只写 debug/info，不上报。
2. busy delta、queue、WAL 或 FD 任一越阈值时生成一个聚合 warning。
3. 连续窗口使用相同 fingerprint 聚合；恢复窗口记录 recovery event，不发 detail exception。
4. 阈值为命名常量，并在 report context 记录触发维度，不记录数据库路径。

**完成门**：空闲数据库不产生 remote noise；可控 contention 能产生单个窗口聚合事件。

### B3. 文件重建安全错误契约

**Owned files**：

- `packages/utils/transport/events/types/file-index.ts`
- `packages/utils/search/indexing-source.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/indexing-runtime.ts`
- `apps/core-app/src/main/channel/common.ts`
- `apps/core-app/src/renderer/src/views/base/settings/SettingFileIndex.vue`
- `apps/core-app/src/renderer/src/modules/lang/{zh-CN,en-US}.json`

**契约扩展**：

```ts
interface SafeOperationalFailure {
  error?: string; // 暂时兼容；只能是脱敏 public message
  errorCode?: string;
  retryable?: boolean;
  reportId?: string;
}
```

**行为**：

1. IndexingRuntime 在仍持有原始 Error 的 catch 边界调用 reporter，再转换成 safe reset result。
2. FileProvider 对数据库 busy 覆盖业务 code=`FILE_INDEX_DATABASE_BUSY`。
3. CommonChannel 不再次用原始 `error.message` 覆盖 safe result。
4. Renderer 按 `errorCode` 选择本地化提示；unknown code 使用通用失败提示。
5. toast 可展示短 reportId 供日志关联，但不展示 SQL、params、路径或 stack。
6. battery-low、initializing、missing-context 保持 expected business result，不进 Sentry。

**完成门**：截图所示完整 SQL/路径无法再通过任何 rebuild 分支进入 UI。

### B4. Writer quiescence barrier

**Owned files**：

- `apps/core-app/src/main/modules/box-tool/search-engine/indexing-runtime.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/search-index-writer.ts`（优先复用现有 API）
- `apps/core-app/src/main/modules/box-tool/addon/files/services/file-provider-runtime-reset-service.ts`

**正确顺序**：

```text
source mutation gate acquired
  -> pause writer admission
  -> wait activeAdmissions=0 and pending=0
  -> source.resetIndex(clearSearchIndex=false)
       -> interactive scheduler DELETE scan_progress
  -> finally resume writer admission
  -> rebuildSourceFromSnapshot / clearSource through writer
  -> record reset result
```

**关键约束**：

1. `rebuildSourceFromSnapshot()` 必须在 pause callback 外执行，否则 `clearSource()` 等待自己的 admission gate。
2. pause/drain timeout 返回稳定 `FILE_INDEX_WRITER_DRAIN_TIMEOUT`，retryable=true。
3. `file-index.manual-rebuild.scan-progress-reset` 显式：
   - priority=`interactive`
   - dropPolicy=`none`
   - 不受 background circuit breaker 拒绝
4. 所有异常和取消路径都在 finally 恢复 admission。
5. 不扩大暂停窗口到文件扫描、FTS 重建或 renderer 通知阶段。

**完成门**：重建前 pending/active 都为 0；失败后 writer 可继续接受普通索引任务。

---

## 4. Wave C — 数据库写入治理

### C1. App Provider 立即稳定化

**Owned files**：

- `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts`
- 必要时新增同目录 `app-provider-persistence-service.ts`

**当前问题**：

- `runAdaptiveTaskQueue()` 中多个 task 并发 `db.insert/update`。
- file row 与 extensions 分开写，扩大锁窗口和半完成状态风险。
- 私有 `isSqliteBusyError/createRetrier` 与共享 retry 策略漂移。

**本轮改造**：

1. 删除私有 busy classifier/retrier，统一复用 `withSqliteRetry`。
2. 建立单一 App persistence entry，所有 mutation 走 `dbWriteScheduler.schedule()`。
3. add/update 时将 file row + extensions 放在同一事务或同一 worker command。
4. delete 时 file row + extensions 原子提交，保持 grace-period 语义。
5. 普通 startup/full-sync 使用 background priority；用户触发的 rebuild 使用 interactive priority。
6. adaptive queue 可以并发做扫描/转换，但不能并发提交数据库 mutation；提交阶段按 batch 串行。
7. 保持 managed entries、display-name quality、icon/alias extension 与 reconcile delta 契约。

**完成门**：App Provider 启动扫描不再从 adaptive task 中并发直写共享表；私有 retry 实现归零。

### C2. DB mutation owner inventory

**产物**：更新 `report.md`，为每个写域建立 owner 表：

| Domain     | Tables                             | Current writer       | Target writer       | Scheduler policy    | Follow-up            |
| ---------- | ---------------------------------- | -------------------- | ------------------- | ------------------- | -------------------- |
| file-index | files/file_extensions/keywords/FTS | worker + legacy main | search-index worker | critical/background | P0/P2                |
| config     | config                             | Storage/App helpers  | Storage repository  | interactive         | P1                   |
| analytics  | queue/snapshots                    | aux + compat mirror  | aux DB              | best_effort         | P2 mirror retirement |
| usage      | logs/summary/stats                 | queue + fallback     | usage queue         | background          | audit                |
| clipboard  | clipboard tables                   | clipboard service    | scheduler owner     | interactive         | audit                |

**规则**：

1. policy-free `db/utils.ts` write helper 标记 owner 或删除；读 helper 与写 port 分离。
2. 新写入口必须声明 label/priority/drop policy/transaction boundary。
3. 同一表不得同时有 worker writer 和无调度 main writer。
4. 本轮只迁移已证实参与事故的 P0 路径；其余形成明确后续项，不能伪称全部解决。

### C3. 单写者 typed persistence port 后续

这是结构性后续，不与 C1 强行合并：

1. 扩展 SearchIndexWorker command，支持 app display-name、quality 和 extensions 原子 upsert。
2. App Provider 只生成 typed mutation，不直接接触 `files/file_extensions`。
3. worker transaction 同时维护 files、extensions、keyword mappings、search_index/FTS 投影。
4. 删除 `db/utils.ts` 对 file-domain 的 main-thread mutation 能力。
5. 该阶段需要独立 migration/rollback 设计；C1 是过渡稳定化，不冒充最终单写者完成。

---

## 5. Wave D — 全系统上报接入

### D1. P0 边界

| Boundary                      | File                                         | Action                                     | Default severity |
| ----------------------------- | -------------------------------------------- | ------------------------------------------ | ---------------- |
| bootstrap unhandled rejection | `core/precore.ts`                            | reporter；保留原 shutdown policy           | error/fatal      |
| CommonChannel safe handler    | `utils/safe-handler.ts`, `channel/common.ts` | stable operation + expected-error opt-out  | error            |
| search worker remote error    | worker client/runtime catch                  | 在 main 持有 reconstructed cause 时 report | error            |
| file rebuild                  | FileProvider/IndexingRuntime                 | safe result + detail report                | error            |
| DB retry exhaustion           | sqlite retry observer                        | aggregate warning；业务边界升级 detail     | warning          |

**expected error 分类**：permission denied、user cancel、abort、not-found validation、offline/retry-later 默认不进 detail sink。

### D2. P1 边界

1. **Renderer facade**
   - 新建 renderer-local reporter，复用 shared descriptor。
   - 只报告 renderer-owned exception；main 已报告的 safe failure 不二次报告。
2. **Update**
   - message store 继续服务用户可见历史。
   - check/download/install unknown failures接 reporter；网络离线按 expected/degraded 处理。
3. **Sync**
   - 保留 paused/error runtime status。
   - auth/permission/offline 不报 detail；数据一致性或不可恢复 apply failure 报 error/data-risk。
4. **Module lifecycle**
   - 失败保留 Nexus aggregate；原始 lifecycle Error 经 reporter 进 Sentry。
5. **render-process-gone**
   - development reload/killed 不报。
   - packaged crash/oom/abnormal-exit 报 fatal/degraded，并保留 window role/code，不带 URL。
6. **App scan reporter**
   - 删除无 handler 的全局可变 reporter，或改为显式 facade adapter。
   - path 不进 context；仅 platform/source/stage/code。

### D3. Plugin-host 边界

1. trusted plugin-host runtime exception 在 host 边界报告，plugin payload 不上传。
2. context 只保留稳定 plugin id、capability、phase 和错误 code。
3. untrusted plugin 主动调用“report error”不能直接生成 Sentry exception；必须经过 host 分类/限流。
4. plugin session log 仍是本地诊断来源，不批量上传。

---

## 6. Wave E — 验证策略

### E1. 先证明正常路径

在增加回归覆盖前，先运行真实路径 smoke：

1. CoreApp 启动，Sentry enabled/disabled 两种配置均可初始化。
2. 正常文件索引重建能返回 started，随后进入 scan/progress。
3. writer status 在重建前后均无永久 admission pause。
4. App Provider startup/full-sync/reconcile 正常完成。
5. renderer toast 只使用本地化安全文本。

### E2. 可控 SQLite 写锁验收

**隔离要求**：使用复制数据库或临时 profile，不直接修改生产库。

**场景**：

1. 第二 connection 执行 `BEGIN IMMEDIATE` 并保持锁。
2. 隔离 Electron 触发 file rebuild。
3. 观察所有 retry 耗尽。
4. 断言：
   - safe result code=`FILE_INDEX_DATABASE_BUSY`
   - retryable=true
   - UI 不含 SQL/params/绝对路径
   - local log 有 reportId 和完整 cause
   - detail sink 同 fingerprint 只收到一次
   - aggregate sink 有 busy count/健康数值
   - writer admission 已恢复
5. 释放锁并再次重建。
6. 断言 scan_progress 清理、扫描启动并正常结束。

### E3. 高频与失败隔离

1. 连续触发相同 busy failure：Sentry detail 去重，local/aggregate count 累加。
2. detail sink 抛错/Promise reject：业务结果不变，无递归报告。
3. Sentry 初始化前报告：有界缓冲；初始化后一次冲刷。
4. Sentry 禁用期间报告：不缓冲待补发 detail。
5. unknown DB I/O error：retryable=false，独立 fingerprint。
6. expected abort/cancel/offline：无 detail exception。

### E4. 工程验证

- Shared/CoreApp scoped diagnostics。
- 受影响文件 scoped ESLint。
- `corepack pnpm -C "apps/core-app" run typecheck:node`
- `corepack pnpm -C "apps/core-app" run typecheck:web`
- `corepack pnpm -C "apps/core-app" run build:vite`
- 聚焦现有测试；正常 smoke 通过后，再为新增 observable contract 补高信号回归。
- production Electron 隔离 profile smoke；不能用 mock 结果替代真实锁竞争证据。

---

## 7. 分阶段完成标准

### Gate A — Reporter 可独立使用

- contract、service、Sentry/Nexus adapters 通过类型与隐私检查。
- sink disable/failure 不影响业务。
- 无循环依赖、无无界缓存、无动态 fingerprint。

### Gate B — 文件重建闭环

- busy failure 变成稳定可重试结果。
- UI 无 SQL/路径泄露。
- writer barrier 无死锁、无 admission 泄漏。
- 释放锁后可恢复成功。

### Gate C — 已确认写竞争收口

- App Provider 不再并发主线程提交 file-domain writes。
- shared scheduler/retry 替代私有 busy retrier。
- report owner matrix 更新并区分“已修”与“后续单写者迁移”。

### Gate D — 系统 P0/P1 接入

- 每个边界有 domain/operation/code/severity/expected policy。
- 同一 failure 不被 main、renderer、worker 重复上报。
- plugin/user payload 无法进入 remote sinks。

### Gate E — 可交付

- typecheck、lint、build、真实 Electron smoke 全部有当前工作区证据。
- `prd.md` AC 逐项有对应证据。
- 搜索/跨平台审计 R9 更新为准确状态；未完成的 P2 不得勾成已修。

---

## 8. 风险与防护

| 风险                    | 触发方式                                 | 防护                                                                |
| ----------------------- | ---------------------------------------- | ------------------------------------------------------------------- |
| 启动循环依赖            | reporter import Sentry/precore/database  | reporter 保持 sink-injected、dependency-light                       |
| writer 自锁             | paused callback 调用 clearSource/rebuild | pause 只包 local reset；writer rebuild 在恢复后执行                 |
| Sentry 风暴             | 每次 retry/catch 都发 detail             | 低层只 aggregate；业务边界 detail；稳定 fingerprint + window dedupe |
| 隐私泄露                | raw message/context 跨 transport         | public descriptor、敏感 key denylist、Sentry sanitizer allowlist    |
| 丢失诊断                | 过度 redaction                           | 本地日志保存完整 Error + reportId；远端保存稳定 code/tags           |
| expected error 噪声     | offline/cancel/permission 被当异常       | expected classifier 和 boundary policy                              |
| App 数据半写            | file row 与 extensions 分开失败          | 同一 transaction/worker command                                     |
| 伪单写者                | 只加 scheduler 但仍多连接写              | C1 标记过渡；C3 明确最终 typed worker port                          |
| 测试通过但 runtime 失败 | mock 无真实 SQLite lock                  | 隔离 Electron + 第二 connection `BEGIN IMMEDIATE` 验收              |

## 9. 最终交付物

1. Shared operational error contract。
2. Main OperationalErrorService 与 renderer facade。
3. Sentry detail/Nexus aggregate adapters 和隐私 sanitizer。
4. SQLite retry exhaustion observer 与 database health aggregation。
5. 安全 FileIndex rebuild result、writer barrier、脱敏 UI。
6. App Provider 统一调度过渡层。
7. 更新后的 `report.md`：完整 owner/migration 状态矩阵。
8. 真实持锁失败与恢复成功的验证证据。
9. R9 backlog 和项目 spec 的可执行契约更新。

## 10. 明确后续项

以下内容不应塞进本轮伪装完成，但必须从报告中持续追踪：

- App Provider 完全迁入 search-index worker typed persistence port。
- 删除 `db/utils.ts` file-domain policy-free write API。
- libSQL client/session owner registry 与短生命周期连接清理。
- aux compatibility mirror 退场。
- P2 plugin runtime/reporting 迁移。
- Nexus Web 独立 observability 审计。

## 11. Acceptance evidence — 2026-07-21

| Gate                   | Evidence                                                                                                                                                                             | Result                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| A — Reporter           | 统一 service 测试覆盖 cause/code、脱敏、bounded buffer、dedupe、sink reject/disable；本地 logger cause smoke                                                                         | ✅                                                   |
| B — File rebuild       | 最终生产包在第二连接 `BEGIN IMMEDIATE` 下返回 `FILE_INDEX_DATABASE_BUSY`、`retryable=true`；transport/UI leak checks 均为 false；本地日志同 reportId 保留 nested `SQLITE_BUSY` cause | ✅                                                   |
| B — Writer recovery    | barrier 测试断言 pause/drain/finally resume；释放真实写锁后 reset 与 scan 完成，task gate running/blocked 均为 0                                                                     | ✅                                                   |
| C — App writes         | App Provider 51 tests；add/update/delete/backfill/mdls/rebuild 使用共享 scheduler/retry，生产 adapter 支持 transaction                                                               | ✅ transition complete; final worker port remains R9 |
| D — P0/P1              | Bootstrap、transport、worker、renderer、Update、Sync、module lifecycle、process-gone、App scanner owner matrix 已更新                                                                | ✅                                                   |
| E — Focused regression | Update action 3/3；最终聚焦 21 files / 240 tests                                                                                                                                     | ✅                                                   |
| E — Static/build       | scoped Prettier、scoped ESLint、node/web typecheck、production Vite build、`electron-builder --dir`                                                                                  | ✅                                                   |
| E — Runtime            | isolated packaged Electron normal rebuild、real lock failure、localized UI、local full-cause log、post-unlock recovery                                                               | ✅                                                   |

Real-failure correlation id: `0de62e37-9dee-44ca-b2f7-540b27792ac3`。详细时间戳、result 和 log location 见 `report.md`。
