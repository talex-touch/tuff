# Talex Touch - 项目文档中心

> 统一的项目文档入口（压缩版）
> 更新时间: 2026-05-12

## 快速入口

- [产品总览与路线图](./01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md)
- [项目待办（2 周主清单）](./TODO.md)
- [变更日志（近 30 天 + 历史归档）](./01-project/CHANGES.md)
- [文档质量基线](./docs/PRD-QUALITY-BASELINE.md)
- [文档盘点历史快照（2026-03-17）](./docs/DOC-INVENTORY-AND-NEXT-STEPS-2026-03-17.md)
- [一次性完整修复总方案（统一实施 PRD）](./02-architecture/UNIFIED-LEGACY-COMPAT-STRUCTURE-REMEDIATION-PRD-2026-03-16.md)
- [Nexus 设备授权风控实施方案](./04-implementation/NexusDeviceAuthRiskControl-260316.md)
- [Nexus Provider 聚合与 Scene 编排重构 PRD](./02-architecture/nexus-provider-scene-aggregation-prd.md)
- [跨平台兼容与占位实现复核报告（2026-05-12）](./report/cross-platform-compat-placeholder-review-2026-05-12.md)
- [跨平台兼容与占位实现审计报告（2026-05-10，历史基线）](./report/cross-platform-compat-placeholder-audit-2026-05-10.md)
- [v2.4.7 发版收口清单（historical）](./01-project/RELEASE-2.4.7-CHECKLIST-2026-02-26.md)
- [长期债务池](./docs/TODO-BACKLOG-LONG-TERM.md)

---

## 单一口径快照（2026-05-12）

- 当前工作区基线：`2.4.10-beta.19`。
- 发布准备：`2.4.10-beta.19` 已补中英文 release notes；`build-and-release` 显式支持 `beta` 类型并保持 pre-release 语义，CI/CD 统一 Node `22.16.0` / pnpm `10.32.1`，PR CI 收窄为只读 `pull_request`，release artifact 只上传发布资产与 updater metadata。
- 当前主线：`2.4.10` 优先解决 Windows App 索引、Windows 应用启动体验与基础 legacy/compat 收口。
- 当前版本 Windows 发版 gate：功能实现与本地 verifier 已进入收口态，但发版必须先补齐 Windows 真机 evidence 与性能 evidence；最终 acceptance 必须覆盖常见 App 启动、复制 app path、本地启动区索引、Everything target probe、自动安装更新、DivisionBox detached widget、分时推荐、search trace `200` 样本、clipboard stress `120000ms` 压测，并完成 Nexus Release Evidence 写入。
- 下一版本门槛：`2.4.11` 必须关闭剩余未闭环项；清册内 legacy/compat/size 债务退场目标统一前移到 `2.4.11`。
- Nexus 设备授权风控 Phase 1 已落地：设备码申请频控、连续 reject/cancel 冷却、request/approve/reject/cancel/revoke/trust/untrust 审计日志、长期授权后端时间窗与可信设备显式白名单已接入。
- Nexus Provider 聚合与 Scene 编排进入架构蓝图：后续汇率、AI 大模型、文本翻译、图片/截图翻译统一进入 Provider registry，Scene 按 capability 自由组合与路由。
- Nexus Provider Registry 已接入 D1 密文 secure store、Scene run 最小执行入口、普通登录态 runtime Scene API、Dashboard dry-run/execute 面板与腾讯云机器翻译 `text.translate` / `ImageTranslateLLM` adapter；Dashboard 可深编辑 Provider 基础字段、capability metering/constraints/metadata，以及 Scene strategy、metering/audit policy、binding constraints/metadata；Dashboard Admin Provider Registry 加载时已可幂等 seed 系统级本地 `custom-local-overlay` provider 与 `corebox.screenshot.translate` Scene，并只追加缺失的 system binding，不覆盖管理员自定义配置；CoreApp OmniPanel 划词翻译已优先调用 `corebox.selection.translate` Scene，CoreBox 剪贴板图片项已可通过 `corebox.screenshot.translate` direct `image.translate.e2e` Scene 写回翻译图片到剪贴板，置顶窗口可走 Scene 默认链并消费 composed `vision.ocr -> text.translate -> overlay.render` 的客户端 overlay payload；汇率 `fx.rate.latest` / `fx.convert` 已有 Scene adapter，可复用现有 `exchangeRateService` 输出统一 output/usage/trace/ledger，CoreBox 汇率预览已优先调用 `corebox.fx.convert` / `corebox.fx.latest` Scene，`/api/exchange/latest` 与 `/api/exchange/convert` 也已优先路由到 Scene，未登录、Scene 不可用或输出无效时保留兼容 fallback；Intelligence provider 已同步镜像到通用 Provider Registry，能力归一为 `chat.completion` / `text.summarize` / `vision.ocr`，API key 只写 `provider_secure_store` 并通过 `authRef` 引用，dashboard list/sync/model list/probe/admin chat/docs assistant/lab runtime 已统一经 bridge 合并读取旧表与 registry-only 镜像，Dashboard Provider Registry check 已可对 AI mirror 执行 `chat.completion` 与 `vision.ocr` 专项探活并写入 `provider_health_checks`；OpenAI-compatible Intelligence mirror 已有默认 `vision.ocr` Scene adapter，可支撑 composed 截图翻译链路从 AI mirror 调用云端 OCR；Scene run 已写入 `provider_usage_ledger` 安全元数据并可在 Dashboard Usage 视图查询，Provider check 已写入 `provider_health_checks` 并可在 Dashboard Health 视图查询 latency/error/degraded reason；Scene strategy 已最小参与路由，覆盖 `priority/manual` 候选排序、`least_cost` 成本字段排序、`lowest_latency` 健康历史延迟排序与 `balanced` 成本/延迟/权重综合排序；生产需配置 `PROVIDER_REGISTRY_SECURE_STORE_KEY`，仍缺旧 `intelligence_providers` 表退场、user-scope AI mirror OCR 自动绑定策略，以及更完整的 success rate、配额与动态 pricingRef 策略。
- Tuff 2.5.0 AI 板块已锁定 Plan PRD：定位为桌面 AI 入口收口版本，优先收口 CoreBox / OmniPanel 的用户可感知 AI 场景；CoreBox AI Ask 最小 Stable 切片已接入 `text.chat` 与剪贴板图片 `vision.ocr -> text.chat`，并补齐状态、失败提示、权限与审计 metadata；下个版本重点落地 OmniPanel Writing Tools、Workflow `Use Model` 节点、Review Queue、Desktop Context Capsule 与 3 个 P0 Workflow 模板；Stable 只承诺文本 + OCR，Skills / Background Automations / Pilot 联动进入 Beta，Assistant、多模态生成与 Nexus Scene runtime 编排列为 Experimental / 2.5.x 后续。
- CoreApp 启动搜索卡顿治理已落地“平衡模式 + 双库隔离”：`database-aux.db` 分流非核心高频写、`DbWriteScheduler` QoS/熔断、索引热路径单写者化、启动期降载（120s）；CoreBox 可见期间会短时压低后台 polling lane 频率/并发，FileProvider 任务型 worker 空闲 60 秒后自动回收，且 scan/index/reconcile/icon/thumbnail/search-index 状态采样 pending 窗口均有回归覆盖，减少搜索交互窗口内的后台争用与常驻线程占用。
- Search-index 单写者 worker 已补空闲退出：`SearchIndexWorkerClient` 空闲 60 秒后回收线程，下一次 FTS/keyword/file progress 写入会用保留的 `dbPath` 重新 init worker 后再执行任务，降低常驻线程占用且不破坏写入初始化顺序。
- CoreBox App 搜索排序继续收紧 App 意图：App 可见标题的前缀、词首、子串命中，以及精确/前缀别名 token 命中都作为明确 intent 信号；plugin feature 的隐藏 token/source 召回仍被降权并限制 frequency/recency，`Visual Studio Code` 这类后续单词、`vsc` 精确别名或 `vscod -> vscode` 前缀别名命中不会被中等频次 feature 抢首位，但极高频可见标题 feature 仍可通过自学习前置。
- 搜索索引服务已切到“平台原生快速层 + 自建索引增强层”口径：Windows Everything、macOS Spotlight/mdfind、Linux locate/Tracker/Baloo 负责首帧候选，自建 FileProvider 负责 FTS、内容解析、语义和后台修正；搜索 payload 禁止内联 base64 图标/缩略图，大资源通过 `tfile://`/本地路径懒加载。
- 搜索性能 telemetry 上报链路已落地：CoreBox 在最终 `session.end` 匿名上报 `firstResultMs/providerTimings/providerResults/providerStatus`，Nexus Admin Analytics 已展示 Provider Performance；`search:trace:stats -- --output <stats.json>` 可从目标设备日志直接生成 `search-trace-stats/v1`，Windows acceptance template 会给出采样命令；这只代表观测链路完成，真实性能验收仍需目标设备 200 条样本通过 P95/slowRatio 门禁。
- Everything diagnostic evidence 复算已补 verdict/status 一致性检查，包含 `hasBackendAttemptErrors` 与 `status.backendAttemptErrors` 对齐，并复核 `ready` 与 `enabled/available`、available/backend、health/available、active backend/fallback chain、available 状态下 stale error 字段、active backend attempt error、backendAttemptErrors 必须来自 fallback chain 且错误文本非空、CLI backend 的 `esPath/version` 完整性；Windows Everything 目标命中仍通过 capability evidence 的 target probe 与 acceptance case 复算确认，且 `--requireEverythingTargets` 会要求基础 Everything 查询返回结果、目标 probe 命中并至少有一条样本文本包含目标关键词。
- 复制 app path 加入本地启动区已覆盖 Windows `%ENV%` 路径：SystemActionsProvider 可从 `%LOCALAPPDATA%` / `%USERPROFILE%` 等环境变量开头、带引号或未带引号、含空格且带参数的 `.exe/.lnk/.appref-ms` 命令行中抽取真实应用路径，并继续进入 `appProvider.addAppByPath()`；该入口会写入 `entrySource=manual / entryEnabled=1` 本地启动区条目并同步应用索引，真实 Windows 设备体验仍需补证。
- Windows acceptance manifest 已把复制 app path 入口拆成独立 required case 和手工 gate：`windows-copied-app-path-index` 要求 Windows capability evidence 与 App Index diagnostic evidence 同时通过，且 app-index 诊断必须命中 `path/shortcut` launchKind、`entrySource=manual / entryEnabled=true` managed entry、可 reindex、带图标与专用 caseId；`manualChecks.copiedAppPath` 还会要求真实复制源、add-to-local-launch-area、本地启动区条目、reindex、搜索命中与启动闭环证据，避免只测普通第三方 app 启动而漏掉复制路径加入本地启动区链路。
- App Index diagnostic evidence 复算已补结构一致性门禁：`diagnosis.matchedStages` 必须能由 `stages.*.targetHit` 重新推导，命中的 stage 必须包含目标 `itemId` 且 `matchCount` 与 matches 一致；未运行 stage 不得携带命中或 matches，未命中 target 的 stage 不得携带 matches；input/diagnosis/manual suggested fields/reindex path 也必须与同一个目标 app 对齐，成功 reindex 在存在 app 实体字段时还必须对齐 app path/launchTarget/appIdentity/bundleId，避免只手工填写 `matchedStages`、caseId 或 reindex 状态的弱 JSON 通过复制 app path 与普通 App 索引验收。
- Windows 自动安装更新验收已收紧到 evidence 复算层：`windows-tray-update-plugin-install-exit` 的 `windows-auto-installer-handoff` update diagnostic evidence 不只校验命令字段，还会强制要求自动下载任务 id 非空、`installedVersion` 当前版本与下载目标版本匹配且 current/expected 不能是空白字符串，并复核 cached release tag/channel、matching asset 平台/架构/size 与运行目标一致；手动安装路径仍要求用户确认与 unattended disabled。
- Windows acceptance 最终命令已加入 `--requireNonEmptyEvidenceFiles` 与 `--requireCompletedManualEvidence`：在 `--requireExistingEvidenceFiles` 只确认路径存在的基础上，会拒绝目录、0 字节 case/performance/manual evidence 文件，以及仍有未勾选项、没有 Markdown checklist 或当前模板要求的 Evidence 关键字段未逐项填写的手工证据；失败项会列出未勾选数量与缺失 Evidence label，避免空占位文件、只填 Notes 或只填单个证据字段的模板被误归档为真机证据。
- Common app launch manual evidence 也已对齐五项可见体验检查：每个目标 App 必须填写搜索 query、observed display name、icon evidence、observed launch target、CoreBox hidden evidence 与截图/录屏；manifest 结构化字段也会在 `--requireCommonAppLaunchDetails` 下复核这些字段非空，避免只填启动目标、只勾布尔项或泛截图就通过常见应用验收。
- Copied app path 与 Windows update install 的 manual evidence 也已按动作链拆到字段级：复制路径证据必须覆盖 copied source、normalized app path、add-to-local-launch-area action、本地启动区条目、App Index diagnostic evidence、reindex 后 search query、indexed search result 与 indexed result launch evidence；manifest 结构化字段也会在 `--requireCopiedAppPathManualChecks` 下复核这些字段非空；更新安装证据必须覆盖 update diagnostic evidence、installer path/mode、UAC、应用退出、安装器退出、安装后版本、重启可用和失败回滚，manifest 结构化字段也会在 `--requireUpdateInstallManualChecks` 下复核这些证据非空。
- DivisionBox detached widget 与分时推荐的 manual evidence 字段已细化为可复核身份字段：DivisionBox 证据必须填写 observed/expected pluginId、detached URL `source` / `providerSource`、`detachedPayload` itemId/query 与 no-fallback 日志摘录；manifest 结构化字段也会直接复核 observed session pluginId 与 URL `source` 等于真实 feature pluginId，且 `providerSource=plugin-features`；分时推荐证据必须填写早/午 `timeSlot/dayOfWeek`、早/午 top item/provider source/recommendation source、frequent comparison item/provider source/recommendation source、cache key 与推荐 trace 摘录，manifest 结构化字段会复核早/午 timeSlot 不同、top recommendation 不同、早/午 recommendation source 为 `time-based` 且频率对照 source 为 `frequent`，避免只填泛化 Logs 或截图通过最终手工门禁。
- Windows acceptance 结构化手工字段现在与 Markdown manual evidence 采用同一占位拒绝口径：`manualChecks.commonAppLaunch / copiedAppPath / updateInstall / divisionBoxDetachedWidget / timeAwareRecommendation` 的必填字符串字段、对应 `evidencePath`，以及 Markdown `## Evidence` 下的必填 label，都必须是实际证据值；`<...>` 模板占位、`N/A` / `NA` / `none` / `TODO` / `TBD` / `-` / `待补` / `无` 都会按缺失处理；`dayOfWeek` 仍必须是 `0..6` 的合法数字。
- Windows performance evidence 复算已补内部一致性门禁：`search-trace-stats/v1` 会拒绝 paired/session/sample/slow counter、slowRatio 与 percentile 单调性自相矛盾的摘要，`clipboard-stress-summary/v1` 会拒绝无有效 clipboard 采样、scheduler sample 超过 count、scheduler delay 与 duration 指标倒挂的摘要，避免只填阈值字段的弱 JSON 通过 acceptance。
- Windows acceptance template 可用 `--writeManualEvidenceTemplates` 生成非覆盖式 Markdown 手工证据模板，覆盖 common app launch、copied app path、update install、DivisionBox detached widget 与 time-aware recommendation；也可用 `--writeCollectionPlan` 生成 `WINDOWS_ACCEPTANCE_COLLECTION_PLAN.md`，把 case evidence、capability evidence 采集命令、已替换实际 evidence path 的 verifier command、性能采样、manual evidence 与最终 strong gate 汇总到一个真机采集清单，便于逐项填证。
- Windows 更新已补受控自动 installer handoff 基础：`autoInstallDownloadedUpdates` 默认关闭且仅高级设置显式开启，自动下载任务完成后才会接管 NSIS/MSI handoff；`UpdateSystem` 运行时会同时要求自动下载任务标记与该高级设置开启，手动下载或设置关闭时只保留完成通知；Update evidence 可带 `installedVersion`，自动接管验收命令会要求 `--requireInstalledVersionMatchesTarget`，并要求 `downloadTaskId`、目标版本、cached release 与 runtime matching asset 交叉一致；acceptance manifest 也会通过 `--requireUpdateInstallManualChecks` 卡住 UAC、安装器退出、应用退出释放占用、重启可用与失败回滚；真实闭环仍需 Windows 真机执行并归档证据。
- DivisionBox detached widget 已纳入 Windows acceptance 手工 gate：`manualChecks.divisionBoxDetachedWidget` 需要确认插件 feature 可搜、分离窗口打开、session 使用真实 feature pluginId、detached URL `source=<pluginId>` 且 `providerSource=plugin-features`、`initialState.detachedPayload` 首帧水合、原始 query 保留、widget surface 正常渲染且未回退到错误搜索结果；最终复核使用 `--requireDivisionBoxDetachedWidgetManualChecks`。
- 分时推荐已纳入 Windows acceptance 手工 gate：`manualChecks.timeAwareRecommendation` 需要确认空 query 推荐可见、早/午两个时段样本、首位推荐随时段变化、频率信号仍保留且 timeSlot/dayOfWeek 缓存不会跨时段复用；本地回归已覆盖内存 cache、持久化 `recommendation_cache`、production `ContextProvider.generateCacheKey()`，以及 frequent/time-based 重复候选会保留 timeStats 并把最终 recommendation source 提升为 `time-based`，最终真机复核使用 `--requireTimeAwareRecommendationManualChecks`。
- 发布开关已就位：`TUFF_DB_AUX_ENABLED`、`TUFF_DB_QOS_ENABLED`、`TUFF_STARTUP_DEGRADE_ENABLED`，支持灰度与快速回滚。
- Legacy/兼容/结构治理已切换到“统一实施 PRD + 五工作包并行”口径（不再使用 Phase 1-3 决策叙事）。
- 治理基线：`legacy 81/184`、`raw channel 13/46`、超长文件（主线）`47`。
- 跨平台兼容复核（2026-05-12）：2026-05-10 报告中的 Pilot stat 假值、mock payment 默认成功与 touch-image localStorage 历史持久化已收口；CoreApp 平台能力保持显式 degraded/unsupported 合同，生产 raw send 直连未见新增命中，typed migration candidate 保持 `0`，retained raw definition 按测试扫描口径冻结为 `<=264`；本轮 `compat:registry:guard`、`runtime:guard`、`docs:guard`、`transport-event-boundary.test.ts` 已通过。
- Native transport V1 已从截图首切扩展为 `capabilities / screenshot / file-index / file / media` 五域：`NativeEvents.screenshot` 事件名保持不变，新增 `native:capabilities:*`、`native:file-index:*`、`native:file:*`、`native:media:*`；CoreApp `NativeCapabilitiesModule` 桥接现有 fileProvider/Everything status、文件 stat/open/reveal/tfile 与图片/视频媒体 metadata/thumbnail，大资源默认返回短期 `tfile://` 引用；媒体 thumbnail 已复用 FileProvider thumbnail worker，图片/HEIC 走 `sharp`，视频走内置 ffmpeg 抽帧，ffmpeg 不可用时 `media.thumbnail` 显式 degraded 且图片缩略图继续可用；插件调用必须按域声明 `window.capture`、`fs.index`、`fs.read` 或 `media.read`。
- 架构治理切片（2026-05-11）：Transport boundary test 已拆出 `rawSendViolations / retainedRawEventDefinitions / typedMigrationCandidates`；Pilot stat 固定假值与 mock 支付默认成功已收口；`plugins/touch-image` 图片历史已迁到 plugin storage SDK；`system:permission:*` / `omni-panel:feature:*` 已无损迁到 typed builder；`clipboard.ts` 已拆出 capture freshness、history persistence、transport handlers、autopaste automation、image persistence、polling policy、native watcher、meta persistence、stage-B enrichment 与 capture pipeline，并降到 `1143` 行清退 size exception；`app-provider.ts` 已拆出 path helper 与 source scanner facade，growth exception cap 收紧到 `3306`；`sdk-compat.ts` 已硬切为 `sdkapi-hard-cut-gate.ts`，Pilot `pilot-compat-*` 已硬切为领域服务命名；Tuffex `TxFlipOverlay.vue` 已拆出 stack helper并清退 size exception；registry 当前 `36` 条、`compat-file=5`；重构期 guard 已分层，`lint/lint:fix` 不再串全量架构债务，`size:guard:strict` 保留 release 红线。
- `apps/core-app` 已完成“兼容债立即硬切”首轮并行治理：`window.$channel` 业务入口清零、legacy storage 事件协议清零、权限 `sdkapi` legacy 放行移除、更新/平台识别收敛为显式 `unsupported` 策略。
- CoreApp Sync payload 已从旧 `b64:` Base64 载荷升级为 main 侧 AES-GCM `enc:v1` 真密文；`payload_enc/payload_ref` wire shape 保持不变，`meta_plain` 仅保留非业务元数据，旧 `b64:` 只作为迁移读取 fallback。
- Nexus Release Evidence API 继续作为平台回归、文档门禁与阻塞矩阵采集入口；CI 写入使用 `release:evidence` API key。
- 当前下一动作：`2.4.10 Windows App 索引 + 基础 legacy/compat 收口`；Linux best-effort 口径复核继续作为非阻塞记录。
- `2.4.11` 前置口径：关闭或降权 CoreApp 剩余 legacy/compat 债务，补齐 Windows/macOS release-blocking 回归证据；Linux 保留 documented best-effort，不作为 `2.4.10` blocker。
- `2.4.8` 主线：OmniPanel Gate 已完成（historical）。
- `v2.4.7` Gate：A/B/C/D/E 已完成（historical），不重发版。
- Pilot Runtime 主路径：Node Server + Postgres/Redis + JWT Cookie（Cloudflare 路径仅历史归档）。
- Pilot Chat 路由 V2：已接入渠道多模型发现、模型目录、路由组合、速度优先自动路由与评比指标采集（TTFT/总耗时/成功率）。
- Pilot 工具调用 V1：已落地统一 `run.audit` 工具生命周期、阻塞式审批票据 API、`datasource.websearch` 全局 provider 池（`SoSearch/SearXNG/Serper/Tavily + responses_builtin`）与前端 Tool 卡片聚合解析；新增 Intent 图像路由与 `image.generate` 工具闭环（legacy `stream/turns` 路由与 SDK legacy 出口已 hard-cut 下线）。
- Pilot 审批闭环：聊天端已支持审批票据自动轮询与自动续跑（approved 复用原 request 执行）；legacy 事件兼容分支默认关闭并提供环境开关回滚。
- Pilot 旧 UI 已硬切会话卡片流：`intent/routing/memory/websearch/thinking` 改为消息流卡片事件，状态不再走全局运行态条。
- Pilot 流式入口收敛：旧 UI 执行链路统一到 `POST /api/chat/sessions/:sessionId/stream`，legacy 事件仅告警忽略。
- Pilot 首页默认 DeepAgent：生产入口继续是 `apps/pilot/app/pages/index.vue`，前端主消费链收口到 legacy `$completion` 单链，不再并行扶正新 Pilot Workspace。
- Pilot 默认模式收敛：`pilotMode` 退回显式实验字段；首页默认不发送、不展示、不依赖它，`fromSeq + follow` 恢复链统一按真实可恢复事件推进。
- Pilot trace contract 收紧：`stream.started / stream.heartbeat / replay.* / run.metrics / done / error` 不再持久化到 trace，replay/follow/quota snapshot 会统一过滤历史 lifecycle 噪音。

---

## 当前主线（2 周）

1. P0：Windows App 索引与启动体验收口（Start Menu、UWP、registry uninstall、`launchArgs/workingDirectory`、真实 Windows 设备验证）。
2. P0：基础 legacy/compat 收口（清册退场目标统一为 `2.4.11`，禁止新增 legacy/raw channel/旧 storage/旧 SDK bypass）。
3. P1：文档治理收尾（TODO 按版本分层、第二批历史头标 + TL;DR 分层）。
4. P1：`Nexus 设备授权风控` 保留实施文档与验收入口，Phase 1 主体已完成。

---

## 已完成主线（不重复开发）

- OmniPanel 稳定版 MVP（2.4.8 Gate）
  - 真实窗口 smoke CI、失败路径回归、触发与窗口行为稳定性回归已完成。
- v2.4.7 Gate D/E 历史闭环
  - Gate D 由 `workflow_dispatch(sync_tag=v2.4.7)` 完成回填；Gate E 按 historical done 关闭。
- 2.4.9 插件完善主线
  - 权限中心 Phase5（SQLite 主存储 + 迁移回退）
  - View Mode 安全闭环 + Phase4
  - CLI Phase1+2 完整迁移

---

## 未闭环能力（按优先级）

### P0（2.4.10）

- 2.4.10 Windows App 索引与基础 legacy/compat 收口。

### P1（2.4.11 必须解决）

- Windows/macOS 阻塞级人工回归证据闭环。
- Linux documented best-effort smoke 与限制说明。
- Release Evidence 写入凭证/CI 证据闭环。
- `legacy/compat/size` 清册中过期到 `2.4.11` 的条目关闭或显式降权。
- Transport Wave A：MessagePort 高频通道迁移、`sendSync` 清理、retained raw event 分批 typed builder 迁移；当前 `typedMigrationCandidates` 为 `0`，下一批聚焦 CoreBox / terminal / auth / sync / opener 的保留理由与可迁移清单。
- Pilot Wave B：存量 typecheck/lint 清理与渠道矩阵回归。
- 架构 Wave C：优先 `plugin-module/search-core/file-provider` 剩余 SRP 拆分，并随切片降低对应 size allowlist；重构期 `size:guard` 默认阻断新增/增长并报告历史未增长债务，report/changed/release strict 模式分别用于全量审计、本地变更防回潮和发布收口；`clipboard.ts` 已低于 1200 行并清退 exception，`app-provider.ts` 已完成 source scanner 第一切片，后续进入 launch resolver / metadata enrichment 或转入 `plugin-module/search-core/file-provider`。

### P2+

- AttachUIView 深化（Warm/Cold 分层、Score 模型、可视化调试）。
- Multi Attach View 并行视图能力。
- Widget Sandbox 扩展拦截与审计。
- Nexus Provider 聚合与 Scene 编排（Provider registry、Capability、Scene、Strategy、Metering）；Provider registry 已有 D1 密文 `authRef` 凭证绑定、腾讯云 `text.translate` check、AI mirror `chat.completion` / `vision.ocr` check、Scene run 最小执行入口、普通登录态 runtime API、Dashboard run 面板与 Provider/Scene 深编辑、Dashboard Admin 默认 seed 入口、OmniPanel 划词翻译 Scene 接入、CoreBox 剪贴板图片 direct 截图翻译消费链路与置顶窗口、CoreBox 汇率预览与 `/api/exchange/*` Scene 优先链路、腾讯云图片翻译 `ImageTranslateLLM` adapter、汇率 `fx.rate.latest/fx.convert` Scene adapter、Intelligence provider Provider Registry 镜像、读取侧 bridge 合并旧表与 registry-only 镜像、OpenAI-compatible Intelligence mirror `vision.ocr` 默认 adapter、composed capability 链式编排与本地 `overlay.render` 客户端 overlay payload、`provider_usage_ledger` 安全审计/计量查询、`provider_health_checks` 健康历史查询与 `priority/least_cost/lowest_latency/balanced/manual` 最小策略路由，后续继续补旧 AI provider 表退场与 user-scope AI mirror OCR 绑定策略。
- Tuff 2.5.0 AI 桌面入口收口：PRD 已锁定版本定位与验收口径；CoreBox AI Ask 已先落最小 Stable 切片，继续推进 OmniPanel Writing Tools、Workflow `Use Model` 节点、Review Queue 与剪贴板整理/会议纪要/文本批处理模板，不得扩大到全量多模态、Assistant 默认启用或 Nexus Scene runtime 编排。

---

## 文档治理规则（本仓执行）

- 六主文档状态、日期、下一动作必须一致：
  - `docs/INDEX.md`
  - `docs/plan-prd/README.md`
  - `docs/plan-prd/TODO.md`
  - `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
  - `docs/plan-prd/01-project/RELEASE-2.4.7-CHECKLIST-2026-02-26.md`
  - `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- 每次文档改动后至少运行：
  - `pnpm docs:guard`
  - `pnpm docs:guard:strict`
- 历史事实优先进入 `CHANGES` 归档，不在入口文档重复叙事。

---

## 近 30 天重点变更索引

- Core App 性能诊断增强：`Clipboard` 慢路径新增 phase 级别分解、告警分级与原因码，并接入 `Perf summary`/`polling diagnostics` 聚合视图。
- Core App 性能链路降载：`file-index progress stream` 增加发送节流（latest-wins + 阶段优先），`Perf summary` 新增 `phaseAlertCode TopN` 聚合口径。
- `2.4.10-beta.19` 当前基线与 Windows App 索引回归推进。
- Native transport V1：`@talex-touch/tuff-native/screenshot`、`NativeEvents.capabilities/screenshot/fileIndex/file/media`、CoreApp `NativeCapabilitiesModule` 与 CoreBox “截图并复制”内置动作；文件索引/文件/媒体 V1 复用现有服务并以 `tfile`/metadata 传输，媒体 thumbnail 覆盖图片、HEIC 与常见视频，不迁移 OCR/Clipboard。
- Pilot 合并升级 V2：`/` 统一入口、`/pilot` 兼容跳转、`Quota Auto` 自动路由与渠道评比。
- CLI Phase1+2：`tuff-cli` 主入口、`tuff-cli-core` 核心迁移、`unplugin` shim 兼容。
- Pilot Chat/Turn 新协议：`turns/stream/messages` 路由与会话级串行队列。
- 文档治理门禁：`docs:guard` / `docs:guard:strict`；2026-03-17 文档盘点仅保留历史统计口径，当前路线以本页、`TODO` 与 `CHANGES` 为准。

详见：[CHANGES](./01-project/CHANGES.md)

---

## 维护说明

- 本页只保留“当前主线 + 高价值入口 + 未闭环能力”。
- 长尾背景、历史细节、分阶段实现推演统一下沉到 `CHANGES` 与专题文档。
