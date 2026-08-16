# 主进程轮询与外部调用超时兜底优化

## Goal

消除 CoreBox「输入关键词很久才出结果」的主因：主进程事件循环被搜索之外的无界轮询任务与失败重试风暴阻塞。目标是给所有会阻塞主线程的周期任务和外部调用补上超时兜底，让搜索路径不再被无关任务拖住。

## 问题证据

来源：`~/Library/Application Support/@talex-touch/core-app/tuff-dev/logs/D.2026-08-16.log`（2026-08-16 单日）

- 事件循环延迟 299 个采样：p50 = 515ms，**p90 = 9693ms，max = 25300ms**
- 应用自身告警 7 次 `[CoreBox] Auto-enabled search diagnostics burst after severe event-loop lag`，lagMs 2344 → 14844
- 大延迟报告中 `contexts=[]`，即卡顿期间没有任何 `Search.*` perf context 打开 → 阻塞源不在搜索引擎内部
- `suspectedCause=polling_queue_backlog` 出现 15 次，`unattributed_main_thread_block` 25 次

具体元凶：

| 任务 | 实测 | 根因 |
|---|---|---|
| `temp-file.cleanup` | 单次 23s，max 67.6s，serial lane 后方排队 12 个任务 | 注册时只传 `{interval, unit}`，落到默认 serial lane（并发 1）且无 `timeoutMs` |
| `startup-analytics.outbox.flush` | 单次 46s，max 598.9s | 每请求 12s 超时，但整轮 flush 串行遍历整个 outbox 且无总预算；离线时 N 条 × 12s |
| `sentry.nexus.flush` | max 638.7s | 同上 |
| `common-channel.battery` | max 31.7s | 无 `timeoutMs` |
| `clipboard.active-app.refresh` | 每 1.5s 一跳，今日 18385 次，其中 **278 次失败** | `osascript` 1.5s 超时被 SIGTERM，而超时分支既不退避也不做负缓存 |

全仓 48 个 `pollingService.register` 站点中，**37 个未传 `timeoutMs`**。

## Requirements

1. `PollingService` 在调用方未显式指定时套用默认超时上限，一次性覆盖全部未配置站点；同时提供明确的「不设超时」退出方式。
2. 已知长跑任务给出显式配置（更大的超时或显式退出），并把 `temp-file.cleanup` 移出 serial lane。
3. 网络类 flush（startup-analytics、sentry nexus）增加整轮时间预算，网络不可用时快速让出，不再逐条耗尽超时。
4. `active-app` 的 macOS 解析超时分支补退避与负缓存，并对失败日志做节流。
5. 搜索路径上对 `appTaskGate.waitForIdle()` 的无限等待改为有界等待。
6. CoreBox fast 层并发与 fast provider 数量匹配。

## Constraints

- `PollingService` 位于共享包 `@talex-touch/utils`，默认值变更影响全部调用方；必须保证正常时长的任务不受影响，且超时只释放 lane 槽位、不改变「不取消回调」的既有语义。
- 不改变任何任务的业务行为与调度周期，只加时间边界。
- 遵守 CoreApp 包内 lint 配置（与根配置尾逗号等规则相反），不整文件 `--fix`。

## Acceptance Criteria

- [ ] `PollingService.register` 未传 `timeoutMs` 时得到默认上限；`timeoutMs: null` 表示显式无超时；现有传 `0` 被当作 1ms 的坑被修复
- [ ] `temp-file.cleanup` 不再运行于 serial lane，且有显式超时
- [ ] `startup-analytics` / `sentry nexus` 的整轮 flush 有总时间预算，且在网络失败后不再继续逐条重试本轮剩余项
- [ ] `active-app` macOS 解析超时后进入退避窗口，窗口内不再 spawn `osascript`；失败结果在 TTL 内被负缓存
- [ ] `clipboard.checkClipboard` 中的 `waitForIdle()` 带超时，索引任务运行时搜索不会无限期挂起
- [ ] 新增/更新的单测覆盖：默认超时生效、显式 `null` 退出、active-app 超时退避、flush 总预算
- [ ] `pnpm lint`、core-app `npm run typecheck`、相关 vitest 全绿
