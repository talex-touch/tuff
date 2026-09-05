# Implement — OTA 传输层错误分类修复

## 前置

分支：当前在 `release/beta20-clean`。本改动是 bugfix，**不要**直接提交到发布候选分支——先确认与用户的分支策略（见"待确认"）。

## 有序清单

### 步骤 1 — utils 层：错误类型 + 分类器（无外部依赖，先做）

文件：`packages/utils/network/core/errors.ts`

1. 在 `NETWORK_ERROR_CODE` 增加 `TRANSPORT_FAILED: 'NETWORK_TRANSPORT_FAILED'`。
2. 新增 `TRANSPORT_FAILURE_MARKERS`（内容见 design.md，全部小写）并导出。
3. 新增 `NetworkTransportError`：`message` 原样保留传入文本，`code` 固定为 `TRANSPORT_FAILED`，解析并暴露 `netErrorCode`（从 `net::ERR_XXX` 提取 `ERR_XXX`，无则 `undefined`），`cause` 透传。
4. 新增 `isTransportFailureError(error)`：`instanceof` → `code` 字段 → message 小写后命中标记表，三级判定。

**约束提醒**：不要修改 `isTimeoutLikeError`（会外溢到 `plugin/providers/utils.ts`、`packages/utils/network/request.ts` 等范围外调用方）。

新建 `packages/utils/__tests__/network-transport-error.test.ts`（该包测试统一放 `__tests__/`，参照既有 `network-http-status-error.test.ts`；`network/core/` 下不放测试），覆盖 **AC1**：
- 三方言各自的代表串：`net::ERR_CONNECTION_CLOSED` / `Failed to fetch` / `fetch failed`
- 现有正则的两处漏网：`net::ERR_CONNECTION_TIMED_OUT`、`Failed to fetch`
- D1 相关：`net::ERR_SSL_PROTOCOL_ERROR`、`net::ERR_CERT_AUTHORITY_INVALID`
- **负例**（防止过度匹配）：`NETWORK_HTTP_STATUS_500`、`NETWORK_TIMEOUT after 8000ms`、`NETWORK_ABORTED` 均须返回 `false`
- 原型链丢失场景：`new Error('net::ERR_CONNECTION_CLOSED')`（纯 Error）须返回 `true`
- `NetworkTransportError` 的 message 与传入原文严格相等（**AC5** 兼容性约束）

验证：`pnpm -F @talex-touch/utils test`

### 步骤 2 — 主进程：服务边界归一化

文件：`apps/core-app/src/main/modules/network/network-service.ts`

在 `projectNetworkRequestError`（`:424`）的 timeout 分支之后、`return error` 之前插入：

```ts
if (isTransportFailureError(error)) {
  return new NetworkTransportError(error instanceof Error ? error.message : String(error), {
    cause: error
  })
}
```

顺序必须是 abort → timeout → transport，不可调换（abort 与 timeout 有更强的语义，先匹配）。

验证：`npx vitest run src/main/modules/network`

### 步骤 3 — 主进程：回退与重试判定（核心修复）

文件：`apps/core-app/src/main/modules/update/services/release-fetch-service.ts`

1. `isOfficialFallbackEligible`（`:471`）：保留 status 分支；将 `:478` 正则替换为
   `isTimeoutLikeError(error) || isTransportFailureError(error)`
2. `isRetryable`（`:592`）：保留 status 分支；将 `:598` 正则替换为
   `isTimeoutLikeError(error) || isTransportFailureError(error)`

> ⚠️ **最高回归风险点**：两处都必须并上 `isTimeoutLikeError`。原正则含 `NETWORK_TIMEOUT`，而新标记表刻意不含 timeout 语义。漏并 = 打断当前**唯一**还能工作的回退路径（8s 超时），会把一个 bug 换成另一个。

在 `release-fetch-service.test.ts` 追加 **AC2 / AC3 / AC5**：
- 官方源抛 `net::ERR_CONNECTION_CLOSED` → 断言走到 `fetchGitHub` 并返回 GitHub 结果
- 官方源抛 `NetworkTimeoutError` → 断言仍然回退（锁死上述回归点）
- 两源皆抛传输错误 + 有 stale 缓存 → 命中 stale 分支
- 两源皆抛传输错误 + 无 stale → 上抛 GitHub 错误
- 既有 429 / 5xx / 403 用例行为不变

验证：`npx vitest run src/main/modules/update`（须含既有 108 用例全绿）

### 步骤 4 — 渲染层：重试判定

文件：`apps/core-app/src/renderer/src/modules/update/GithubUpdateProvider.ts`

`isRetryableError`（`:540` 附近）：保留 `isRequestTimeout` 与 status 分支，正则替换为 `isTransportFailureError(error)`。

在 `GithubUpdateProvider.test.ts` 追加 **AC4**：`net::ERR_*` 与纯 `Error`（无原型链）两种形态均返回 `true`。

验证：`npx vitest run src/renderer/src/modules/update`

### 步骤 5 — 日志降噪表同源（R6）

文件：`apps/core-app/src/main/utils/network-log-noise.ts`

`DOWNGRADED_REMOTE_FAILURE_MARKERS` 改为 `[...TRANSPORT_FAILURE_MARKERS, ...本地特有项]`。本地特有项须**全部保留**：`localhost:3200`、`network timeout`、`network_timeout`、`request timeout`、`timed out`、`aborterror`、`network guard cooldown`、`network_http_status_403`、`network_http_status_429`、`rate limit`、`ratelimit`、`just a moment`、`cloudflare`、`challenge-platform`、`cf_chl`、`enable javascript and cookies to continue`。

若该文件已有测试则跑，无则不新增（纯日志路径，非行为关键）。

验证：`npx vitest run src/main/utils/network-log-noise.test.ts`（该测试已存在，须保持全绿——本步骤是扩大标记表，既有降噪断言不应被破坏）

### 步骤 6 — 全量校验（AC6）

```bash
cd apps/core-app
npx vitest run src/main/modules/update src/renderer/src/modules/update src/main/modules/network
npm run typecheck
cd ../.. && pnpm lint
```

### 步骤 7 — 本机完整触发一次真实 OTA（AC7 / AC8）

**7a 快速探针（AC7）** —— 复用本次诊断的 Electron 探针思路，新建**临时**脚本（验证后删除，不入库）：对不可达地址发请求，断言归一化后 `isOfficialFallbackEligible` 为 `true`。

**7b 完整链路（AC8）** —— 本机 darwin/arm64，dev 模式：

1. **临时下调版本**：`apps/core-app/package.json` 与根 `package.json` 的 `version` 改为 `2.4.14-beta.17`（低于线上 `beta.19` 即可）。
   > ⚠️ 验证完成后**必须还原为 `2.4.14-beta.20`**。此改动绝不可进提交——提交前用 `git diff` 确认两个 package.json 干净。
2. **构造官方源不可达**：若 `tuff.tagzxia.com` 仍不可达则天然满足；若已恢复，在更新设置里把 `settings.source.url` 指向一个可控的不可达地址。
3. `pnpm core:dev` 启动，在设置里触发"检查更新"。
4. **逐段留证**（对照 AC8 六项）：
   - 日志出现 `Nexus update lookup failed transiently; falling back to GitHub`
     —— **这是修复生效的直接标志**；修复前该行不会出现，错误会直接上抛
   - GitHub 返回 `v2.4.14-beta.19` 候选
   - 下载 `macos-latest-beta-tuff-2.4.14-beta.19-macos-arm64.dmg`
   - sha256 与 `.sig` 校验通过，生命周期进入 `ready`
   - 触发安装 → 以 `MAC_UPDATE_BUILD_UNTRUSTED` 终止（**预期行为**，dev 构建本就不应被静默替换，不计为失败）
5. **还原版本号**，确认工作区干净。

> 边界说明：含"替换 App 并重启"的安装腿本机验不了——需官方 CI 私钥签发的 attestation（`build-verification/index.ts:93-104`），本地构建拿不到。详见 PRD Out of Scope。

对照日志建议开 `updateSystemLog` / `releaseFetch` 相关命名空间；日志位置参考既有 dev 日志约定。

## 风险文件与回滚点

| 文件 | 风险 | 回滚点 |
|---|---|---|
| `packages/utils/network/core/errors.ts` | 发布包，标记表过宽会误吞 HTTP/abort 错误 | 步骤 1 后独立可回滚；负例测试是防线 |
| `release-fetch-service.ts` | 漏并 `isTimeoutLikeError` → 打断现存唯一回退路径 | 步骤 3 后独立可回滚 |
| `network-service.ts` | 归一化顺序错误会吞掉 abort/timeout 语义 | 步骤 2 后独立可回滚 |

每步结束即为一个可回滚点；分类器为纯函数无副作用，单独还原任一站点表达式不影响其余。

## 待确认

- 提交分支：当前 `release/beta20-clean` 是 beta.20 发布候选。此修复应进该候选（OTA 回退是发版相关能力），还是另开分支走 master？—— 需用户确认后再提交。
