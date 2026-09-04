# Design — OTA 传输层错误分类修复

## 架构与边界

改动分三层，依赖方向单向向下，无循环：

```
packages/utils/network/core/errors.ts        ← 唯一事实源：错误类型 + 分类器 + 标记表
        ↑                    ↑                     ↑
 network-service.ts   release-fetch-service.ts   GithubUpdateProvider.ts
   (主进程·归一化)        (主进程·回退/重试)        (渲染层·重试)
                              ↑
                   network-log-noise.ts (复用标记表)
```

`packages/utils` 是已发布的 npm 包，主进程与渲染层均已依赖它（`errors.ts` 现有的 `isTimeoutLikeError` / `parseHttpStatusCode` 就是这样被两侧共用的）。新增分类器沿用同一模式，不引入新的依赖方向。

## 核心契约

### 1. 新增传输层错误类型（`packages/utils/network/core/errors.ts`）

```ts
NETWORK_ERROR_CODE.TRANSPORT_FAILED = 'NETWORK_TRANSPORT_FAILED'

class NetworkTransportError extends Error {
  readonly code = NETWORK_ERROR_CODE.TRANSPORT_FAILED
  readonly netErrorCode?: string     // 如 'ERR_CONNECTION_CLOSED'
  constructor(originalMessage: string, options?: { cause?: unknown })
}
```

**关键约束（R1）**：`message` 必须原样保留传入的原始文本（如 `net::ERR_CONNECTION_CLOSED`），**不得**改写成 `NETWORK_TRANSPORT_FAILED`。

理由：约 25 个 `NetworkService` 调用方中已有基于 message 的字符串判定（如 `network-log-noise.ts`、`catalog-remote.ts` 附近的降级逻辑）。保留原文 ⇒ 既有判定行为零变化，新代码通过 `code` / `instanceof` 获得类型化能力。这与 `NetworkHttpStatusError` 的做法一致（它同样把 `message` 与 `code` 设为同一个可解析的串）。

> 与 `NetworkTimeoutError` 的差异：后者会改写 message 为 `NETWORK_TIMEOUT after Nms`。这是既有行为，本次不动——现有正则正是靠它工作的，改了反而回归。

### 2. 分类器：类型优先，字符串兜底

```ts
export function isTransportFailureError(error: unknown): boolean
```

判定顺序：

1. `error instanceof NetworkTransportError` → `true`
2. `(error as { code?: string })?.code === NETWORK_ERROR_CODE.TRANSPORT_FAILED` → `true`
3. message 命中 `TRANSPORT_FAILURE_MARKERS` → `true`

第 3 步不是冗余（R2）：错误跨 IPC 时原型链丢失，渲染层只拿得到普通 `Error` 与 message 字符串（`transport/prelude.ts:127` 以 `error.message` 回传）。因此渲染层**必须**保留字符串兜底，类型判定在渲染层不可依赖。

### 3. 标记表：三方言合一，单一事实源

```ts
export const TRANSPORT_FAILURE_MARKERS = [
  // Chromium net stack (session.fetch，主进程)
  'net::err_', 'err_connection_closed', 'err_connection_reset',
  'err_connection_refused', 'err_connection_timed_out', 'err_connection_aborted',
  'err_name_not_resolved', 'err_internet_disconnected', 'err_network_changed',
  'err_address_unreachable', 'err_empty_response', 'err_failed',
  // TLS/证书（D1：与连接类同等对待）
  'err_ssl_protocol_error', 'err_cert_',
  // Chromium fetch（渲染层全局 fetch）
  'failed to fetch',
  // Node / undici
  'fetch failed', 'econnreset', 'econnrefused', 'econnaborted',
  'enotfound', 'etimedout', 'eai_again', 'epipe', 'socket hang up',
  'network socket disconnected',
]
```

`'net::err_'` 作为前缀兜底，覆盖未来新增的 Chromium 错误码；后续具名项用于表达意图与被测试锁定。

**不纳入该表**的项（保持语义纯净）：`NETWORK_TIMEOUT`（归 `isTimeoutLikeError`）、`NETWORK_HTTP_STATUS_*`（归 `parseHttpStatusCode`）、`cloudflare` / `rate limit` / `localhost:3200`（属日志降噪范畴，非传输失败）。

## 数据流：一次官方源故障

```
session.fetch → 抛 Error('net::ERR_CONNECTION_CLOSED')
  ↓ network-service.ts:1214 catch
projectNetworkRequestError(error, ctx)
  ├─ getAbortError()      → null，继续
  ├─ isTimeoutLikeError() → false（'TIMED_OUT' 不匹配 /timeout/），继续
  └─ isTransportFailureError() → true
       → new NetworkTransportError('net::ERR_CONNECTION_CLOSED', { cause: error })   ← 新增
  ↓
release-fetch-service.fetchOfficial() 抛出
  ↓ fetch():139 catch (nexusError)
isOfficialFallbackEligible(nexusError)
  ├─ status(error) → undefined（非 HTTP 错误）
  └─ isTransportFailureError() → true                                                ← 修复点
  ↓
fetchGitHub(channel, force, false) → 200 → 返回候选 release ✅
```

## 三处站点的改法

| 位置 | 现状 | 改后 |
|---|---|---|
| `release-fetch-service.ts:471` `isOfficialFallbackEligible` | status 判定 + 正则 | status 判定不变；正则 → `isTransportFailureError(error)` |
| `release-fetch-service.ts:592` `isRetryable` | status 判定 + 正则 | status 判定不变；正则 → `isTimeoutLikeError(error) \|\| isTransportFailureError(error)` |
| `GithubUpdateProvider.ts:540` `isRetryableError` | timeout + status + 正则 | 前两项不变；正则 → `isTransportFailureError(error)` |

`isRetryable` 需显式并上 `isTimeoutLikeError`：原正则含 `NETWORK_TIMEOUT|timeout|etimedout`，而新标记表已把 timeout 语义剥离出去，不并上会丢失既有的超时重试能力（R5 回归风险点）。

`isOfficialFallbackEligible` 同理需要并上 `isTimeoutLikeError` —— 否则 8s 超时这条**当前唯一可用**的回退路径会被本次改动打断。这是本设计最容易踩的回归，AC5 专门覆盖。

## 兼容性与迁移

- **无数据迁移、无配置变更、无 IPC 协议变更。** 纯代码内分类逻辑修正。
- **行为变化仅为扩大**："过去不回退/不重试"→"现在回退/重试"。不存在"过去成功现在失败"的路径，因此对现网是单向改善。
- **`network-log-noise.ts`（R6）**：其列表改为 `[...TRANSPORT_FAILURE_MARKERS, ...本地特有标记]`，本地特有项（`cloudflare`、`rate limit`、`just a moment`、`network_http_status_403/429`、`localhost:3200`、`aborterror`、`network guard cooldown`）保留。这样补齐了它当前缺失的 `err_connection_closed` / `err_connection_reset`，且两份清单从此同源。
- **`packages/utils` 是发布包**：新增导出为纯增量，不改动既有导出签名，外部插件开发者无感知。

## 权衡

**为什么不只加一个分类函数、不做 `NetworkService` 层归一化？**
只加函数可行且改动更小，但上层仍在字符串匹配 —— 传输实现一换（本仓已有两套：`session.fetch` 与全局 `fetch`）就会重演本 bug。在服务边界归一化是把"识别方言"收敛到一处的唯一做法，且 `projectNetworkRequestError` 已在为 timeout 做同样的事，属于沿用既有模式而非新造抽象。

**为什么不把 `ERR_CONNECTION_TIMED_OUT` 并入 `isTimeoutLikeError`？**
更符合直觉，但 `isTimeoutLikeError` 还被 `plugin/providers/utils.ts`、`packages/utils/network/request.ts` 等消费，扩大其语义会外溢到本任务范围外的调用方。归入 transport 即可，因为两类在回退/重试上待遇相同。

**为什么证书错误不 fail-closed？** 见 PRD D1。

## 回滚

改动集中在 4 个文件且相互独立，`git revert` 单个提交即可完整回滚，无残留状态。若仅需局部回退，可单独还原任一站点的判定表达式而不影响其余（分类器为纯函数、无副作用）。
