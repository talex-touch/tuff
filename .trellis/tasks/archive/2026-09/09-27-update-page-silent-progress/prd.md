# 更新设置页重构：默认静默更新 + 进度可见 + 高级项收纳

## Goal

更新页只回答一个问题：**更新走到哪了**——已是最新 / 正在下载 N% / 已就绪只差重启。更新默认全自动、静默完成，用户唯一要做的是重启；渠道、频率、安装方式等配置收进「开发者模式」（高级选项）。页面下方给出本机的更新记录。

## Background

- 2026-09-27 飞书反馈（Crosery，官方 beta 包）：页面显示「发现可用更新 + 官方认证 + 下载更新」，点击「没反应」、看不到进度条，后来才知道后台早已在下载。
- 用户（TalexDreamSoul）对当前页面的要求。当前页面是：红色「macOS native trust 未验证」大块 + code + 三条风险；渠道/频率/安装方式/通知/「空闲」状态/诊断证据各带一段长描述。
  1. 渠道等功能：非 beta 版本默认隐藏，开启高级设置后再出现。
  2. 检查频率也隐藏。
  3. 不需要「官方认证」tag；**不是正版时**弹一个红色 banner 提醒即可。
  4. 让用户知道下载中 / 进度 / 安装中；默认自动更新、静默更新，用户只需重启，不要这么多复杂设置。
  5. 「空闲」这类状态没必要。
  6. 显而易见的 desc 都清理掉。
  7. 页面下方加一个「更新历史」卡片。
- 规划问答中的决策（2026-09-27，用户选定）：
  - **D1** 更新历史 = **本机更新记录**，不是版本更新日志，不恢复 F12 删掉的远端管线。
  - **D2** F2、F3 两处根因本任务一起修。
  - **D3** 高级区用一个「自动更新」开关取代三选一安装方式。
  - **D4** 非正版 banner 覆盖 **macOS / Windows / Linux** 三个平台，用户已知悉 Windows/Linux 误报风险。
  - 另：按第 6 条要求删掉渠道的 Beta 风险描述，取代 7/31 任务里「Beta 明确标示预览风险」的旧要求。渠道行现在只对 beta 构建、已选 Beta 或开发者模式的用户可见。

## Technical Notes（证据，均已读代码核实）

- **F1 进度数据存在但页面没接**：生命周期快照没有进度字段（`packages/utils/types/update.ts:184-204`）；页面只订阅了 `onTaskCompleted`（`SettingUpdate.vue:291-304`）。下载中心对 APP_UPDATE 任务照常推 `task-progress`，载荷是完整 `DownloadTask`，含 `progress.{percentage,downloadedSize,totalSize,speed,remainingTime}`，按任务 1s 节流（`download-center.ts:101,1409-1418`）；`snapshot.taskId` 即下载任务 id（`UpdateService.ts:936-941`）；挂载时可用 `getTaskStatus({taskId})` 取内存中的任务（`download-center.ts:909-919`）。
- **F2「点了没反应」根因**：渲染端 `update:download` 走默认 4s 超时（`useUpdateRuntime.ts:38` + `handleDownloadUpdate`）；主进程先拉 manifest（`timeoutMs: 8000`，`update-system.ts:1066-1071`），拿到结果后才 `transitionToDownloading`（`UpdateService.ts:945-956`）。这期间阶段停在 `available`、按钮还在，渲染端报超时失败，主进程照常开始下载。`resolveReleaseForDownload` 只查库（`UpdateService.ts:1714-1730`），因此最坏耗时 ≈ manifest 8s + addTask。
- **F3 自动下载的缺口**：只有联网检查会调 `maybeAutoDownloadLifecycle`（`UpdateService.ts:1373-1379`）；命中缓存/持久化结果时 `synchronizeCachedCheckResult`（`UpdateService.ts:967-983`，调用点 `:1255-1295`）只标 `available`。重启后 12h 频率窗口内，即便 `autoDownload=true`，更新也会停在「发现可用更新」等人点。自动下载的记账在失败或完成时会清理（`UpdateService.ts:1009,1046,1064,1118`）。
- **F4 默认值本来就是自动**：主进程默认 `autoDownload: true`、`installOnNormalQuit: true`、`frequency: 'everyday'`（12h）（`UpdateService.ts:1881-1905`）；渠道默认取当前构建后缀，beta 构建默认 BETA（`UpdateService.ts:1829-1846`）。`lastCheckAt` 来自 `settings.lastCheckedAt`（`UpdateService.ts:776,802`）。
- **F5 安装行为**：`installOnNormalQuit && rollbackCompatible` 时，`ready` 后下一次正常退出自动安装（`update-install-coordinator.ts:106-178`）；否则停在 `ready`，直到 `update:install` 或点就绪通知。「自动下载并立即安装」名不副实：并不会立即安装。`rollbackCompatible` 在开始下载前恒为 false（DB 默认），所以「该版本没有权威 N/N-1 降级兼容证据…」这句锁定文案在 idle/available 阶段对**每个版本**都会出现（`SettingUpdate.vue:172-176`）。
- **F6 各平台安装**：macOS 替换 `.app` 并重启；Windows 拉起交互式安装器（非静默）；Linux 替换 AppImage 重启或 `pkexec` 装 deb（`update-platform-adapter.ts:171-258`）。
- **F7 正版校验**：CI 打包在三个平台都写构建证明（`scripts/build-target/after-pack.js:319-331`，需 `RELEASE_SIGNING_PRIVATE_KEY`）；主进程运行时校验与平台无关，都会计算 `BuildVerificationStatus`（`build-verification/index.ts:53-146`）；dev 构建 `isOfficialBuild=false`（`:62-69`）。渲染端投影目前只覆盖 macOS，且在状态加载完成前就判定为 unverified（`update-diagnostic-evidence.ts:26-53`）。macOS 非官方构建会阻止安装（`MAC_UPDATE_BUILD_UNTRUSTED`），但不阻止自动下载。
- **F8「高级设置」= 开发者模式**：`appSetting.dev.developerMode`（响应式，`app-storage.ts:61`），关于页开关文案「显示内部插件与高级选项（谨慎使用）」（`SettingAbout.vue:62-67,272-274`）；路由 `requiresAdvanced`、设置分类、`SettingFileIndex.vue:122-126` 都以它为准。旧的 `dev.advancedSettings` 已退役（`SettingUpdate.channel.test.ts` 仍在 mock 旧 key）。
- **F9 spec 约束**：`.trellis/spec/frontend/release-testing.md:212` 要求 macOS unverified 时渲染不可关闭的 `role=alert` 危险块并带「稳定 reason/risk keys」，且非 Darwin 不得显示危险样式；该条提到的 `SettingHeader` 已不存在。
- **F10 官方下载页**：`${NEXUS_BASE_URL}/updates`（`packages/utils/env/index.ts:1`，关于页已按同样方式拼 `/license`）。
- **F11 历史数据**：`app_update_attempts` 表记录每次更新尝试（`currentVersion`→`targetVersion`、`phase`、`error*`、`createdAt/updatedAt/terminalAt`，`db/schema.ts:1384-1421`），终态 `healthy`/`recovered`/`failed`/`idle`（`update-attempt-repository.ts:20`），无清理逻辑。
- **F12 前车之鉴**：2026-07-31 `1ffc59ec2`（任务 `archive/2026-07/07-31-remove-version-history`）按用户要求**彻底移除**远端版本日志浏览（列表/详情请求、离线缓存、transport 事件、SDK 方法），只保留升级后一次性「本次更新」摘要与已读状态。
- **F13「点了没反应」的第二个成因**（2026-09-27 真机复现，截图 `/tmp/tuff-update-page/16-after-check.png`）：
  - 强制检查 `checkApplicationUpgrade(true)` 会绕过「自动下载时不弹框」的提前返回（`useUpdateRuntime.ts` 的 `autoDownload && !force`），弹出模态「发现新版本」对话框，并 `await` 到对话框关闭。
  - 更新页在这之后才刷新缓存的 release，所以对话框开着时页面的「下载更新」一直是禁用的；关掉对话框，按钮立即可点。
  - 打包版开着自动下载时，主进程此时已在后台下载，对话框却还在问要不要下载。
  - 只有 `SettingUpdate.vue` 以 `force=true` 调用它。
- **F14 `startupInfo.version` 不是版本号**：它是 `TalexTouch.AppVersion` 枚举 `'dev' | 'release'`（`core/touch-app.ts:373`）。真实版本取 `useEnv().packageJson.version`，与侧栏一致（`ShellSidebar.vue:30,83`）。

## Requirements

- **R1 默认视图**（开发者模式关、release 构建）只有：非正版时的红色 banner、状态行、有记录时的更新历史卡。
- **R2 渠道行**：当前构建为 beta **或** 已选渠道为 Beta **或** 开发者模式开启时显示。后两条保证 release 用户切到 Beta 后关掉开发者模式，仍能切回来。
- **R3 开发者模式开启时**额外显示「高级」卡：检查频率、「自动更新」开关、通知开关、GitHub 下载包、导出诊断；Renderer Override 仍需 env，并收进高级卡。
- **R3a「自动更新」开关**（D3）取代三选一「安装方式」下拉：
  - 开关值 = `autoDownload`。
  - 打开写 `{autoDownload: true, installOnNormalQuit: true}`（默认）；关闭写 `{autoDownload: false, installOnNormalQuit: false}`，即仅提醒、手动下载与安装。
  - 不再提供「自动下载但手动安装」中间档。此前选过它的用户（`autoDownload=true, installOnNormalQuit=false`）保持原值，开关显示为开，直到自己拨动。
  - 锁定文案（F5）随下拉一起删除。
- **R4** 删除「官方认证」徽标（`SettingUpdate.vue:782-785`）；官方构建不显示任何信任标记。
- **R5 非正版 banner**（D4，三个桌面平台）：
  - 依据 `BuildVerificationStatus`（F7）：`isOfficialBuild && hasOfficialKey && !verificationFailed` 为官方，否则为非官方；状态未加载完之前不渲染，避免闪一下。
  - 非官方时显示红色、`role=alert`、不可关闭的 banner：一句标题 + 一句说明 + 「前往官网下载」（F10）。不再显示 code 串和三条风险列表。
  - 官方构建什么都不显示。
- **R6 状态行**按生命周期阶段呈现（design §3），全页不再出现「空闲」：
  - 检查过且无更新：「已是最新版本」+ 当前版本 + 「检查更新」。
  - 从未检查或刚回滚：当前版本 + 「检查更新」。
- **R7 下载中**：
  - 确定进度条 + 百分比 + 已下载/总大小 + 速度。
  - 首个进度事件到达前，显示不确定进度条。
  - 页面在下载中途挂载时，用 `getTaskStatus` 回填进度。
- **R8** 校验中 / 安装中 / 等待健康确认 / 恢复中：不确定进度条 + 一句状态，无按钮。
- **R9 已就绪**：「X 已就绪」+ 主按钮（macOS「重启并更新」，Windows/Linux 沿用现有平台文案）。会在退出时自动安装的，加一行「退出 Tuff 时会自动安装」。macOS 非官方构建安装必被拦，状态行不放按钮，改为一行说明「非官方版本无法自动安装，请从官网下载」；官网入口只由横幅提供，同一张卡里不出现两个相同按钮。
- **R10 失败**：错误原因 + 「重试」（强制检查）。
- **R11 手动下载不误报、不重复**（修 F2，D2）：
  - `update:download` 渲染端超时提到 30s，覆盖主进程最坏耗时（manifest 8s + addTask）。
  - 点击后按钮保持 loading，直到阶段离开 `available` 或请求明确失败。
  - 自动下载开启时，发现新版本后 15s 内不显示「下载更新」（显示「正在准备下载」），避免与自动下载重复触发；超过 15s 仍未开始才出现手动按钮兜底。
  - 下载开始 toast 不再指向普通用户看不到的下载中心。
- **R12 描述清理**：只保留 banner 说明句与 Renderer Override 描述，其余行不再带描述。中英文案同步；只删除本次改动导致失去引用的 key（逐个确认零引用），原本就是死 key 的只报告、不删。
- **R13** 同步更新 `release-testing.md` §3 第 212 行与 §4 矩阵（F9，design §11）与受影响测试。
- **R14 更新历史卡**（D1）：
  - 状态卡下方独立一张卡，数据来自本机 `app_update_attempts`（F11），经新增的 `update:service:get-history` 读取。
  - 每行 = 目标版本 + 时间 + 结果（已更新 / 已回滚 / 失败）。
  - 只收录 `healthy`/`recovered`/`failed` 且有 `targetVersion` 的尝试，按版本去重、保留最新。
  - 默认 5 条，可展开到至多 20 条；终态变化时刷新；为空时不渲染整张卡。
  - 不联网、不含 changelog。
- **R15 加载态**：状态卡在首份快照到达前用 `SettingSkeleton` + `useDeferredLoading` 占位，版式贴合真实行。历史卡不做骨架：它可能为空，骨架出现后又消失反而是更大的跳动；本机查询很快。
- **R16 缓存路径也自动下载**（修 F3，D2）：命中缓存或持久化检查结果、并把尝试标为 `available` 时，与联网路径走同一个 `maybeAutoDownloadLifecycle`。门控相同：已打包、`autoDownload === true`、该 tag 未在下载。这样「默认自动更新」在重启后依然成立。
- **R17 页面发起的检查不弹对话框**（实施期真机复现后追加，F13）：更新页的「检查更新」和切换渠道调用 `checkApplicationUpgrade(true, { presentDialog: false })`，结果只由状态行呈现。其余调用方（非强制检查）行为不变。

## Acceptance Criteria

- [ ] **AC1（R1/R4/R6）** 开发者模式关 + release 构建 + 官方：只有状态行（有记录时加历史卡）；无渠道、频率、自动更新、通知、下载包、诊断行，无「官方认证」、无「空闲」。证据：组件测试 + 真机截图。
- [ ] **AC2（R2）** beta 构建默认显示渠道行；release 构建但已选 Beta 也显示；release 构建 + 已选 Release + 开发者模式关则隐藏。原有渠道保存/回滚/禁用行为保持。证据：组件测试。
- [ ] **AC3（R3/R3a）** 开发者模式开：高级卡各行出现；自动更新开关开/关分别写入两个标志，保存失败回滚。证据：组件测试 + 真机持久化。
- [ ] **AC4（R7）** 真机下载 `v2.4.14-beta.47`：进度条随下载推进，显示百分比/大小/速度；离开页面再回来，进度立即回填。证据：截图。
- [ ] **AC5（R11）** 点「下载更新」后 8s 内无失败 toast，按钮 loading 直至进入下载中。证据：真机操作 + 单测（下载请求用 30s 超时）+ 宽限边界单测。
- [ ] **AC6（R16）** 单测三种情况：缓存命中 + autoDownload → 触发自动下载；autoDownload=false → 不触发；已有活跃尝试 → 不触发。单文件撤回该调用后测试变红。
- [ ] **AC7（R5/R9）** 单测：official → 无 banner；unofficial（三平台任一）→ banner + 下载入口；状态未加载 → 无 banner；macOS unofficial 且 ready → 状态行无按钮、显示「非官方版本无法自动安装」说明，整张卡只有横幅一个「前往官网下载」。真机 dev 构建显示新 banner。实物校验 `v2.4.14-beta.47` 的 Windows x64、Linux x64 官方资产的构建证明为 valid；做不到则在报告中写明「Windows/Linux 未验证」。
- [ ] **AC8（R14）** 单测覆盖映射、去重、limit 夹取、空列表；组件测试：空时不渲染卡，超过 5 条时出现「显示更多」。真机截图。
- [ ] **AC9（R6/R8/R9/R10）** `resolveUpdateStatusView` 表驱动测试覆盖 design §3 每一行。
- [ ] **AC10（R15）** 组件测试：首份快照未到时渲染骨架而非状态行。
- [ ] **AC11（R12/R13）**
  - 两个 locale 文件 `JSON.parse` 通过，新 key 两边齐全，删除的 key 零引用。
  - `release-testing.md` 已更新。
  - 聚焦测试（core-app + utils）通过。
  - `tsc -p tsconfig.node.json` 与 `vue-tsc -p tsconfig.web.json` 在本任务文件范围内 0 错误，且正向对照能报错。
  - 改动文件的 prettier/eslint 问题数不高于 HEAD。
  - `git diff --check` 干净。
- [ ] **AC12（R17）** 真机：在更新页点「检查更新」或切换渠道，不出现对话框，状态行直接进入「正在准备下载」或「发现新版本」，下载按钮随即可点。单测：`presentDialog: false` 时强制检查不调用对话框，默认调用仍然弹框。
- [ ] **AC13（F14）** 状态行显示真实版本（如 `v2.4.14-beta.46`），不出现 `vdev` / `vrelease`；release 构建选 Release 渠道时隐藏渠道行，beta 构建选 Release 渠道时仍显示。单测按真实形态 mock `startupInfo.version = 'release'`。

## Out of Scope（报告，另开 issue；不在本任务修）

- Windows 静默安装（NSIS `/S`）：现为交互式安装器（F6）。
- macOS 非官方构建仍会自动下载，到 `ready` 后才被拦（F7）。
- 调研到但未逐条核实的主进程下载缺陷：
  - 下载中途重启后任务不恢复，生命周期卡在 `downloading`。
  - 手动/自动并发 addTask 竞态（本任务用 15s 宽限在 UI 侧规避，根因未修）。
  - 下载启动失败会留下孤儿任务。
  - 在 `verifying`/`ready` 阶段误调下载，会把已就绪更新打成 `failed`。
- APP_UPDATE 任务也会触发通用「下载完成」通知（`download-center.ts:1437-1442`）。
- `components/download/UpdatePromptDialog.vue` 无任何引用（死代码）。
- 本次改动之前就存在的死 i18n key（只列出，不删）。
- 实施期发现、按「只报告不扩范围」留下的旧问题：
  - 「发现新版本」对话框正文空白，更新说明没渲染。
  - 同一错误版本来源（F14）的两处旧用法：诊断导出 `installedVersion.current`（已加注释），以及 `useUpdateRuntime.resolveVersion`。
  - 频率、通知、Renderer Override 三行保存失败不回滚（`v-model` + handler，已加注释）。
  - `UpdateEvents.ignoreVersion` 只写设置、不标记跳过，缓存路径可能自动下载被它忽略的版本（当前 UI 走 `recordAction('skip')`，触发不到）。
  - `app_update_attempts` 无清理，每次无更新的检查都会写一行 idle。
