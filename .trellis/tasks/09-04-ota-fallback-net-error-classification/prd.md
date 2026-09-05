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

- [x] **AC1** 给定 `new Error('net::ERR_CONNECTION_CLOSED')`，`isOfficialFallbackEligible` 返回 `true`；单测覆盖三种方言与 R2 列出的全部错误码，含 `ERR_CONNECTION_TIMED_OUT` 与 `Failed to fetch`（现有正则的两处漏网之鱼），以及 D1 涉及的 `ERR_SSL_PROTOCOL_ERROR` / `ERR_CERT_AUTHORITY_INVALID`。
- [x] **AC2** 单测：官方源抛 `net::ERR_CONNECTION_CLOSED` 时，`fetch()` 走到 `fetchGitHub` 并返回 GitHub 结果，而非上抛错误。
- [x] **AC3** 单测：官方源与 GitHub 均抛传输层错误时，命中 stale-cache 分支；无 stale 时上抛 GitHub 错误（行为与改动前一致）。
- [x] **AC4** 单测：渲染层 `GithubUpdateProvider.isRetryableError` 对 `net::ERR_*` 返回 `true`，且在错误已丢失原型链（纯 `Error`）时同样成立。
- [x] **AC5** 回归：既有 HTTP 状态码用例（429/5xx/403）行为不变；`NetworkTransportError` 归一化后原始 message 文本不变（覆盖 R1 的兼容性约束）。
- [x] **AC6** 全量校验通过（`f1f48bad1`）：`packages/utils` 41 条传输分类用例、`apps/core-app` update 相关 148 条全绿；`typecheck:node` 与 `vue-tsc` 通过；两个包按各自 eslint 配置 lint 干净。
- [x] **AC7** Electron 探针：对真实不可达的 `tuff.tagzxia.com` 发请求，捕获 `net::ERR_CONNECTION_CLOSED`，断言旧正则匹配为 `false`、归一化后 `isOfficialFallbackEligible` 为 `true`、message 逐字节不变。
- [~] **AC8**（R7）本机 dev 模式真实触发，逐段结果：
  - [x] 官方源传输失败 → `17:25:50 [WARN] [UpdateService] Nexus update lookup failed transiently; falling back to GitHub error=NetworkTransportError: net::ERR_CONNECTION_REFUSED`（worktree 跑 `f1f48bad1` + 版本降至 beta.18，官方源指向 `https://127.0.0.1:9999`）
  - [x] GitHub 返回 `v2.4.14-beta.19` 候选、UI 出现「下载更新」（另一次运行，官方源恰好可用时；`Update check fetched source=... hasUpdate=true tag=v2.4.14-beta.19`）
  - [ ] 下载 arm64 dmg — **被 F2 阻塞**（dev 模式下载必被 `destination-outside-roots` 拒绝），非本任务缺陷
        → **2026-09-05 更新**：F2 已修复并合入（#1869）。下载现已能启动
        （`Update download started`，无 `destination-outside-roots`），但产物落盘仍失败于
        `NETWORK_HTTP_STATUS_403`——GitHub 未认证配额与 Nexus 空结果双双不可用，属外部阻塞。
  - [ ] sha256 + `.sig` 校验、进入 `ready` — 同上，未达到该阶段
  - [ ] 触发安装以 `MAC_UPDATE_BUILD_UNTRUSTED` 终止 — 未达到该阶段
  - [x] 版本号已还原，worktree 已移除，共享 dev 配置 `update-settings.json` 已从备份还原

> 后续进展与完整逐段结果见父任务
> [09-04-dev-update-flow-untestable](../09-04-dev-update-flow-untestable/prd.md) 的 AC-P1。
> 该任务的 AC8 剩余三条与父任务 AC-P1 是同一件事，不重复跟踪。

### AC8 验证方式与一处已纠正的错误

无 computer-use 工具，改用 CDP 驱动：Electron 以 `--remote-debugging-port=9222` 启动，脚本连渲染层导航到 `/setting/update` 并点击按钮，全程无人工介入。

两个必须绕过的 dev 闸门见下方 F1；测试夹具仅注入 `window.$argMapper = { touchType: 'main' }`，不改动被测逻辑。

**已纠正**：首次 AC8 用 `https://127.0.0.1:9` 作不可达地址，得到 `net::ERR_UNSAFE_PORT` 并观察到回退，当时误判为"前缀兜底生效"。实际上 `ERR_UNSAFE_PORT` 是调用方错误而非传输故障，它能命中仅因当时存在通配前缀 `net::err_`——该前缀已被 `5072d9858` 正确移除（同时移除的还有 `ERR_ABORTED`/`ERR_ACCESS_DENIED`/`ERR_BLOCKED_BY_CLIENT`/`ERR_INVALID_URL` 的误判）。重跑改用 `127.0.0.1:9999` → `ERR_CONNECTION_REFUSED`，由显式 `err_connection_` 前缀命中，证据方成立。

## 衍生发现（不属本任务，建议另开单）

- **F1** dev 模式下「检查更新」按钮是死的：`window.$argMapper` 为 `{}`，`useArgMapper` 将空对象当作有效缓存返回，`touchType` 因此为 `undefined` → `isMainWindow()` false → `canShowUpdatePrompt()` 拦截 → `checkApplicationUpgrade()` 静默 return（`useUpdateRuntime.ts:130-132, 409-412`）。
- **F2** dev 模式下更新下载必被拒（`destination-outside-roots`）：更新系统写 `ctx.app.rootPath`（实测 `…/@talex-touch/core-app/tuff-dev/modules/update-packages`），而 `getAllowedDownloadRoots()` 用 `resolveRuntimeRootPath(app)` 算出 `…/@talex-touch/tuff-dev/tuff-dev`（该目录不存在）。成因是 `polyfills.ts` 在 dev 分支执行 `app.setPath('userData', …)`，而 `precore.ts` 的 `innerRootPath` 在模块加载时求值、下载策略在调用时求值，两者跨越了这次改写。
- F1/F2 均**推断**仅影响 dev（生产 `app.isPackaged` 为真，不进 polyfills 该分支），但**未在打包构建上验证该推断**。
- **F3** `tuff.tagzxia.com` 表现为间歇可用（同一分钟内连测两次分别为 200 / 连接被重置），而非持续宕机。这提高了本修复的价值：间歇故障会频繁触发回退路径。

## Out of Scope

- `tuff.tagzxia.com` 服务端可用性排查与修复（属运维，另行处理）。
- 含"替换 App 并重启"的 macOS 安装腿真机验证：需官方 CI 签名构建（本地构建拿不到官方私钥签发的 attestation），属发布后验证。可选路径：装官方 `beta.18` dmg 升到 `beta.19`——但那跑的是已发布的旧代码，不含本次修复；真正覆盖本次修复的完整安装腿须待 `beta.20` 由 CI 签名发布后，从 `beta.19` 升级验证。
- 更新源以外的其它 `NetworkService` 调用方的错误分类审查（本次仅在 utils 层留出共享分类器并保证向后兼容，不改其它调用方的判定逻辑）。
- F1 / F2 两处 dev 模式缺陷的修复（本任务只记录证据与成因，不改动）。
- GitHub 未认证 API 配额（`0/60`）耗尽期间的 GitHub 侧链路复验——外部限流，非代码问题。
