# 修复长寿命 CoreBox 的 index-committed 流变聋

## Goal

打开中的 CoreBox 结果列表（以及空查询推荐网格）在应用装卸、文件增删后要能持续自动刷新，不论页面已存活多久。

## Background

真机复现（2026-09-21）：新加载的 CoreBox 页面在装/卸探针应用或新建文件后 ≤2s 触发一次 `handleSearchImmediate` 并更新列表；同一份代码，随应用启动创建的 CoreBox 页面在存活 5–17 分钟后（三个实例各复现一次）对同样的事件不再刷新。

取证：
- 主进程确实在推送 `core-box:search:index-committed` 提交（包住渲染端原始 `…:stream:data:<id>` 的 channel 监听器能数到 2–4 次投递），但没有任何 500ms 刷新定时器、没有搜索。
- 同一页面上新建的 `transport.stream(...)` 订阅能正常收到提交。
- 渲染端该流的 MessagePort 句柄仍在、未收到 `close` 事件；但以其 portId 发起的探测流只能通过 channel 收到数据，说明主进程已不再向该 port 路由（记录已移除或未确认）。

机制（`packages/utils/transport/sdk/stream/client-runtime.ts`）：channel 侧 data/end/error 监听器开头 `if (cancelled || cleaned || portActive) return`；`portActive` 在第一条 port 消息到达时置 true，只有 port 的 `close`/`messageerror` 事件才会复位。主进程 `server-runtime.ts sendWithFallback` 对每条信封只走**一条**路径：port 记录缺失或未确认时改走 channel。于是 port 曾经活跃、之后主进程改走 channel 的流，渲染端把每条 channel 信封当「重复」丢弃，流从此变聋；`end`/`error` 经 channel 到达时同样被丢，流永远不会清理。

## Requirements

### R1 channel 投递不得因 port 曾活跃而被丢弃

- 协议保证每条信封只经一条路径投递，因此 channel 上到达的 data/end/error 一律交付；`portActive` 不再作为丢弃条件。
- port 路径继续监听，两条路径都交付；不引入重复（主进程从不双发）。

### R2 端到端

- 应用启动创建的 CoreBox 页面存活 ≥8 分钟后，新建文件 / 装卸应用仍触发列表刷新（主进程 `Executing precise query` 计数 +1，DOM 顶部更新）。

### R3 回归测试

- `startClientStream`：port 先投递一条（portActive 置位），随后主进程改走 channel 投递下一条与 `end`，两条都交付且流被清理。
- 现有「port 路径不重复交付」用例改为断言协议语义：channel 上到达的不同 chunk 会被交付。

## Acceptance Criteria

- [x] 新增回归测试修复前失败、修复后通过；`renderer-transport-stream`、`plugin-transport-stream`、`stream-client-error-cleanup`、`renderer-transport-port-lifecycle` 全部通过。
- [x] 真机：启动实例后等待 ≥8 分钟不重载页面，装卸探针应用、新建文件各一次，列表都自动刷新。
- [x] `channel-transport-contracts.md` 补「单路径投递、渲染端两路都交付」契约。

## Notes

- 主进程为何丢掉 port 记录（`removePort` 的具体触发）本任务只做取证记录，不在此修；不影响本修复的正确性。

## Verification record (2026-09-21)

- 回归：`renderer-transport-stream.test.ts` 新用例修复前 `channel end was dropped after port activity`，修复后通过；两处「bridge 重复」断言改为单路径交付语义；transport 相关 10 个测试文件 79/79 通过；eslint 通过。
- 真机：隔离栈重启后不重载页面，boot 页存活 8 分钟时依次做：新建文件 → 主进程 `Executing precise query` +1、列表顶部变为新文件；装探针应用 → +2、TuffProbeZeta 行出现；卸载 → +1、行消失。渲染端 console 出现一次 `Port fallback ... bridge_delivery_while_port_active`，证实主进程已改走 bridge 且现在被交付。
- 主进程丢弃 port 记录的触发点未钉死（`removePort` 只对非正常原因打印；本次无 warn），记为父任务 Notes。
