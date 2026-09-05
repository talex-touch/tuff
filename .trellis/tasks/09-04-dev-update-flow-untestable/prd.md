# 修复 dev 模式下更新链路无法验证

## Goal

让更新链路能在开发环境被完整走通一次（检查 → 回退 → 下载 → 验签 → ready），从而使 OTA 相关改动可以在本机端到端验证，而不是只能靠单测加线上发布后观察。

当前两处独立缺陷合起来把这条路堵死：更新检查在渲染层被静默拦截（F1），即使拿到候选版本，下载也必被路径策略拒绝（F2）。修好任一条都不足以解锁验证，必须两条都修。

## Background

两处缺陷是在验证 OTA 传输层错误分类修复（`.trellis/tasks/09-04-ota-fallback-net-error-classification`）时撞出来的，导致该任务的 AC8 只完成到"回退触发 + 解析出候选版本"，下载与验签两段始终无法执行。

原任务 PRD 已记录证据，本任务树负责修复。

### 一处必须先纠正的判断

原任务把 F1 记为"推断仅影响 dev"。**该推断是错的**，已在本任务规划阶段查实：

`window-security-profile.ts:24-31` 对所有窗口强制 `contextIsolation: true` / `sandbox: true` /
`nodeIntegration: false`，并有契约测试锁定。渲染层主世界因此没有 `process`，
`useArgMapper(globalThis.process?.argv ?? [])` 恒取 `[]`。这与 `app.isPackaged` 无关，
**生产环境同样成立**。详见子任务 `09-04-dev-update-check-noop`。

F2 则确为 dev 专属（成因分支被 `!app.isPackaged` 包裹），详见子任务
`09-04-dev-update-download-root-mismatch`。

## 子任务

| 子任务 | 缺陷 | 影响范围 | 优先级 |
|---|---|---|---|
| [09-04-dev-update-check-noop](../09-04-dev-update-check-noop/prd.md) | 渲染层 `isMainWindow()` 恒为 false，手动检查与更新提示双双被拦 | **生产 + dev** | **P0** |
| [09-04-dev-update-download-root-mismatch](../09-04-dev-update-download-root-mismatch/prd.md) | 两套 app root 不一致，更新下载被 `destination-outside-roots` 拒绝 | 仅 dev | P2 |

两者无实现依赖，可并行推进；但跨子任务验收（AC-P1）要求两者都合入后才能验证。

F1 已升为 P0：主进程自动检查发现新版本后需经渲染层弹窗告知用户，而该弹窗被同一闸门拦掉
（`useUpdateRuntime.ts:351`），因此线上用户既不能手动检查、也收不到任何更新提示。
该子任务不应等待父任务整体节奏，可独立发布。

## Requirements

- **RP1** 两个子任务各自的验收标准全部满足。
- **RP2** 修复不得放宽窗口安全基线：`SECURITY_BASE`（`contextIsolation` / `sandbox` /
  `nodeIntegration`）不允许为了让渲染层拿到 `process.argv` 而降级。窗口身份必须通过既有的
  contextBridge 或 startup-info 通道传递。
- **RP3** F1 的修复需覆盖 `isMainWindow()` 之外的同源调用点（`isCoreBox()` / `useTouchType()`），
  它们共用同一份失效缓存；若本次不全部修复，须在子任务里写明取舍与残留风险。

## Acceptance Criteria

两个子任务均已合入 master（#1868 `2946f7656`、#1869 `91bfe9750`）。收尾验证在基于合并后
master 的独立 worktree 内执行，版本降至 `2.4.14-beta.18`，全程 CDP 驱动。

- [~] **AC-P1** dev 模式完整走通一次真实更新链路，逐段结果：

  | 环节 | 结果 | 证据 |
  |---|---|---|
  | 官方源传输失败 → 回退 | ✅ | `[09:43:46] Nexus update lookup failed transiently; falling back to GitHub error=NetworkTransportError: net::ERR_CONNECTION_REFUSED`（官方源指向 `127.0.0.1:9999`） |
  | 解析出候选版本 | ✅ | `[09:47:26] Update check fetched source=Nexus Releases channel=BETA hasUpdate=true tag=v2.4.14-beta.23` |
  | 下载启动 | ✅ | `[09:48:07] [UpdateSystem] Update download started tag=v2.4.14-beta.22 asset=macos-latest-beta-tuff-2.4.14-beta.22-macos-arm64.dmg`，**日志中不再出现 `destination-outside-roots`** |
  | 产物落盘 | ❌ | `DownloadError: NETWORK_HTTP_STATUS_403`，见下方"外部阻塞" |
  | sha256 + `.sig` 校验 → `ready` | ❌ | 未达到该阶段 |
  | 安装以 `MAC_UPDATE_BUILD_UNTRUSTED` 终止 | ❌ | 未达到该阶段 |

- [x] **AC-P2** 全程**未注入任何测试夹具**。窗口身份由渲染层自行从 contextBridge 解析：
  主窗口 `touchType: 'main'`、CoreBox `touchType: 'core-box'`，`window.$argMapper` 自动填充。
  原任务需要注入 `window.$argMapper = { touchType: 'main' }` 才能跑，现已不需要。
- [~] **AC-P3** 原任务 AC8 被 F2 阻塞的三条：下载**已不再被路径策略拒绝**（阻塞解除），
  但下载完成、验签+ready、安装终止三段仍未验证，原因是外部阻塞而非代码。

### 外部阻塞（与本任务代码无关）

两个更新源在验证时段同时不可用：

- **GitHub 未认证 API 在该出口 IP 上不可用**：`remaining 0/60`。等待至重置时刻（10:19→10:21）后，
  窗口一滚动立刻又是 `0/60`，一分钟内不可能由本次验证打满，判断为共享出口被占用。
  资产下载因此返回 `NETWORK_HTTP_STATUS_403`。
- **Nexus 对所有渠道返回 `release: null`**：09:47 时它还能给出 `beta.23`，之后转为空。
  空结果按设计是"权威无结果"（`release-fetch-service.ts:314-322`），终止且**不触发回退**，
  因此这条路同样走不通。

补跑条件：GitHub 配额恢复，或 Nexus 重新发布 beta 版本。代码侧无已知障碍。

### 第二次补跑（2026-09-05 11:20，基线 `753e308f3` / beta.24）

配额重置后立刻重跑，基线换成更新的 master（含 #1870/#1871 两个 download-worker 修复）。
**比第一次走得更远**，但仍止于网络层：

| 环节 | 结果 | 证据 |
|---|---|---|
| 窗口身份（无注入） | ✅ | `argMapper: {"touchType":"main"}` |
| 路径策略 | ✅ | 全程无 `destination-outside-roots`，F2 修复稳定 |
| 进入 manifest 解析 | ✅ | 首次到达该阶段（上次止于资产 403） |
| manifest 拉取 | ❌ | `[11:22:22] Failed to fetch release manifest asset=tuff-release-manifest.json error=NetworkTransportError: net::ERR_CONNECTION_CLOSED` |
| 重试检查 | ❌ | `[11:25:55] Update check deferred by upstream rate limit status=403 remaining=0 retryAt=04:19:22Z` |

两点值得单独记：

- **manifest 内容本身没问题**。直接拉 `v2.4.14-beta.23` 的 `tuff-release-manifest.json` 得到
  `schemaVersion: 2` 且含 `core / darwin / arm64`。失败是**拉取**失败，不是"不匹配此平台"——
  错误文案 `Update release manifest is required and must match this platform` 把网络失败
  和平台不匹配混为一谈，排查时有误导性，值得单独看一眼。
- **`NetworkTransportError` 出现在这里**，说明最早那个 OTA 传输层分类修复在 manifest 拉取路径上
  同样生效。

### 外部阻塞的性质（两次尝试后的结论）

不是"等一会儿就好"，而是这台机器的网络环境本身不具备条件：

- **GitHub 未认证配额被共享出口耗尽**。11:19 重置后仅剩 `11/60`（本次验证只发了 1 次请求），
  几分钟内归零。等待没有意义——每个窗口开启后一分钟内就被别人用光。
- **GitHub 主机间歇不可达**。`api.github.com` / `github.com` / `objects.githubusercontent.com`
  曾同时返回 `000`，随后恢复；探测约 2~3 次才通 1 次。
- **Nexus 对所有渠道持续返回 `release: null`**，且空结果是权威终止、不触发回退。

要完成剩余三段（下载完成、验签+ready、安装终止），需要其中之一：GitHub 侧使用认证请求以绕开
未认证配额、换一个网络出口、或 Nexus 重新发布 beta 版本。

### 验证期间清理掉的干扰源

`/Applications/tuff.app`（PID 82642，`--user-data-dir=/tmp/tuff-beta23-ota-profile --disable-gpu`）
在运行。`startup-version-guard.ts:275` 的 `promptVersionChoice()` 是**模态对话框**——检测到正式版
在跑就会弹窗等待选择，无人应答时 dev 启动永久停在 bootstrap（日志止于 `DevTools listening`，
模块从不加载）。这是此前两次启动失败的真实原因，与端口占用无关。

### 顺带观察到的小问题（未处理）

更新设置页在"有可下载更新"状态下会渲染**两个**「下载更新」按钮，脚本点击时触发了
`UpdateLifecycleConflictError: Another update lifecycle attempt is already active`。
不影响上述结论，但重复按钮本身值得单独看一眼。

## Out of Scope

- OTA 传输层错误分类本身（已在原任务完成并合入）。
- 含"替换 App 并重启"的 macOS 安装腿：需官方 CI 私钥签发的 attestation，属发布后验证。
- `tuff.tagzxia.com` 服务端间歇不可用的排查（运维线，另行处理）。

## Open Questions

- **QP1**（不阻塞开工，仅影响发布节奏）F1 影响生产的结论是从代码推得并经运行时实测佐证，
  但尚未与线上遥测或用户反馈交叉验证。若有"更新提示曝光量"一类指标，值得查一眼确认症状范围——
  该确认不作为 F1 开工前置条件。
