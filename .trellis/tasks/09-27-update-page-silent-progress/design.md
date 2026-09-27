# Design — 更新设置页重构

## 1. 边界

| 层 | 文件 | 改动 |
|---|---|---|
| utils 类型/transport | `packages/utils/types/update.ts`、`transport/events/types/update.ts`、`transport/events/index.ts`、`transport/sdk/domains/update.ts` | 新增 `UpdateHistoryEntry` 类型、`UpdateEvents.getHistory`、`UpdateSdk.getHistory` |
| 主进程 | `modules/update/update-attempt-repository.ts`、新 `modules/update/update-history.ts`、`UpdateService.ts` | 历史查询 + 纯函数投影 + handler；F3：缓存路径触发自动下载 |
| 渲染端 hook | `modules/hooks/useUpdateRuntime.ts` | F2：下载请求超时 30s；新增 `getUpdateHistory()`；下载开始 toast 文案 |
| 渲染端视图 | `views/base/settings/SettingUpdate.vue`（重写模板与大部分脚本）、新 `SettingUpdateStatus.vue`、新 `SettingUpdateHistory.vue`、新 `update-status-display.ts`、新 `useUpdateDownloadProgress.ts`、`update-diagnostic-evidence.ts`（新增真伪投影，删除仅供旧告警块用的 display） | 见 §2–§7 |
| 文案 | `modules/lang/zh-CN.json`、`en-US.json` | 增删 `settings.settingUpdate.*` 与 `update.download_started` |
| spec | `.trellis/spec/frontend/release-testing.md` §3/§4 | 真伪 banner 契约改为三平台 |

不动：更新生命周期状态机、下载中心、安装协调器、诊断 JSON 结构（`runtimeTarget.nativeTrust` 仍是 macOS 投影，保持 schemaVersion 1 不变）。

## 2. 页面信息架构

```
更新                                                      ← SettingsPage 标题（不变）

┌ 卡片 1（无组头）──────────────────────────────────────────┐
│ ⚠ 当前不是官方正版 Tuff                   [前往官网下载] │ ← 仅 unofficial（§5）
│   无法确认它来自官方发布且未被修改，请从官网重新下载安装。 │
├──────────────────────────────────────────────────────────┤
│ 状态行（§3）                                              │
├──────────────────────────────────────────────────────────┤
│ 更新渠道                               [公测版（Beta）▾] │ ← §4 可见性
└──────────────────────────────────────────────────────────┘
┌ 更新历史 ────────────────────────────────────────────────┐ ← 有记录才渲染（§6）
│ 2.4.14-beta.46   9月26日 21:04                 ✓ 已更新 │
│ 2.4.14-beta.45   9月24日 10:12                 ✓ 已更新 │
│ 2.4.14-beta.44   9月22日 09:30                 ↺ 已回滚 │
│                                             [显示更多] │
└──────────────────────────────────────────────────────────┘
┌ 高级 ────────────────────────────────── 仅开发者模式 ────┐
│ 检查频率                                 [每 12 小时 ▾] │
│ 自动更新                                        [开关] │
│ 有新版本时通知                                  [开关] │
│ GitHub 下载包      v2.4.15 · 当前设备 1/6 [查看下载包] │
│ 诊断证据                                   [导出诊断] │
│ Renderer Override（实验性）   ← 仍需 env，保留其描述  │
└──────────────────────────────────────────────────────────┘
```

- 三张卡都用 `TuffGroupBlock :collapsible="false"`；卡片 1 省略 `name`（合法的无头卡片形态），「更新历史」「高级」只有组名、无描述。
- 描述清理：除 banner 说明句与 Renderer Override 描述外，所有行不再传 `description`。状态行的第二行是**状态信息**（版本号、进度、错误原因），不算描述。
- 顺序理由：历史对所有人可见，放在状态卡下面；高级项只给开发者模式，放最后。

## 3. 状态行：阶段 → 视图

纯函数 `resolveUpdateStatusView(input)`（新文件 `update-status-display.ts`，表驱动单测）把快照映射成视图，组件只负责渲染。

输入：`snapshot | null`、`loading`、`currentVersion`、`autoDownload`、`availableSinceMs`（进入 `available` 的时刻，由组件记录）、`nowMs`、`platform`、`authenticity`（§5）、`downloadRequestPending`。

| 阶段 | 标题 | 第二行 | 进度 | 右侧动作 |
|---|---|---|---|---|
| 快照未到且在加载 | —（骨架屏） | | | |
| `idle`/`healthy` 且 `lastCheckAt` 非空 | 已是最新版本 | v{当前} | — | 检查更新 |
| `idle` 且从未检查、`recovered` | 当前版本 v{当前} | — | — | 检查更新 |
| `checking` | 正在检查更新… | v{当前} | — | 检查更新（loading） |
| `available` 且 `autoDownload` 且进入不足 15s | 正在准备下载 {目标} | — | 不确定 | — |
| `available`（其余情况） | 发现新版本 {目标} | — | — | 下载更新（请求中 loading） |
| `downloading` 有进度 | 正在下载 {目标} | `37% · 45.2 MB / 121.6 MB · 2.1 MB/s` | 确定 | — |
| `downloading` 尚无进度 | 正在下载 {目标} | — | 不确定 | — |
| `verifying` | 正在校验 {目标} | — | 不确定 | — |
| `ready` | {目标} 已就绪 | 退出 Tuff 时会自动安装（仅 `snapshot.installOnNormalQuit`）；**macOS 非官方构建**改为「非官方版本无法自动安装，请从官网下载」 | — | macOS「重启并更新」/ Windows「启动安装器」/ Linux「打开安装包」；**macOS 非官方构建不放按钮**（安装必被 `MAC_UPDATE_BUILD_UNTRUSTED` 拦下；下载入口只由横幅提供，避免同一张卡里出现两个相同按钮） |
| `install-scheduled`/`handoff-started` | 正在安装 {目标} | — | 不确定 | — |
| `awaiting-health` | 正在完成更新 | — | 不确定 | — |
| `recovery-required`/`recovering` | 更新未完成，正在恢复上一版本 | — | 不确定（warning） | — |
| `failed` | 更新失败 | `error.message` | — | 重试（= 强制检查） |

- 全页不再出现「空闲」。`lastCheckAt` 来自 `settings.lastCheckedAt`（`UpdateService.ts:776,802`），可靠。
- **15s 宽限**：自动下载开启时，`available` 通常只持续 manifest 拉取那几秒（≤8s）。这期间藏起「下载更新」，避免用户再点一次触发手动/自动并发（agent 调研的 3b 竞态）。超过 15s 仍停在 `available`，说明自动下载没跑起来（dev 构建被 `!app.isPackaged` 门掉，或其他原因），这时露出按钮兜底。组件用一个 1s 的 `nowMs` 计时器，只在 `available` 阶段运行。
- 状态区 `aria-live="polite"`；进度条用 `TxProgressBar`（带 `ariaLabel`）。行高：进度态用 `TuffBlockSlot` 的 `#label` 插槽，并像现有 `.lifecycle-advanced` 一样把行高放开成 auto。

## 4. 可见性规则

| 行 | 条件 |
|---|---|
| 真伪 banner | `authenticity === 'unofficial'` |
| 状态行 | 总是 |
| 更新渠道 | `isBetaBuild` ‖ `selectedChannel === BETA` ‖ `developerMode` |
| 更新历史卡 | 历史加载完成且非空 |
| 高级卡（频率、自动更新、通知、下载包、诊断） | `developerMode` |
| Renderer Override | `developerMode && rendererOverrideAvailable`（仍在高级卡内） |

- `developerMode` = `appSetting.dev.developerMode`（响应式，`app-storage.ts:61`），与 `SettingFileIndex.vue:122-126` 同口径。
- `isBetaBuild` = `resolveUpdateChannelLabel(splitUpdateTag(startupInfo.version).channelLabel) === BETA`（snapshot/alpha 也归 BETA，与主进程默认渠道推导一致，见 `UpdateService.ts:1829-1846`）。
- 「已选 Beta」这一条是防困住：release 构建用户在开发者模式下切到 Beta 再关掉开发者模式，仍能看到渠道行切回来。
- Renderer Override 以前不看开发者模式；改成收在高级卡里（与记忆中「设了 env 才在『高级』分组出现」一致），开发者设了 env 仍需开开发者模式才能看到。

## 5. 真伪投影与 banner（三平台）

新增 `resolveBuildAuthenticity(status: BuildVerificationStatus | null): 'official' | 'unofficial' | 'unknown'`：
- `null` → `unknown`（不渲染 banner，避免加载中闪红）。现有 `resolveMacNativeTrust(platform, null)` 在加载完成前就返回 `unverified`，会闪一下，新投影修掉这点。
- `isOfficialBuild && hasOfficialKey && !verificationFailed` → `official`；否则 → `unofficial`。
- 不看平台。dev 构建（`isOfficialBuild=false`，`build-verification/index.ts:62-69`）会显示 banner，与今天 macOS dev 的行为一致。

Banner：`role="alert"`、不可关闭、danger 底色（沿用 `.native-trust-alert` 的配色与无底边处理）。一个标题 key + 一个说明 key + 一个动作「前往官网下载」→ `appSdk.openExternal(`${NEXUS_BASE_URL}/updates`)`。固定用官方常量，不用用户可配置的 Nexus 地址，因为目的是拿到正版。

删除：`resolveMacNativeTrustDisplay`、`MAC_NATIVE_TRUST_RISK_KEYS`、`settings.settingUpdate.nativeTrust.*` 这批 UI 文案、「官方认证」徽标。保留：`resolveMacNativeTrust`，它只供诊断 JSON 的 `runtimeTarget.nativeTrust` 使用。

## 6. 更新历史（本机记录）

**契约**

```ts
// packages/utils/types/update.ts
export type UpdateHistoryOutcome = 'updated' | 'rolled-back' | 'failed'
export interface UpdateHistoryEntry {
  attemptId: string
  fromVersion: string        // attempt.currentVersion
  toVersion: string          // attempt.targetVersion
  channel: AppPreviewChannel
  outcome: UpdateHistoryOutcome
  finishedAt: number         // attempt.updatedAt（终态迁移时写入）
  error: UpdateLifecycleError | null
}
// events: UpdateEvents.getHistory = update:service:get-history
//   request { limit?: number }  → UpdateOpResponse<UpdateHistoryEntry[]>
// sdk: getHistory(payload?: { limit?: number })
```

**选取规则**（纯函数 `buildUpdateHistory(snapshots, limit)`，放在 `update-history.ts`，单测覆盖）：
1. 仓库新增 `listTerminalAttempts(max = 200)`：`phase IN ('healthy','recovered','failed') AND target_version IS NOT NULL`，按 `updated_at DESC`。检查阶段就失败的尝试没有 `targetVersion`，纯检查（`idle`）不是更新，两者自然排除。
2. 映射：`healthy → updated`，`recovered → rolled-back`，`failed → failed`。
3. 按 `toVersion` 去重，保留最新一条。同一版本连续失败多次只显示一行；先失败后成功，只显示成功。
4. `limit` 夹在 1–50，默认 20。

**渲染**：`SettingUpdateHistory.vue`。每行一个 `TuffBlockSlot`：标题 = 版本号，第二行 = 本地化时间（`Intl.DateTimeFormat`，跟随 i18n locale），右侧 = `TuffStatusBadge`（已更新 success / 已回滚 warning / 失败 danger，失败行 `title` 带错误信息）。默认显示 5 行，「显示更多 / 收起」切换全部（≤20）。挂载时加载；生命周期进入 `healthy`/`recovered`/`failed` 时刷新。空列表不渲染整张卡。历史不做骨架屏：它可能为空，骨架出现后又消失反而是更大的跳动。本机查询很快，出现时直接渲染。

## 7. 下载进度（渲染端）

`useUpdateDownloadProgress(lifecycleSnapshot)`（新文件，页面内使用）：
- 订阅 `downloadSdk.onTaskProgress` 与 `onTaskUpdated`：`task.module === APP_UPDATE`，并且 `task.id === snapshot.taskId`（快照尚无 taskId 时接受任意 APP_UPDATE 任务）→ `progress = task.progress`。
- `snapshot.phase === 'downloading' && taskId` 变化时，调 `downloadSdk.getTaskStatus({ taskId })` 回填（中途进入页面不从 0 开始）；返回空（重启后内存中无任务，agent 调研的 3d）就保持不确定进度。
- 阶段离开 `downloading` 或 taskId 变化时清空；卸载时解除订阅。
- 进度事件 1s 节流（`download-center.ts:101`），足够平滑，不另做插值。

## 8. 设置项

- **「自动更新」开关**（PRD R3a）：`modelValue = autoDownload`；开启 → `updateSettings({autoDownload: true, installOnNormalQuit: true})`，关闭 → 两者都写 false；失败回滚并 toast。原 `installMode` 计算、`installModeOptions`、`handleInstallModeChange` 删除。
- 频率、通知、渠道、Renderer Override 的保存逻辑不变，只挪位置、去描述。

## 9. 主进程修复

- **F2**（渲染端）：`useUpdateRuntime.handleDownloadUpdate` 改用 `DOWNLOAD_START_TIMEOUT = 30_000`。主进程最坏耗时 ≈ manifest 8s（`update-system.ts:1069`）+ addTask，`resolveReleaseForDownload` 只查库。页面上的「下载更新」在请求期间保持 loading。成功 toast 改为「已开始下载更新」，不再指向普通用户看不到的下载中心。
- **F3**（主进程）：`synchronizeCachedCheckResult` 在 `markAvailableLifecycle` 成功且返回阶段为 `available` 时，追加 `void this.maybeAutoDownloadLifecycle(result.release)`。门控与联网路径完全相同（已打包、`autoDownload === true`、tag 不在 `autoDownloadTasks`），失败或完成会清理 map（`UpdateService.ts:1009,1046,1064,1118`），因此不会卡死，也不会紧循环。冲突分支（已有活跃尝试）维持原样，不触发。
- **F13**（渲染端，实施期追加）：`checkApplicationUpgrade(force, { presentDialog })`，`presentDialog` 默认 true。更新页的两处强制检查（「检查更新」、切换渠道）传 `false`，不再弹出会阻塞页面的「发现新版本」对话框，检查结果由状态行呈现。其余调用方都是非强制检查，行为不变。
- **版本来源**（实施期修正，F14）：当前版本与 `isBetaBuild` 都取 `useEnv().packageJson.version`，不再读 `startupInfo.version`（那是 `'dev' | 'release'` 枚举）。首份快照和包版本都到达之前，状态卡保持骨架；状态请求返回之后即使包版本仍未到，也照常渲染，并退回使用快照里的 `currentVersion`。

## 10. 文案

新增（zh / en）：

| key（`settings.settingUpdate.` 下） | zh | en |
|---|---|---|
| `status.latest` | 已是最新版本 | You're up to date |
| `status.currentVersion` | 当前版本 {version} | Version {version} |
| `status.checking` | 正在检查更新… | Checking for updates… |
| `status.available` | 发现新版本 {version} | {version} is available |
| `status.preparing` | 正在准备下载 {version} | Preparing to download {version} |
| `status.downloading` | 正在下载 {version} | Downloading {version} |
| `status.verifying` | 正在校验 {version} | Verifying {version} |
| `status.ready` | {version} 已就绪 | {version} is ready |
| `status.readyOnQuit` | 退出 Tuff 时会自动安装 | Installs when you quit Tuff |
| `status.installing` | 正在安装 {version} | Installing {version} |
| `status.finishing` | 正在完成更新 | Finishing the update |
| `status.recovering` | 更新未完成，正在恢复上一版本 | Update didn't finish — restoring the previous version |
| `status.failed` | 更新失败 | Update failed |
| `status.progressDetail` | {downloaded} / {total} · {speed}/s | {downloaded} of {total} · {speed}/s |
| `actions.retry` | 重试 | Try again |
| `actions.openDownloadPage` | 前往官网下载 | Get the official build |
| `authenticity.title` | 当前不是官方正版 Tuff | This isn't an official Tuff build |
| `authenticity.description` | 无法确认它来自官方发布且未被修改，请从官网重新下载安装。 | Tuff can't confirm this copy came unmodified from an official release. Download it again from the official site. |
| `history.title` | 更新历史 | Update history |
| `history.outcome.updated` / `rolledBack` / `failed` | 已更新 / 已回滚 / 失败 | Updated / Rolled back / Failed |
| `history.showMore` / `showLess` | 显示更多 / 收起 | Show more / Show less |
| `advancedTitle` | 高级 | Advanced |
| `autoUpdate` | 自动更新 | Automatic updates |
| `messages.autoUpdateSaved` | 自动更新设置已保存 | Automatic update setting saved |

修改：`update.download_started` → 已开始下载更新 / Update download started。

删除：只删**本次改动**让它失去引用的 key，逐个 grep 确认没有其他消费者；本来就是死 key 的只报告、不顺手删。候选：`groupTitle`、`groupDesc`、`channelDescRelease`、`channelDescBeta`、`frequencyDesc`、`notifyOnUpdateDesc`、`installOnNormalQuitLocked`、`installMode.*`、`messages.installModeSaved`、`autoDownloadDesc*`、`actions.*Desc`、`actions.waitForLifecycle`、`assetsDesc`、`evidenceDesc`、`nativeTrust.*`、`lifecycle.phases.*`（如 grep 确认只剩 `resolveUpdateLifecycleDisplay` 的 key 字符串拼接，函数保留供诊断用，key 字段一并去掉）。

两个 locale 文件当前被另一会话改动中（git status 已脏）：**只用精确字符串 Edit 局部修改，禁止整文件 load/dump 重写**。

## 11. Spec 变更（`release-testing.md`）

- §3 第 212 行改为：`SettingUpdate` 在三个桌面平台消费同一个 typed 真伪投影（由 `BuildVerificationStatus` 推出 `official | unofficial | unknown`）；`unofficial` 时渲染不可关闭的 `role=alert` 危险 banner，含单一标题/说明 key 和官方下载页入口；`official` 与 `unknown`（状态未到）都不渲染。macOS native-trust 投影（`pass | unverified | not-applicable` 及 reason）只作为诊断证据契约，不再驱动 UI 文案。删掉已不存在的 `SettingHeader`、运行时徽章、红色页头边等描述。
- §4 矩阵增加一行：任意桌面平台 unofficial / failed attestation → banner；official → 无；未加载 → 无。

## 12. 兼容性

- 旧设置值全部沿用；`autoDownload=true, installOnNormalQuit=false` 的用户开关显示为开，行为不变，直到用户自己拨动开关。
- 新 transport 事件只增不改；老渲染端不调用它。
- 诊断 JSON schema 不变。

## 13. 取舍

- 15s 宽限计时器 vs 在主进程快照里暴露「自动下载进行中」：后者更准，但要改生命周期契约。宽限计时器只动渲染端，兜底覆盖所有「自动下载没起来」的情况。
- 历史卡不做骨架屏（§6 已说明）。
- 渠道描述（Beta 风险说明）按用户「描述显而易见就删」的要求去掉。7/31 任务曾要求「Beta 明确标示预览风险」，由本次决定取代。现在渠道行只对 beta 构建、已选 Beta 或开发者模式的用户可见，他们都清楚 Beta 的含义。

## 14. 回滚

改动集中在上表文件，彼此无数据迁移，整体 revert 即可回滚。F3 可单独回退（一行调用 + 测试）。
