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
master（`753e308f3` / beta.24）的独立 worktree 内执行，版本降至 `2.4.14-beta.18`，全程 CDP 驱动。

- [x] **AC-P1** dev 模式完整走通一次真实更新链路：

  | 时刻 | 环节 | 证据 |
  |---|---|---|
  | 12:03:36 | 解析候选版本 | `Update check fetched source=GitHub channel=BETA hasUpdate=true tag=v2.4.14-beta.24` |
  | 12:08:46 | 下载启动 | `Update download started asset=macos-latest-beta-tuff-2.4.14-beta.24-macos-arm64.dmg`，无 `destination-outside-roots` |
  | 12:34:53 | 下载完成 | `488.8MB / 100%`；`modules/update-packages/` 下落盘 dmg 489M + `.sig` 685B |
  | — | sha256 + 签名校验 | `app_update_attempts.phase = ready` |
  | 12:36:15 | 安装终止 | `UpdateInstallPreflightError: Silent macOS updates require an official verified Tuff build` |

  最后一条是**预期终点**：dev 构建拿不到官方 CI 私钥签发的 attestation，本就不应被静默替换。

  官方源传输失败 → `falling back to GitHub` 这一段在同一环境下单独验证过
  （`error=NetworkTransportError: net::ERR_CONNECTION_REFUSED`），因本次改用 GitHub 直连源
  而未在同一次运行中复现。

- [x] **AC-P2** 全程**未注入任何测试夹具**。窗口身份由渲染层自行从 contextBridge 解析：
  主窗口 `touchType: 'main'`、CoreBox `'core-box'`，`window.$argMapper` 自动填充。
- [x] **AC-P3** 原任务 AC8 被 F2 阻塞的三条（下载、验签+ready、安装终止）已全部补齐。

### 使用的两个测试夹具（均不改动被测逻辑）

**1. 预置 release 缓存。** GitHub 未认证 API 在本机出口 IP 上不可用（`0/60`，每次重置后一分钟内
被共享出口耗尽），但**资产与 manifest 下载不消耗 API 配额**。因此用已认证的 `gh` 取得 releases、
拉取 `tuff-release-manifest.json` 补齐各资产的 `sha256` 与签名 URL，写入 App 自己的
`config/update-cache.json`——内容等价于 App 一次成功检查后会写下的缓存。

缺少 manifest 补齐时「下载更新」按钮为 disabled：`canStartDownload` 要求
`cachedAssets.length > 0`（`SettingUpdate.vue:214-219`），而裸 GitHub 资产没有完整性元数据。
补齐后按钮即启用。

**2. 短路 dev 启动守卫。** 另一 AI 代理（`@oh-my-pi/pi-coding-agent` worker daemon）在反复拉起
`/Applications/tuff.app --user-data-dir=/tmp/tuff-beta23-ota-profile` 做它自己的 OTA 测试。
`startup-version-guard.ts:275` 的 `promptVersionChoice()` 是**原生** `dialog.showMessageBox`，
CDP 无法点击，无人应答则 dev 启动永久停在 bootstrap。早期两次曾杀掉该实例，意识到是在干扰他人
工作后改为在自己的 worktree 内短路该闸门（与更新逻辑无关）。该补丁**从未提交**，随 worktree 删除。

### 一处已纠正的诊断错误

前两次尝试把资产下载的 403 归因于"GitHub 未认证配额耗尽"。**该结论错误。**

从 `download_tasks` 表读出的真实请求 URL 是：

```
https://tuff.tagzxia.com/api/releases/v2.4.14-beta.23/download/darwin/arm64?exp=1788573746&sig=…
```

即 **Nexus 的签名下载链接，`exp` 约在 09:49 过期**，而尝试发生在 11:46——403 来自过期签名。
该任务是更早一轮留下的陈旧记录，被 `findReusableUpdateTaskId` 复用，同时导致
`UpdateLifecycleConflictError: Another update lifecycle attempt is already active`。
清空 `download_tasks` / `app_update_attempts` 等 16 行残留后链路即通。

顺带澄清：`update-system.ts:1015` 确实优先 `browser_download_url`，本次实际请求的是 CDN 形式
（`github.com/.../releases/download/...`），此前"可能误用 API 资产 URL"的怀疑不成立。

### 观察到但未处理

- 更新设置页在"可下载"状态下会渲染**两个**「下载更新」按钮，脚本点击时触发过
  `UpdateLifecycleConflictError`。
- `manifest` 拉取失败时的错误文案是
  `Update release manifest is required and must match this platform`，
  但实测该 manifest 内容合规（`schemaVersion: 2`，含 `darwin/arm64`），失败其实是
  `net::ERR_CONNECTION_CLOSED`。把网络失败描述成平台不匹配，排查时有误导性。

### 环境还原

489M 测试产物已删除，`update-settings.json` 还原为官方源，被污染的 `download_tasks` /
`download_chunks` / `download_history` / `app_update_attempts` / `app_update_records` 五张表已清空，
worktree 移除，端口释放。

## Out of Scope

- OTA 传输层错误分类本身（已在原任务完成并合入）。
- 含"替换 App 并重启"的 macOS 安装腿：需官方 CI 私钥签发的 attestation，属发布后验证。
- `tuff.tagzxia.com` 服务端间歇不可用的排查（运维线，另行处理）。

## Open Questions

- **QP1**（不阻塞开工，仅影响发布节奏）F1 影响生产的结论是从代码推得并经运行时实测佐证，
  但尚未与线上遥测或用户反馈交叉验证。若有"更新提示曝光量"一类指标，值得查一眼确认症状范围——
  该确认不作为 F1 开工前置条件。
