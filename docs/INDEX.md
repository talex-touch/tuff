# 文档索引

> 更新时间：2026-05-13
> 本页仅保留入口与高价值快照；历史细节以 `docs/plan-prd/01-project/CHANGES.md` 为准。

## 主要入口

- `docs/plan-prd/README.md` - PRD / 规划主索引（里程碑 + 未闭环能力）
- `docs/plan-prd/TODO.md` - 执行清单（含单一口径矩阵与优先级）
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md` - 产品总览 + 路线图
- `docs/plan-prd/01-project/RELEASE-2.4.7-CHECKLIST-2026-02-26.md` - v2.4.7 Gate 清单（A~E）
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md` - PRD 质量基线与门禁约束
- `docs/plan-prd/docs/DOC-INVENTORY-AND-NEXT-STEPS-2026-03-17.md` - 文档盘点历史快照（不承载当前路线权威）
- `docs/plan-prd/02-architecture/UNIFIED-LEGACY-COMPAT-STRUCTURE-REMEDIATION-PRD-2026-03-16.md` - Legacy/兼容/结构治理统一实施 PRD（单一蓝图）
- `docs/plan-prd/02-architecture/aiapp-single-stream-runtime.md` - AI / DeepAgent 单流运行时权威说明（含完整流程图、seq 合同、审计结论）
- `docs/plan-prd/02-architecture/intelligence-power-generic-api-prd.md` - Intelligence 能力路由与 Provider 抽象入口
- `docs/plan-prd/02-architecture/nexus-provider-scene-aggregation-prd.md` - Nexus Provider 聚合与 Scene 编排重构 PRD
- `docs/plan-prd/03-features/ai-2.5.0-plan-prd.md` - Tuff 2.5.0 AI 桌面入口收口 Plan PRD
- `docs/plan-prd/report/cross-platform-compat-placeholder-deep-review-2026-05-13.md` - 跨平台兼容与占位/假实现深度复核报告
- `docs/plan-prd/report/cross-platform-compat-placeholder-review-2026-05-12.md` - 跨平台兼容与占位/假实现复核报告
- `docs/plan-prd/report/coreapp-startup-async-blocking-analysis-2026-05-13.md` - CoreApp 启动异步化与首屏卡顿分析
- `docs/plan-prd/report/cross-platform-compat-placeholder-audit-2026-05-10.md` - 跨平台兼容与占位/假实现审计报告（历史基线）
- `docs/engineering/README.md` - 工程过程资料索引（plans / issues / code-review / reports）
- `docs/plan-prd/01-project/CHANGES.md` - 全历史变更记录（唯一历史源）

## 文档盘点快照（2026-03-19）

- 全仓 Markdown：`396`；其中 `docs`：`146`。
- `docs` 内部分布：`plan-prd 110`、`engineering 20`、其他专题入口 `16`。
- `plan-prd` 子域：`03-features 32`、`docs 20`、`04-implementation 17`、`01-project 12`、`05-archive 11`、`02-architecture 8`、`06-ecosystem 4`。
- 统计口径历史快照：`docs/plan-prd/docs/DOC-INVENTORY-AND-NEXT-STEPS-2026-03-17.md`；当前路线以六主文档与 `TODO/CHANGES` 为准。

## 状态快照（2026-05-13，统一口径）

- **当前工作区基线**：`2.4.10-beta.22`（根包与 CoreApp 对齐）。
- **2.4.10-beta.22 发布准备（2026-05-13）**：`build-and-release` 支持 tag push 触发 beta pre-release；`v2.4.10-beta.21` 已存在，下一次新 beta 使用 `v2.4.10-beta.22`。本轮已补 `notes/update_2.4.10-beta.22.{zh,en}.md`，合入 Widget/CLI 最新修复、兼容性复核记录，并延续 OmniPanel Gate、Utils Package CI 与 macOS beta build 准备结果；完整 `quality:pr` 仍被 `retired-ai-app` 既有 lint 债务阻断。
- **2.4.10 当前主线**：优先解决 Windows App 索引、Windows 应用启动体验与基础 legacy/compat 收口；Windows App Search & Launch Beta 已开始落地应用索引管理页、Steam 最小 provider 与 `protocol` 启动白名单；不把全部跨平台回归压进 `2.4.10`。
- **2.4.10 Windows 发版 gate**：功能实现与本地 verifier 已进入收口态，但当前版本发版必须先补齐 Windows 真机 evidence 与性能 evidence；当前最需要做的是在 Windows 真机生成 acceptance collection plan，并按同一清单补齐 Windows acceptance manifest 最终强门禁、聊天应用/Codex/Apple Music 常见 App 启动、复制 app path 加入本地启动区、Everything target probe、自动安装更新、DivisionBox detached widget、分时推荐，外加 search trace `200` 样本和 clipboard stress `120000ms` 压测；Nexus Release Evidence 写入闭环仍是发版阻塞项。
- **立即执行顺序（2026-05-13）**：先确认工作区本地噪声不混入提交，再生成 Windows acceptance collection plan，随后采集 case/manual/performance evidence，运行 `windows:acceptance:verify` final gate，最后写入 Nexus Release Evidence；`2.5.0` AI、Provider Registry 高级策略与 SRP 大拆分不得抢占正式 `2.4.10` gate。
- **2.4.11 必解门槛**：剩余 Windows/macOS 阻塞级人工回归、Linux best-effort 记录、Release Evidence 写入闭环、legacy/compat/size 清册退场项必须关闭或显式降权。
- **User-managed launcher foundation（2026-04-22）**：`appIndex` typed domain 已新增 `listEntries / upsertEntry / removeEntry / setEntryEnabled`，settings SDK 与 main channel handler 全链路接通；`app-provider` 复用现有 `files + file_extensions` 支持 user-managed launcher entry，并继续走搜索与启动链路。
- **应用索引管理与诊断（2026-05-13）**：文件索引高级设置新增“本地启动区 / 应用索引管理”，复用 `settingsSdk.appIndex.listEntries/addPath/setEntryEnabled/removeEntry/diagnose/reindex` 管理手动应用条目；支持选择 `.exe/.lnk/.appref-ms`、粘贴 `%ENV%` 路径/UWP shell path/裸 AppID，添加后立即触发关键词重建与诊断；既有应用搜索诊断可按路径、bundleId、名称或搜索词查看 `displayName / alternateNames / keywords` 与 precise / prefix / FTS / N-gram / subsequence 命中情况，并支持单项关键词重建或重新扫描。
- **Steam 最小支持（2026-05-13）**：Windows AppProvider 扫描链路新增 Steam provider，解析注册表/常见 Steam 根、`libraryfolders.vdf` 与 `appmanifest_*.acf`，索引为 `bundleId=steam:<appid>`、`launchKind=protocol`、`launchTarget=steam://rungameid/<appid>`；AppLauncher 仅白名单允许 `steam://rungameid/<numeric>` 并通过 `shell.openExternal` 启动。
- **Release Evidence API（2026-04-26）**：Nexus 新增 `/api/admin/release-evidence/*`，作为 CoreApp 回归、文档门禁与平台阻塞矩阵的 D1 证据入口；管理员登录态或 `release:evidence` API key 可写入。
- **Nexus 插件发布管理（2026-05-14）**：插件发布入口继续收敛在 `/dashboard/assets`，不新增 `/dashboard/plugins` 页面路由；Dashboard plugin API 支持登录态与 `plugin:read/plugin:publish` API key，创建插件可同请求初始化首版；CoreApp Store 新增 `/store/publisher` 发布管理 tab，并通过 `auth:nexus-upload` 代理 `.tpex` multipart 上传。
- **macOS 中文应用名召回修复（2026-04-26）**：应用扫描会保留本地化名称为 `alternateNames`，关键词同步与搜索后处理都会使用中文、全拼与首字母，避免 Spotlight 英文显示名优先时漏召回“网易云音乐”等应用。
- **CoreApp 2.4.11 前置口径（2026-05-08）**：当前主线切换为 `2.4.10 Windows App 索引 + 基础 legacy/compat 收口`；剩余跨平台回归与清册退场项统一列入 `2.4.11` 必解清单。
- **CoreBox App 搜索排序修复（2026-05-10）**：跨 provider 排序优先可见标题命中，plugin feature 的隐藏 token/source 命中降为低置信召回信号；隐藏 token/fuzzy-token/source fallback 召回会限制 frequency/recency 行为信号上限，App 标题前缀/词首/子串命中获得有限 intent bonus，App 精确别名 token（如 `vsc` / `vscode`）和别名前缀 token（如 `vscod -> vscode`）也作为明确 App intent，`Visual Studio Code` 这类标题后续单词或别名命中不再被中等频次的可见 feature 抢占首位，同时保留极高频可见 feature 的自学习前置能力。
- **CoreBox AI Ask 2.5.0 Stable 切片（2026-05-10）**：`touch-intelligence` 已作为首个最小可见实现切片接入 `text.chat` 与 `vision.ocr`；CoreBox 文本问题直接 Chat，剪贴板图片在空文本或显式 `ai` 提问时先 OCR 再回答，并补齐 pending/ready/error 状态、权限拒绝/provider 不可用/quota/模型不支持/OCR 空结果提示、`caller/entry/featureId/requestId/inputKinds/capabilityId` 审计 metadata 与复制回答 `clipboard.write` 权限检查。
- **Tuff 2.5.0 AI Plan PRD、Nexus Invoke 与 OmniPanel Writing Tools（2026-05-14）**：AI 桌面入口收口 PRD 已从 Scope Lock 进入 dev/2.5.0 实现；CoreApp 默认 `tuff-nexus-default` provider 通过登录态 `/api/v1/intelligence/invoke` 自动调用 Nexus Intelligence Provider / Provider Registry mirror 与 secure-store credential，未登录时显式 `NEXUS_AUTH_REQUIRED` 并 fallback 到其它可用 provider；OmniPanel Writing Tools MVP 已接入划词 AI 翻译/摘要/改写/解释/Review、结果预览、transient Desktop Context Capsule、copy/retry/replace clipboard 二次确认与 Nexus invoke smoke；下个版本继续落地 Workflow `Use Model` 节点、完整 Review Queue 与剪贴板整理/会议纪要/文本批处理模板；Stable 只承诺文本 + OCR，Scene runtime 全量编排仍属 2.5.x 后续。
- **复制 app path 加入应用索引回归（2026-05-10）**：SystemActionsProvider 覆盖 Files/text/file URL 中的 `.exe/.lnk/.appref-ms/.app` 路径识别，并支持复制未加引号或带引号、含空格且带参数的 Windows app 命令行、`%LOCALAPPDATA%` / `%USERPROFILE%` 等 `%ENV%` Windows 路径、Windows UWP `shell:AppsFolder\\...` 虚拟路径或裸 `PackageFamily!App` AppID；动作执行会调用 `appProvider.addAppByPath()`，写入 `entrySource=manual / entryEnabled=1` 本地启动区条目并进入应用索引链路，ClickOnce `.appref-ms` 已补 Start Menu 扫描、实时变更和单项解析回归。
- **Windows App 诊断证据导出（2026-05-10）**：Settings App Index diagnostic 可复制/保存 `app-index-diagnostic-evidence` JSON，记录路径、关键词、FTS/N-gram/subsequence 命中、reindex 状态、shortcut launchArgs/workingDirectory、`rawDisplayName/displayNameStatus`、`iconPresent` 与失败原因；新增 `app-index:diagnostic:verify` 可离线复核 target 命中、query stage、launchKind、launchTarget、launchArgs、workingDirectory、bundle/appIdentity、clean/fallback displayName、索引图标存在、reindex 与 reusable caseId 门禁，Windows 真机应用验收仍需使用该证据入口补样本。
- **App Index 诊断证据一致性（2026-05-11）**：`app-index:diagnostic:verify` 会从 `stages.*.targetHit` 重新推导 `matchedStages`，并要求命中 stage 包含目标 `itemId`、`matchCount` 与 matches 数量一致；未运行 stage 不得携带命中或 matches，未命中 target 的 stage 不得携带 matches；input/diagnosis/manual suggested fields/app/reindex path 也必须指向同一目标，且成功 reindex 在存在 app 实体字段时必须对齐 app path/launchTarget/appIdentity/bundleId，避免复制 app path 或普通 App 索引验收被手工拼接的弱 JSON 误收。
- **Everything 诊断证据一致性（2026-05-10）**：`everything-diagnostic-evidence` 复核会校验 verdict 与 status 的 backend/health/errorCode、`hasBackendAttemptErrors` 标记、`ready` 与 enabled/available、available/backend、health/available、active backend/fallback chain、available 状态下 stale error 字段、active backend attempt error、backendAttemptErrors 必须来自 fallback chain 且错误文本非空，以及 CLI backend `esPath/version` 一致性，避免 Settings 导出的证据把 sdk-napi/cli 后端尝试错误、不可用状态或 CLI 路径缺失抹掉后仍被 acceptance 层误收；目标查询命中仍由 Windows capability evidence 的 Everything target probe 与 acceptance case 复算承担。
- **Windows 能力证据 CLI（2026-05-10）**：新增 `windows-capability-evidence/v1` 与 `pnpm -C "apps/core-app" run windows:capability:evidence`，可在 Windows 真机采集 PowerShell、Everything CLI、Everything 基础查询、Everything 目标关键词查询、`Get-StartApps`、registry uninstall fallback、Start Menu `.lnk/.appref-ms/.exe`、`.lnk` target/arguments/workingDirectory 与目标应用命中摘要；`--installer <path>` 只输出 NSIS/MSI handoff dry-run 命令并保持 `unattendedAutoInstallEnabled: false`，`windows:capability:verify --requireEverythingTargets` 会同时要求 Everything 基础查询成功返回结果、目标 probe 命中且至少有一条样本文本包含目标关键词，`windows:capability:verify` 还可把 UWP/registry/shortcut/`.appref-ms`/shortcut args/shortcut cwd/target/installer 要求升级为硬门禁，非 Windows 明确输出 `skipped`。
- **Windows 验收 Manifest 复核（2026-05-10）**：新增 `windows-acceptance-manifest/v1`、`windows:acceptance:template` 与 `windows:acceptance:verify`，用于生成 blocked 初始清单并汇总复核 Windows required caseId、单项 evidence path/verifier command、search trace、clipboard stress、更新安装手工项与聊天应用/Codex/Apple Music 启动样本；required case 已包含 `windows-copied-app-path-index`，单独要求复制 app path 加入本地启动区后能进入 app-index 诊断与 reindex 链路，并由 `--requireManagedEntry` 复核 `entrySource=manual / entryEnabled=true`；模板会写入 `verification.recommendedCommand`，便于真机证据补齐后直接跑最终强门禁；`windows:acceptance:template -- --writeManualEvidenceTemplates` 可按 manifest 中的 manual evidence path 生成非覆盖式 Markdown 证据模板，`--writeCollectionPlan` 可生成 `WINDOWS_ACCEPTANCE_COLLECTION_PLAN.md` 汇总 case evidence path、capability evidence 采集命令、已替换实际 evidence path 的 verifier command、性能采集/复核命令、manual evidence path 与最终 recommended gate，降低真机回归漏项；CLI 可用 `--requireExistingEvidenceFiles` 校验 case、性能证据与 manual evidence 文件真实存在，`--requireNonEmptyEvidenceFiles` 会进一步拒绝目录或 0 字节 evidence 文件，`--requireCompletedManualEvidence` 会拒绝未勾选 checklist、无 checklist、Evidence 区缺少当前手工模板要求的关键字段或只填 `N/A/TODO/-` 等占位值的手工证据，并在失败项中列出未勾选数量与缺失 Evidence label，便于真机补证；`--requireEvidenceGatePassed` 要求 case evidence、search trace stats 与 clipboard stress summary JSON 的 `gate.passed=true`，同时按 caseId 校验允许的 evidence schema/kind；acceptance 复核会按 case 重新执行 Windows capability、App Index、Everything、Update、search trace 与 clipboard stress 的关键硬门禁，自动 Windows installer handoff 的 update evidence 复算会强制要求安装后版本与下载目标版本匹配，并复核 cached release tag/channel、matching asset 平台/架构/size 与 runtime target 一致，search trace 固定 200 样本、first.result P95 ≤ 800ms、session.end P95 ≤ 1200ms、slowRatio ≤ 0.1，clipboard stress 固定 2 分钟 500/250ms、P95 ≤ 100ms、max scheduler ≤ 300ms、realtime queue peak ≤ 2、drop=0；search trace stats 还会拒绝 paired/session/sample/slow counter、slowRatio 与 percentile 单调性自相矛盾，clipboard stress summary 会拒绝无有效 clipboard 采样、scheduler sample 超过 count、scheduler delay 与 duration 指标倒挂；`clipboard:stress:verify` 最终命令必须携带 `--strict` 强制 `clipboard-stress-summary/v1` schema，避免子证据用弱参数或非标准 schema 跑出 `gate.passed=true` 后被 manifest 误收；`--requireEvidenceGatePassed` 的失败项会带出具体复算原因，便于定位 launchKind、bundle/appIdentity、query stage、reindex、checksum、安装后版本、release/asset 漂移、性能阈值或计数一致性缺口；`--requireCaseEvidenceSchemas` 可进一步要求每个 required case 同时具备 Windows capability evidence 与对应专项 diagnostic evidence，`--requireVerifierCommandGateFlags` 会校验 manifest 内 verifier command、`performance.searchTraceStatsCommand` 与 `performance.clipboardStressCommand` 都携带 release 固定门禁参数，`--requireRecommendedCommandGateFlags` 会校验 `verification.recommendedCommand` 也携带最终强门禁参数、非空 evidence 文件门禁和 completed manual evidence 门禁，`--requireRecommendedCommandInputMatch` 会校验 recommended command 的 `--input` 指回当前 manifest 文件；`--requireCommonAppLaunchDetails` 会要求聊天应用/Codex/Apple Music 等 common app 样本逐项确认可搜索、显示名正确、图标正确、可启动且启动后 CoreBox 立即隐藏，并要求每项写入 `evidencePath`；`--requireCopiedAppPathManualChecks` 会要求复制源、add-to-local-launch-area 动作、本地启动区条目、reindex、搜索命中与从索引结果启动均写入 `manualChecks.copiedAppPath.evidencePath`；`--requireUpdateInstallManualChecks` 会要求 UAC、安装器启动/退出、应用退出释放占用、安装后版本、重启可用与失败回滚逐项确认并写入 `evidencePath`；`--requireDivisionBoxDetachedWidgetManualChecks` 会要求插件 widget 分离窗口逐项确认真实 pluginId、`initialState.detachedPayload` 水合、原始 query 保留、widget surface 渲染且未回退到错误搜索结果并写入 `evidencePath`；`--requireTimeAwareRecommendationManualChecks` 会要求空 query 推荐、早/午两个时段样本、首位推荐随时段变化、频率信号保留与 timeSlot/dayOfWeek 缓存隔离均有模板关键字段证据，避免命令字段漂移、漏项或弱证据假通过。
- **Windows manual evidence 字段收紧（2026-05-11）**：DivisionBox detached widget 手工证据不再接受泛化 `Logs` 字段，必须填写 search query、detached URL/session、detached URL `source` / `providerSource`、observed/expected pluginId、`detachedPayload` itemId/query、截图或录屏与 no-fallback 日志摘录；manifest 结构化字段也会复核 observed session pluginId 与 URL `source` 等于真实 feature pluginId，且 `providerSource=plugin-features`；分时推荐证据必须填写早/午样本、早/午 top item/provider source/recommendation source、频率对照 item/provider source/recommendation source、`timeSlot/dayOfWeek` cache key、截图或录屏与 recommendation trace 摘录，manifest 结构化字段会复核早/午 timeSlot 与 top recommendation 确实不同，且早/午 recommendation source 为 `time-based`、频率对照 source 为 `frequent`。
- **Windows common app evidence 字段收紧（2026-05-11）**：聊天应用/Codex/Apple Music 等 common app launch 手工证据必须填写 search query、observed display name、icon evidence、observed launch target、CoreBox hidden evidence 与截图/录屏；manifest 结构化字段也会复核这些值非空，确保显示名、图标、启动和启动后隐藏四个体验项都有可复核证据。
- **Windows copied/update evidence 字段收紧（2026-05-11）**：复制 app path 手工证据必须填写 copied source、normalized app path、add-to-local-launch-area action、本地启动区条目、App Index diagnostic evidence、reindex 后 search query、indexed search result 与 indexed result launch evidence；manifest 结构化字段也会复核这些值非空；Windows update install 手工证据必须填写 update diagnostic evidence、installer path/mode、UAC、应用退出、安装器退出、安装后版本、应用重启与失败回滚证据，manifest 结构化字段也会复核这些值非空，避免只填 installer path/mode 或只勾布尔项就通过验收。
- **Windows acceptance 占位拒绝（2026-05-11）**：common app launch、复制 app path、Windows update install、DivisionBox detached widget 与 time-aware recommendation 的 manifest 结构化必填字符串字段、manual `evidencePath` 和 Markdown `## Evidence` 必填 label 都不再接受 `<...>` 模板占位、`N/A` / `NA` / `none` / `TODO` / `TBD` / `-` / `待补` / `无`，这些值会按缺失处理；`dayOfWeek` 继续要求 `0..6` 数字。
- **Windows 自动更新接管基础（2026-05-10）**：新增 `autoInstallDownloadedUpdates`，默认关闭且仅 Windows 高级设置可显式开启；自动下载完成后可走 `windows-auto-installer-handoff`，复用 NSIS/MSI installer handoff 并退出应用，手动下载仍只提示；`UpdateSystem` 底层也会同时复核自动下载任务标记与高级设置开关，避免误传 `autoInstallOnComplete` 绕过用户设置；Update evidence 新增 `installedVersion`，`update:diagnostic:verify` 可用 `--requireAutoInstallEnabled --requireUnattendedEnabled --requireInstalledVersionMatchesTarget` 复核自动接管、自动下载任务 id、安装后版本与下载目标版本一致性，并拒绝空白 installedVersion、cached release / matching asset 与 channel、platform、arch、size 漂移的证据；`windows:acceptance:template -- --updateInstallMode auto` 会生成对应强门禁命令，真实闭环仍需 Windows 真机验证 UAC、安装器退出和失败回滚。
- **CoreBox 展示期 polling pressure 降载（2026-05-10）**：`PollingService` 新增 reason/TTL 型全局 pressure，可按 lane 放大轮询间隔并限制并发；CoreBox 可见期间短时降低 realtime/io/maintenance/serial 后台 polling lane 频率与并发，隐藏后清理；`PerfContext` 慢上下文告警仅在 blocking 或近期 event-loop lag 下输出，减少搜索交互窗口内的后台争用与误报。
- **Search-index worker 空闲退出（2026-05-10）**：`SearchIndexWorkerClient` 支持 60 秒空闲后退出 worker，并保留 `dbPath` 以便下一次写入自动重建 worker、重新执行 init 后再派发写任务；避免 FTS/keyword 单写者 worker 在无索引写入时常驻，同时保持 `removeItems/persistAndIndex/upsertFiles` 等写路径的初始化门禁。
- **CoreBox 分时推荐加权修复（2026-05-10）**：推荐内存缓存与持久化 `recommendation_cache` 都按 `timeSlot/dayOfWeek` 等 context cache key 隔离，跨早上/下午等不同上下文会重新计算推荐；同一 App 在当前时间段/星期有历史使用记录时会获得额外加权，候选去重会保留后续 time-based 统计，并把最终 recommendation source 提升为 `time-based` 以便 UI/验收证据识别当前时段命中；当前 weekday 暂无样本时不再把时段相关性归零，并已固定同一候选集在不同 `timeSlot` 下首位不同的回归。
- **DivisionBox detached widget 恢复链路修复（2026-05-10）**：插件 feature 分离窗口的 `pluginId` 改为真实 `meta.pluginName`，避免 `plugin-features` provider id 污染 session 元数据；widget 继续通过 `tuff://detached` 与 `detachedPayload` 恢复，并把 `detachedPayload` 前移到 `DivisionBoxConfig.initialState`，避免窗口启动时先读到空 session state 再回退搜索；detached URL 的 `source` 表示真实插件 id，`providerSource` 保留 `plugin-features` provider id，fallback 搜索过滤兼容新旧 URL。
- **Windows 更新安装 handoff（2026-05-10）**：用户触发安装后，NSIS `*-setup.exe` 走 `/S`，MSI 走 `msiexec.exe /i ... /passive /norestart`，安装器启动后退出当前应用；下载完成后无人值守自动安装仍需确认权限提升和回滚策略。
- **更新自动下载默认开启（2026-05-10）**：UpdateService / UpdateSystem / renderer runtime / shared defaults 统一为 `autoDownload: true`；Windows 当前仍为下载完成后打开安装器，静默自动安装需另行确认安装器参数、权限提升与回滚策略。
- **Windows 更新诊断证据导出（2026-05-10）**：Settings Update 页可复制/保存 `update-diagnostic-evidence` JSON，记录更新设置、下载就绪状态、缓存版本、目标平台与安装接管模式；新增 `update:diagnostic:verify` 可离线复核 autoDownload、downloadReady、Windows installer handoff、用户确认、无人值守未开启、匹配资产与 checksum 门禁，并校验 `verdict` / suggested fields 与源状态一致；无人值守自动安装仍保持未开启。
- **Everything 图标预热背压（2026-05-10）**：Windows Everything 搜索结果图标预热在 app task 活跃时跳过，并将后台 icon worker 预热并发限制为 4、空闲等待限制为 250ms；搜索命中与排序不变，仍缺真实 Windows 设备体验证据。
- **Everything 诊断证据导出（2026-05-10）**：Settings Everything 页可复制/保存 `everything-diagnostic-evidence` JSON，记录 backend、health、fallbackChain、backendAttemptErrors 与错误码；新增 `everything:diagnostic:verify` 可离线复核 ready/enabled/available/backend/health/version/esPath/fallbackChain/caseId 门禁，并校验 `verdict` / suggested fields 与 `status` 一致，供 Windows 真机 Everything/文件搜索回归补证使用。
- **周期任务 idle gate 降载（2026-05-10）**：DeviceIdleService 先判断系统 idle，再按需读取电量；not-idle 时不再触发 Windows PowerShell 电量探测，并以 30 秒短 TTL 与 in-flight 去重复用电量状态，供电状态变化时立即重读，降低后台索引/同步轮询的额外进程开销。
- **DivisionBox 空闲轮询降载（2026-05-10）**：DivisionBoxManager 不再在单例创建时常驻注册 `division-box.memory-pressure`；仅在存在 active/cached session 时启用内存压力轮询，最后一个 session 销毁或缓存清空后注销任务，降低无 DivisionBox 窗口时的后台调度成本。
- **FileProvider worker snapshot 降载（2026-05-10）**：TuffDashboard 读取文件索引 worker 状态时新增 1 秒短 TTL 缓存与 in-flight 去重，短时间重复或并发刷新不会向 scan/index/reconcile/icon/thumbnail/search-index worker 重复发送 metrics 请求。
- **FileProvider 任务型 worker 空闲回收（2026-05-10）**：scan/index/reconcile/icon/thumbnail worker 在任务和 metrics 请求清空后延迟 60 秒自动终止，下一次任务按需重启；`SearchIndexWorkerClient` 也会在空闲后退出，但保留 `dbPath` 并在下一次写入前自动重新 init，维持 single-writer 写入语义；回归覆盖 scan/index/reconcile/icon/thumbnail/search-index 的 `getStatus()` metrics pending 窗口，避免诊断轮询期间被 idle shutdown 误杀。
- **Search telemetry 上报链路（2026-05-10）**：CoreBox 搜索最终态已匿名上报 first-result 与 provider 明细，Nexus telemetry 聚合 provider slow/error/timeout/P95，并在 Admin Analytics Search 页展示 Provider Performance；该项已完成的是观测与展示链路，不等同于真实性能验收通过。
- **Search trace 性能统计口径（2026-05-10）**：新增 `search-trace-stats/v1`、`search:trace:stats` 与 `search:trace:verify` 本地脚本，可从现有 `search-trace/v1` 日志行聚合 `first.result/session.end` 的样本量、P50/P95/P99、慢查询数量、慢查询占比与 provider 慢源归因，并支持 `search:trace:stats -- --output <stats.json>` 直接写出可归档 JSON；Windows acceptance template 会给出 `performance.searchTraceStatsCommand`，便于真机 200 次查询后生成 stats，再用 200 样本/P95/slowRatio 硬门禁复核；真实 200 次 Windows 查询采样仍需单独产出证据。
- **Clipboard stress 复核口径（2026-05-10）**：新增 `clipboard:stress:verify`，可对 `clipboard:stress` 生成的 summary JSON 执行 2 分钟窗口、500/250ms interval、scheduler delay P95/max、realtime queue peak、drop/timeout/error 硬门禁；`clipboard:stress -- --output <summary.json>` 可把压测结果直接写到 acceptance manifest 期望路径，Windows acceptance template 会给出 `performance.clipboardStressCommand`；真实“全量索引 + 高频推荐 + 剪贴板图像轮询”压测仍需在目标设备产出证据。
- **Tray 运行态真实回显（2026-04-19）**：托盘初始化现在会同步主窗口真实可见性，并通过 transport snapshot 暴露 `trayReady / windowVisible`；静默启动和 macOS `hideDock + showTray` 组合不再回显错误首态。
- **Windows Store 元数据增强（2026-04-19）**：Windows `Get-StartApps` 扫描已补齐 UWP manifest `DisplayName / Description / logo` 富化，应用搜索结果继续保留 `Windows Store` 副标题，同时可展示真实标题、描述与图标。
- **下载中心视图模式持久化（2026-04-19）**：下载中心 `detailed / compact` 模式已统一走 `appSetting.downloadCenter.viewMode` 持久化，关闭页面与重启应用后都会按上次选择正确回显。
- **CoreBox Windows 应用扫描修复（2026-04-18）**：开始菜单 `.lnk` 扫描已保留 `target + args + cwd`，并补入 `Get-StartApps` 的 Windows Store / UWP 枚举，依赖快捷方式参数的桌面应用与 Windows Store 应用现在都可进入应用搜索与启动链路。
- **CoreBox 默认主唤起快捷键（2026-04-18）**：`core.box.toggle` 默认改为启用，仅影响新安装用户；`core.box.aiQuickCall` 继续保持默认关闭，历史快捷键配置不自动迁移。
- **Tray 直启（2026-04-18）**：托盘运行时不再依赖 `setup.experimentalTray` 门控，设置页与引导页已移除对应实验语义；托盘是否展示继续只由 `showTray / hideDock / startSilent / closeToTray` 控制。
- **2.4.9 主线 Gate（historical）**：插件完善主线收口完成；`Nexus 设备授权风控` 保留实施文档与历史入口，当前主线已转入 `2.4.10 Windows App 索引 + 基础 legacy/compat 收口`。
- **治理执行口径**：Legacy/兼容/结构治理切换为“统一实施 PRD + 五工作包并行验收”，不再按 Phase 1-3 分段决策。
- **CoreApp 兼容硬切（2026-03-23）**：`window.$channel` 业务调用为 `0`、legacy storage 事件协议（`storage:get/save/reload/save-sync/saveall`）为 `0`；插件权限 `sdkapi` 缺失/低版本改为阻断执行（`SDKAPI_BLOCKED`）。
- **Nexus 设备授权风控（2026-05-06）**：Phase 1 已接入设备码申请频控、连续失败/取消冷却、授权审计日志、长期授权后端时间窗与可信设备显式白名单。
- **Nexus Provider 聚合与 Scene 编排（2026-05-09）**：新增权威 PRD，后续汇率、AI 大模型、文本翻译、图片/截图翻译统一进入 Provider registry；Scene 通过 Capability、Strategy 与 Metering 组合能力，不再为每个场景维护孤立供应商模型。
- **Nexus composed 截图翻译编排（2026-05-10）**：Scene Orchestrator 已支持 `vision.ocr -> text.translate -> overlay.render` 链式输出传递，图片置顶窗口可消费本地 `overlay.render` 客户端 overlay payload；OpenAI-compatible Intelligence mirror 已有默认 `vision.ocr` adapter，Dashboard Admin seed 已补系统级 overlay provider 与截图翻译 Scene 默认配置；生产闭环仍需补 user-scope AI mirror OCR 绑定策略、旧 AI provider 表退场与高级策略。
- **Nexus AI Provider Registry check（2026-05-11）**：Intelligence provider registry mirror 已接入 Provider Registry check，Dashboard 可对 `chat.completion` 与 `vision.ocr` 执行探活并写入 `provider_health_checks`，Health 视图可继续统一查询 latency/error/degraded reason；`vision.ocr` 探活复用 OpenAI-compatible OCR adapter，不再用 chat probe 代替。
- **Nexus Provider/Scene 默认 seed（2026-05-11）**：Dashboard Admin Provider Registry 页面加载前会幂等触发默认 seed，创建系统级本地 `custom-local-overlay` provider 与 `corebox.screenshot.translate` Scene，并只追加缺失的 system binding；不会把 user-scope AI mirror OCR provider 自动绑定进 system Scene，避免个人凭证跨用户误用。
- **跨平台兼容与占位实现深度复核（2026-05-13）**：新增 `cross-platform-compat-placeholder-deep-review-2026-05-13.md`；2026-05-10 报告中的 AI stat 假值、payment mock 默认成功与 touch-image localStorage 历史持久化已收口，CoreApp 平台能力、sync 密文载荷与 Linux unsupported reason 口径保持稳定；生产 raw send 直连未见新增命中，typed migration candidate 保持 `0`，retained raw definition 当前测试上限为 `265`。剩余重点是 Windows/macOS 真机证据、Linux best-effort 记录、AI 兼容占位响应、CLI token 明文 JSON、插件 provider secret 普通 storage、插件 shell capability 诊断与超长模块 SRP 拆分。
- **架构治理切片（2026-05-13）**：Transport boundary test 已拆出 raw send / retained raw definition / typed migration candidate 三类指标，retained raw definition 当前基线为 `265`；AI `/system/serve/stat` 已改真实运行时指标，mock 支付默认成功由 `AIAPP_PAYMENT_MODE=mock` 门控；`plugins/touch-image` 图片历史迁入 plugin storage SDK；`system:permission:*` / `omni-panel:feature:*` 已无损迁到 typed builder；`clipboard.ts`、`app-provider.ts`、Tuffex `TxFlipOverlay.vue` 等已完成 SRP 拆分切片；质量入口统一为 ESLint、typecheck、targeted tests 与 build，release 走 `quality:release`。
- **CoreApp 启动异步化缺口分析（2026-05-13）**：专项报告已归档到 `docs/plan-prd/report/coreapp-startup-async-blocking-analysis-2026-05-13.md`；当前结论是启动仍受 main modules 串行 `await`、Database/Extension/Intelligence 等非首屏任务进入 critical path、renderer mount 前等待 storage/plugin store 影响。后续按 renderer plugin store 后台化、非首屏模块后台化、Database critical/background 拆分与 Search provider 后台 ready 推进，不抢当前 `2.4.10` Windows evidence gate。
- **CoreApp 启动搜索卡顿治理（2026-03-24）**：已落地双库隔离（aux DB）、写入 QoS（priority/drop/circuit）、索引热路径 worker 单写者与启动期降载；可通过 `TUFF_DB_AUX_ENABLED/TUFF_DB_QOS_ENABLED/TUFF_STARTUP_DEGRADE_ENABLED` 灰度与回滚。
- **治理基线（主线代码域）**：legacy/raw channel 继续通过 ESLint 与 transport boundary tests 防回潮；文件行数治理回到 code review 与普通重构任务。
- **发布快照证据**：见 `CHANGES` 中 `v2.4.9-beta.4` 基线条目（含 commit/tag/CI run 链接）。
- **2.4.8 主线 Gate（historical）**：OmniPanel 稳定版 MVP 已落地（真实窗口 smoke CI + 失败路径回归 + 触发稳定性回归）。
- **v2.4.7 发布门禁**：Gate A/B/C/D/E 已完成（Gate E 为 historical，Gate D 已通过手动 `workflow_dispatch(sync_tag=v2.4.7)` 收口）。
- **AI Runtime 主路径**：Node Server + Postgres/Redis + JWT Cookie；Cloudflare runtime/D1/R2 仅保留历史归档。
- **AI Chat/Turn 新协议**：`/api/chat/sessions/:sessionId/stream` 为主入口；`/api/v1/chat/sessions/:sessionId/{stream,turns}` 已 hard-cut 下线（会话级串行队列、SSE 尾段 title、运行态回传保持不变）。
- **AI 标题自动生成修复**：首轮 turn 的 title 阶段改为直接基于 turn payload 生成，并在生成后同步回写 runtime + quota history，避免历史列表长期显示“新的聊天”。
- **AI 合并升级 V2**：`/` 作为统一入口，`/aiapp` 兼容跳转；已接入渠道多模型发现、模型目录、路由组合、`Quota Auto` 速度优先自动路由与评比指标采集（TTFT/总耗时/成功率）。
- **AI 旧 UI 会话卡片化硬切**：保留 `ThChat/ThInput/History`，运行态统一改为会话内 `aiapp_run_event_card` 推送（`intent/routing/memory/websearch/thinking`），不再使用全局运行态条。
- **AI 流式协议收敛**：旧 UI 执行器统一消费 `/api/chat/sessions/:sessionId/stream` 新事件族；legacy 事件（`turn.* / status_updated / completion / verbose / session_bound`）仅忽略告警。
- **AI 单流包级复用收口**：`@talex-touch/tuff-intelligence` 已成为 stream contract、trace/replay mapper、system projection、legacy run card projection、seq helper 的唯一权威源；前端不再为可恢复事件本地补 `seq`。
- **AI 执行入口硬切**：`/api/aigc/executor` 已物理删除，`/api/chat/sessions/:sessionId/stream` 为唯一执行入口（`/api/v1/chat/sessions/:sessionId/{stream,turns}` 仍保持下线态）。
- **Intelligence 多模态能力打通**：`image.generate/image.edit/audio.tts/audio.stt/audio.transcribe` 已接入统一能力配置、运行时分发与 fallback；`video.generate` 进入配置矩阵并保留“运行时未实现”提示。
- **AI 模型组能力开关重构**：`/admin/system/model-groups` 已升级为“模板预设 + 分层配置 + 联动校验”，并新增共享能力元数据模块统一前后端规则。
- **AI 附件交互修复**：聊天生成中不再禁用输入区粘贴与附件选择；支持粘贴图片/文件直传，并显式放开图片等常见文件类型选择。
- **AI 附件慢链路治理（URL/ID-first）**：入模策略统一为 `id > https url > base64`，并新增附件能力探测接口 `GET /api/chat/attachments/capability`。
- **AI 旧输入框附件出站硬切**：`ThInput` 附件上传改为会话级 `/api/chat/sessions/:sessionId/uploads`，发送链路强制 `message + attachments` 分离；历史 dataURL 附件发送前先转换为 session `attachmentId`，不再把 base64 拼进可见文本。
- **AI 后台设置入口升级**：管理主入口已迁移到 `/admin/*`，`/cms/*` 仅保留 Legacy 跳转层。
- **Legacy 聊天输入框附件修复**：`ThInput` 旧输入框已支持粘贴与选择文件附件（不再仅限图片，也不再提示“暂时不支持附件/文件分析”）。
- **AI/Legacy 附件可读性修复**：非图片附件在大小阈值内会内联为 `input_file.file_data` 传给模型，不再只传文件名/类型元信息。
- **AI 流式失败可见性修复**：前端已兼容 `event/session_id/[DONE]` 协议差异，并对 `turn.failed` 同时提供消息区可见失败消息与底部诊断详情。
- **Legacy 历史加载状态修复**：`GET /api/aigc/conversation/:id` 返回 JSON `value` 时，历史项点击流程已兼容对象解码并确保异常时也会退出 loading。
- **AI 历史存储格式**：`aiapp_quota_history.value` 已统一为 JSON 字符串（旧 base64 记录已迁移，历史接口默认回包结构化 JSON）。
- **AI 会话兼容回填**：`GET /api/aigc/conversation/:id` 在 quota history 缺记录时，会自动从 runtime session 生成 snapshot 回填，避免刷新时误报 `conversation not found`。
- **AI 接口迁移（M2/M3）**：已完成收口；聊天应用相关接口进入豁免模式，支付链路切换为本地 mock（下单 3 秒自动成功）。
- **AI channels 治理**：已新增 `POST /api/admin/channels/merge-ends` 与一次性脚本，执行“AI 优先、Ends 补缺”。
- **AI 自动部署**：仅在 `master` 的远端 `push`（非本地 `commit`）且命中 `aiapp-image.yml` 路径过滤后触发；需同时满足 `ONEPANEL_WEBHOOK_URL/TOKEN` 已配置与 1Panel webhook 健康可达，否则需走 `ssh home` 手动部署兜底。
- **AI 设置入口收口**：`/admin/system/channels` 与 `/admin/system/storage` 为主入口；`/cms/*` 仅保留 Legacy 跳转。
- **执行顺序（锁定）**：先完成 `2.4.10 Windows App 索引 + 基础 legacy/compat 收口`，再在 `2.4.11` 关闭剩余跨平台回归、Release Evidence 与清册退场项；`Nexus 设备授权风控` 降为非当前主线但保留实施入口与历史证据。
- **质量边界**：Network 套件全仓硬禁生效，业务层 direct `fetch/axios` 继续保持 0 违规。

## 当前两周重点

- `2.4.10`：Windows App 索引与启动体验收口，包含 Start Menu、UWP、registry uninstall、`launchArgs/workingDirectory` 与真实 Windows 设备验证。
- `2.4.10`：基础 legacy/compat 收口，清册退场目标统一为 `2.4.11`，禁止新增 legacy/raw channel/旧 storage/旧 SDK bypass。
- `2.4.11`：Windows/macOS release-blocking 回归、Linux documented best-effort、Release Evidence 写入闭环与清册退场项关闭。

## 强制同步矩阵（单一口径）

| 文档 | 当前状态 | 下一动作 |
| --- | --- | --- |
| `docs/plan-prd/TODO.md` | 已同步到 2026-05-13 | 推进 `2.4.10` Windows 真机 evidence；`2.4.11` 收口 AI 占位、CLI token、插件 secret/command capability |
| `docs/plan-prd/README.md` | 已同步到 2026-05-13 | 维护 `2.4.10` 当前主线、`2.4.11` 未闭环能力与 Nexus Provider 架构蓝图口径 |
| `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md` | 已同步到 2026-05-13 | 按锁定顺序推进 Windows evidence、基础兼容治理、后续跨平台回归与 Provider 聚合规划 |
| `docs/plan-prd/01-project/RELEASE-2.4.7-CHECKLIST-2026-02-26.md` | Gate A/B/C/D/E 已完成（D/E historical，2026-03-16 已复核） | 保留证据链并切换到 `2.4.9` 后续主线 |
| `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md` | 已同步到 2026-05-13 | `2.4.11` 前关闭或降权 legacy/compat/size 债务，Windows/macOS 为 release-blocking；活跃 PRD 保持目标/验收/质量/回滚结构 |
| `docs/plan-prd/01-project/CHANGES.md` | 已同步到 2026-05-13 | 持续记录 `2.4.10` 主线、`2.4.11` 必解清单与 Nexus Provider PRD 证据 |
| `docs/INDEX.md` | 本页（入口+快照）已压缩 | 仅维护导航与高价值快照 |

## 归档与降权

- `docs/plan-prd/next-edit/*`：降权为草稿池，不作为发布判定与状态口径来源。
- `docs/plan-prd/05-archive/*`：历史归档区，仅用于追溯，不参与当前里程碑状态统计。

## 高价值专题入口

- `docs/plan-prd/03-features/omni-panel/OMNIPANEL-FEATURE-HUB-PRD.md` - OmniPanel Feature Hub PRD
- `docs/plan-prd/03-features/ai-2.5.0-plan-prd.md` - Tuff 2.5.0 AI 桌面入口收口 Plan PRD
- `docs/plan-prd/02-architecture/intelligence-power-generic-api-prd.md` - Intelligence 能力路由与 Provider 架构 PRD
- `docs/plan-prd/02-architecture/nexus-provider-scene-aggregation-prd.md` - Nexus Provider 聚合与 Scene 编排重构 PRD
- `docs/plan-prd/04-implementation/LegacyChannelCleanup-2408.md` - Legacy Channel Cleanup 2.4.8
- `docs/plan-prd/04-implementation/NexusDeviceAuthRiskControl-260316.md` - Nexus 设备授权风控实施方案（非当前主线，保留入口）
- `docs/plan-prd/docs/NEXUS-RELEASE-ASSETS-CHECKLIST.md` - `v2.4.9` Gate D 发布资产核对（严格签名）
- `docs/plan-prd/docs/PLUGIN-STORE-MULTI-SOURCE-ACCEPTANCE-2026-03-15.md` - 插件市场多源验收结论
- `retired-ai-app/deploy/README.zh-CN.md` - AI 在 1Panel 的标准部署手册（脚本 + env + 回滚 + cron + webhook 自动部署）
