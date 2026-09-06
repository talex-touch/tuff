# 修复 OTA 更新源传输层错误分类导致 GitHub 回退失效

## Goal

让 OTA 更新检查在官方源（Nexus）发生传输层故障时，能按设计回退到 GitHub 并正常重试。当前这条回退路径因错误分类与实际传输层错误格式不匹配而完全失效：官方源一挂，更新检查直接报错，即使 GitHub 完全可用。

## Background

### 故障复现（2026-09-04，本机实测）

官方更新源 `https://tuff.tagzxia.com` 从本机不可达：DNS 正常解析到 Cloudflare（104.21.80.101 / 172.67.177.44，与 1.1.1.1 权威结果一致），TCP 连接成功（~5ms），但 TLS ClientHello 之后立即 EOF；HTTP 80 端口同样不通。同一网络下 `github.com`、`api.github.com`、`cloudflare.com` 均返回 200。

用 Electron 探针脚本对该地址发真实请求，得到决定性证据：

```
[nexus-official] THREW
  name    : Error
  message : net::ERR_CONNECTION_CLOSED
  code    : undefined
  fallbackEligible(message) = false
[github-control] OK status=200
```

> 注：`tuff.tagzxia.com` 究竟是链路干扰还是 Cloudflare 侧配置问题，单一出口无法定性，需换网络环境复验。**该定性结论不影响本任务** —— 客户端的错误分类缺陷独立存在，任何传输层故障都会触发它。

### 根因

传输层实际使用 Electron `session.fetch`（Chromium 网络栈），失败时抛出 `net::ERR_*` 形式的错误
（`apps/core-app/src/main/modules/network/network-service.ts:1207`）。
`projectNetworkRequestError`（同文件 `:424`）仅对 abort 与 timeout-like 错误做归一化，其余错误原样透传。

但所有下游的"可回退/可重试"判定都是按 Node/undici 的错误串写的，两套命名体系不交叉：

| 判定位置 | 现有正则 | 后果 |
|---|---|---|
| `release-fetch-service.ts:478` `isOfficialFallbackEligible` | `NETWORK_TIMEOUT\|timeout\|etimedout\|enotfound\|econnreset\|eai_again\|fetch failed\|socket hang up` | 官方源传输失败时 **GitHub 回退不触发**，错误直接上抛 |
| `release-fetch-service.ts:598` `isRetryable` | 同上 | GitHub 拉取的**传输层重试不生效** |
| `GithubUpdateProvider.ts:542` `isRetryableError`（渲染层） | `ENOTFOUND\|EAI_AGAIN\|ECONNRESET\|NETWORK_TIMEOUT` | 渲染层更新检查**重试不生效** |

渲染层同样受影响：`UpdateProvider.request()`（`UpdateProvider.ts:44-50`）经 `networkSdk` → IPC → 主进程 `NetworkService` → `session.fetch`；错误跨 IPC 以 `error.message` 字符串透传，`net::ERR_CONNECTION_CLOSED` 原样到达渲染层判定。

### 受影响的错误码范围

不止一个错误码。几乎所有 Chromium 传输层错误都会被误判为"不可回退、不可重试"：

- `ERR_CONNECTION_CLOSED`（已实测）、`ERR_CONNECTION_RESET`、`ERR_CONNECTION_REFUSED`
- `ERR_CONNECTION_TIMED_OUT` —— 注意是 `TIMED_OUT`，正则要的是 `timeout`/`etimedout`，**不匹配**
- `ERR_NAME_NOT_RESOLVED`（DNS）、`ERR_INTERNET_DISCONNECTED`
- `ERR_SSL_PROTOCOL_ERROR`、`ERR_CERT_*`

唯一仍能正常回退的是服务自身 8s 超时路径：`NetworkTimeoutError.message` 含 `NETWORK_TIMEOUT`（`packages/utils/network/core/errors.ts:18-26`），能匹配。但"秒断连"型故障走不到超时。

### 实际存在三种错误方言

代码库里并存两条传输实现，加上运行环境差异，共三种错误串格式，现有正则只覆盖其中一种：

| 传输实现 | 运行环境 | 传输失败时的 message | 现有正则 |
|---|---|---|---|
| `session.fetch`（`network-service.ts:1207`） | 主进程 | `net::ERR_*` | ❌ 不匹配 |
| 全局 `fetch()`（`packages/utils/network/request.ts:124`） | 渲染层 / Chromium | `Failed to fetch` | ❌ 不匹配（正则找的是词序相反的 `fetch failed`） |
| 全局 `fetch()`（同上） | Node / undici | `fetch failed` | ✅ 匹配 |

即：现有实现只在 Node/undici 环境下成立，而这恰恰是三者中唯一不跑生产 OTA 流程的环境。

### 已有可复用资产

- `packages/utils/network/core/errors.ts` 已有语义化错误码体系：`NETWORK_ERROR_CODE`、`NetworkAbortError`、`NetworkTimeoutError`、`NetworkHttpStatusError`，以及 `isTimeoutLikeError()` / `parseHttpStatusCode()` 两个分类器。缺的正是"传输层失败"这一类。
- `apps/core-app/src/main/utils/network-log-noise.ts` 的 `DOWNGRADED_REMOTE_FAILURE_MARKERS` 已混列 Chromium 与 Node 两套错误串（含 `net::err_failed`、`err_connection_refused`）—— 说明代码库已知晓 Chromium 错误存在，但该知识只落在**日志降噪**工具里，未进入重试/回退分类器；且该列表也缺 `err_connection_closed` / `err_connection_reset`。

### 不受影响的部分（已验证正常）

- `src/main/modules/update` 单测 15 文件 108 用例全通过。
- 发布产物合规：`v2.4.14-beta.19` 的 `tuff-release-manifest.json` 为 `schemaVersion: 2`，含 win32/x64、darwin/arm64、darwin/x64、linux/x64 四个 `core` 产物，每个均带 `sha256` 与 `.sig`。
- 本地版本 `2.4.14-beta.20` 高于线上最新 `beta.19`（beta.20 为未发布候选版），因此本机"检查更新"必然返回"已是最新"——这是预期行为，非缺陷，但意味着**端到端安装链路无法在本机验证**。

## Decisions

- **D1** TLS/证书类错误（`ERR_SSL_PROTOCOL_ERROR`、`ERR_CERT_*`）与连接类错误同等对待，一律触发回退与重试，不做 fail-closed 特判。
  依据：两个源的产物在下游都经 `sha256` + 签名校验（manifest 携带 `sha256`/`signature`，`update-system.ts` 与 `release-signature.ts` 强制验签，验签失败抛错而非降级），因此被动切换源不降低完整性门槛；反之若证书错误 fail closed，处于 TLS 拦截型企业代理后的用户将完全拿不到更新，长期停留在旧版本，是更差的安全结果。

## Requirements

- **R1** 传输层错误需在 `NetworkService` 层归一化为语义化错误类型，携带原始错误码，使上层不再依赖对 `error.message` 的正则匹配。归一化必须**保留原始 message 文本**，避免影响其余约 25 个 `NetworkService` 调用方中既有的字符串判定。
- **R2** 分类器需同时识别三种方言（Chromium `net::ERR_*`、Chromium fetch `Failed to fetch`、Node/undici `fetch failed` 及 `ECONNRESET` 等），并在跨 IPC 丢失原型链的场景下仍能工作（渲染层拿到的是纯 `Error`，须能靠 message 兜底判定）。
- **R3** 三处判定站点统一改用共享分类器：`release-fetch-service.ts:478`、`release-fetch-service.ts:598`、`GithubUpdateProvider.ts:542`。
- **R4** 官方源发生传输层故障时，GitHub 回退必须触发；GitHub 亦不可用时，维持现有 stale-cache 兜底行为不变。
- **R5** 现有 HTTP 状态码判定语义（429 / ≥500 可回退，≥500 / 403 / 429 可重试）保持不变，不得因重构回归。
- **R6** `network-log-noise.ts` 的标记列表补齐缺失的 Chromium 错误码，与新分类器保持同源，避免两份清单再次漂移。
- **R7** 本机（darwin/arm64）须能完整触发一次真实 OTA，走通"检查 → 回退 → 下载 → sha256 + 验签 → ready"全链路，且此过程验证的是本次修复后的代码。终点边界见下方"本机可触发的边界"。

### 本机可触发的边界（darwin/arm64，已验证）

macOS 静默安装有构建信任闸门：`assertPlatformInstallPreflight`（`update-platform-adapter.ts:74-91`）要求
`isVerified && isOfficialBuild && !verificationFailed && hasOfficialKey`。

- dev 运行（`!app.isPackaged`）被硬编码为 `isOfficialBuild: false, hasOfficialKey: false`（`build-verification/index.ts:60-69`）
- 本地打包构建同样过不了：`verifyPackagedBuild` 要用官方私钥签发的 attestation 校验 `app.asar`（`index.ts:93-104`），该私钥在 CI

但该闸门位于 `scheduleInstallNow` 内，而后者要求 `phase === 'ready'`（`update-install-coordinator.ts:79-88`）——**在下载与验签之后**。

因此本机 dev 模式可完整跑通：检查 → 传输失败 → GitHub 回退 → 解析 beta.19 → 下载 arm64 dmg → sha256 + 签名校验 → 进入 `ready`，最终止于 `MAC_UPDATE_BUILD_UNTRUSTED`。**该终止是预期的正确行为**（dev 构建本就不应被静默替换），不计为失败。

含"替换 App 并重启"的安装腿需官方 CI 签名构建，属发布后验证，见 Out of Scope。

## Acceptance Criteria

- [ ] **AC1** 给定 `new Error('net::ERR_CONNECTION_CLOSED')`，`isOfficialFallbackEligible` 返回 `true`；单测覆盖三种方言与 R2 列出的全部错误码，含 `ERR_CONNECTION_TIMED_OUT` 与 `Failed to fetch`（现有正则的两处漏网之鱼），以及 D1 涉及的 `ERR_SSL_PROTOCOL_ERROR` / `ERR_CERT_AUTHORITY_INVALID`。
- [ ] **AC2** 单测：官方源抛 `net::ERR_CONNECTION_CLOSED` 时，`fetch()` 走到 `fetchGitHub` 并返回 GitHub 结果，而非上抛错误。
- [ ] **AC3** 单测：官方源与 GitHub 均抛传输层错误时，命中 stale-cache 分支；无 stale 时上抛 GitHub 错误（行为与改动前一致）。
- [ ] **AC4** 单测：渲染层 `GithubUpdateProvider.isRetryableError` 对 `net::ERR_*` 返回 `true`，且在错误已丢失原型链（纯 `Error`）时同样成立。
- [ ] **AC5** 回归：既有 HTTP 状态码用例（429/5xx/403）行为不变，`src/main/modules/update` 108 个既有用例保持全绿；`NetworkTransportError` 归一化后原始 message 文本不变（覆盖 R1 的兼容性约束）。
- [ ] **AC6** 全量校验通过：`npx vitest run src/main/modules/update src/renderer/src/modules/update`、`pnpm lint`、`npm run typecheck`。
- [ ] **AC7** Electron 探针复现：官方源不可达时，更新检查返回 GitHub 的候选结果而非错误（需在能复现该网络故障的环境执行；若官方源已恢复，用可控的不可达地址覆盖 `settings.source.url` 模拟）。
- [ ] **AC8**（R7）本机 dev 模式完整触发一次真实 OTA，逐段留证：
  - 官方源传输失败 → 日志出现 `Nexus update lookup failed transiently; falling back to GitHub`（现状下该行**不会**出现，是修复生效的直接标志）
  - GitHub 返回 `v2.4.14-beta.19` 候选
  - 下载 `macos-latest-beta-tuff-2.4.14-beta.19-macos-arm64.dmg`
  - sha256 与 `.sig` 校验通过，生命周期进入 `ready`
  - 触发安装时以 `MAC_UPDATE_BUILD_UNTRUSTED` 终止（预期行为，非失败）
  - 前置条件：本地版本须低于 `beta.19`，通过临时下调 `package.json` 版本号实现，验证完成后**必须还原**

## Out of Scope

- `tuff.tagzxia.com` 服务端可用性排查与修复（属运维，另行处理）。
- 含"替换 App 并重启"的 macOS 安装腿真机验证：需官方 CI 签名构建（本地构建拿不到官方私钥签发的 attestation），属发布后验证。可选路径：装官方 `beta.18` dmg 升到 `beta.19`——但那跑的是已发布的旧代码，不含本次修复；真正覆盖本次修复的完整安装腿须待 `beta.20` 由 CI 签名发布后，从 `beta.19` 升级验证。
- 更新源以外的其它 `NetworkService` 调用方的错误分类审查（本次仅在 utils 层留出共享分类器并保证向后兼容，不改其它调用方的判定逻辑）。
