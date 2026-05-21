# 文档索引

> 更新时间：2026-05-21
> 定位：仓库文档导航。当前执行状态以 `docs/plan-prd/TODO.md` 为准，历史事实以 `docs/plan-prd/01-project/CHANGES.md` 为准。

## 主入口

- `docs/plan-prd/README.md` - PRD / 规划主索引。
- `docs/plan-prd/TODO.md` - 当前 2 周执行清单。
- `docs/plan-prd/01-project/CHANGES.md` - 近 30 天变更日志与历史归档入口。
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md` - 产品总览与路线图。
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md` - PRD 质量基线与门禁约束。
- `docs/plan-prd/docs/TODO-BACKLOG-LONG-TERM.md` - 长期债务池。
- `docs/engineering/README.md` - 工程过程资料索引。

## 当前状态快照

- 当前基线：`2.4.10`（GitHub Release 与 Nexus release metadata sync 已成功）；当前 live tree 已进入 `2.4.11-beta.2`。
- 当前主线：`2.4.11` 关闭或显式降权剩余 legacy/compat/size 债务，补齐 Windows/macOS release-blocking 回归；Linux best-effort。CoreBox app launch handoff 已补 immediate hide，避免慢启动期间 launcher 可见卡死；AI compat 生产退役端点已钉住 HTTP `410` 与迁移目标，不再返回可消费占位 payload。
- 下一版本门槛：`2.5.0` AI 桌面入口收口，Stable 只承诺文本 + OCR；Workflow/Skills/Automation 保持 Beta。
- 质量现状：PR lint 已收敛为 changed-file lint；`file-provider.ts` 编译边界已恢复（完整 `fileProvider` 导出），CoreApp `typecheck:node` 已通过；2026-05-20 自动化审计未发现新的 P0 fixed fake-success，本轮已补 CoreBox app launch immediate-hide、MetaOverlay renderer action bridge、CoreApp secure-store `safeStorage` 优先后端与 Nexus retired intelligence endpoint 410 合同测试；2026-05-21 已继续推进 Assistant 截屏翻译 typed event、推荐上下文来源开关、可选 AI embedding/rerank fail-open 测试、壁纸个性化、设置页资产兼容提示、TuffEx 基础组件文档覆盖与 Nexus storage/upload lifecycle governance telemetry；`touch-snipaste` shell capability、`touch-window-presets` 展示期权限请求、Browser Data source-level diagnostics、widget runtime sandbox、裸 console 与 SRP 大文件仍是优先治理点；`quality:release` 仍被 CoreApp 既有 lint debt 阻断，需记录最近路径替代验证；旧 compat registry / legacy allowlist / size allowlist 已不在 live tree，治理以 `quality:pr`、`quality:release`、Windows acceptance verifier、最近路径测试与人工清单为准；npm 公共子包发布仍因仓库 `NPM_TOKEN` 无法 publish `@talex-touch` scope 阻塞。

## 高价值专题入口

- `docs/plan-prd/02-architecture/UNIFIED-LEGACY-COMPAT-STRUCTURE-REMEDIATION-PRD-2026-03-16.md` - Legacy/兼容/结构治理统一实施 PRD。
- `docs/plan-prd/03-features/ai-2.5.0-plan-prd.md` - Tuff 2.5.0 AI 桌面入口收口 Plan PRD。
- `docs/plan-prd/03-features/ai-2.5.3-local-knowledge-retrieval-prd.md` - Tuff 2.5.3 本地知识检索与上下文构建 PRD。
- `docs/plan-prd/03-features/ai-2.5.5-local-model-runtime-prd.md` - Tuff 2.5.5 本地开源模型运行时 PRD。
- `docs/plan-prd/03-features/ai-2.5.8-asr-provider-runtime-prd.md` - Tuff 2.5.8 ASR Provider Runtime PRD。
- `docs/plan-prd/03-features/cloudshare-plugin-content-prd.md` - CloudShare 插件内容包发布与 Store 展示 PRD。
- `docs/plan-prd/03-features/search/APP-DATA-PLUGINS-AND-EVERYTHING-ROADMAP.md` - App Data Plugins 与 Everything 收口 Roadmap。
- `docs/plan-prd/03-features/search/RAYCAST-UTOOLS-CAPABILITY-GAP-MATRIX.md` - Raycast / uTools 常用能力差距矩阵。
- `docs/plan-prd/02-architecture/intelligence-power-generic-api-prd.md` - Intelligence 能力路由与 Provider 抽象。
- `docs/plan-prd/02-architecture/nexus-provider-scene-aggregation-prd.md` - Nexus Provider 聚合与 Scene 编排重构 PRD。
- `docs/plan-prd/report/cross-platform-compat-placeholder-deep-review-2026-05-13.md` - 跨平台兼容与占位实现深度复核报告。
- `docs/plan-prd/report/cross-platform-compat-placeholder-followup-2026-05-14.md` - 跨平台兼容与占位实现跟进报告。
- `docs/plan-prd/report/cross-platform-compat-placeholder-summary-2026-05-15.md` - 跨平台兼容、占位实现与治理口径总结。
- `docs/plan-prd/report/cross-platform-compat-placeholder-deep-audit-2026-05-16.md` - 跨平台兼容、占位实现与架构健壮性深度审计。
- `docs/plan-prd/report/cross-platform-compat-placeholder-incremental-audit-2026-05-19.md` - 跨平台兼容、占位实现与架构健壮性增量审计。
- `docs/plan-prd/report/cross-platform-compat-placeholder-automation-audit-2026-05-20.md` - 跨平台兼容、占位实现与架构健壮性自动化审计。
- `docs/plan-prd/report/coreapp-startup-async-blocking-analysis-2026-05-13.md` - CoreApp 启动异步化与首屏卡顿分析。
- `docs/plan-prd/04-implementation/NexusDeviceAuthRiskControl-260316.md` - Nexus 设备授权风控实施方案。
- `docs/plan-prd/docs/NEXUS-RELEASE-ASSETS-CHECKLIST.md` - Release assets 核对入口。
- `retired-ai-app/deploy/README.zh-CN.md` - AI 1Panel 部署手册。
- 2.5.0 Intelligence 当前切片：CoreBox AI Ask handoff session、Nexus `/api/v1/intelligence/invoke` credits 扣减与 CoreApp credits summary、Tuff-native Tool Kit foundation、Nexus docs prerender 已进入 dev 分支；仍不得抢占 `2.4.11` 稳定化与债务退场主线。
- 2.5.3 本地知识方向：SQLite / FTS5 / metadata / Context Builder 优先，embeddings 与 rerank 作为增强项，不把向量数据库作为 MVP 第一优先级。
- 2.5.5 本地模型方向：不强依赖 Ollama，优先内置 GGUF / `llama.cpp` runtime；Ollama 仅作为可选兼容后端，模型权重按需下载到用户数据目录。
- 2.5.8 ASR 方向：本地 `whisper.cpp` + 云端 ASR provider 抽象，支持 `local-only/cloud-only/auto`；TTS 不进入 Stable。
- Nexus 数据治理方向：共享 governance event/config foundation、`/api/dashboard/governance/analytics` 聚合 API、search/visit telemetry bridge 与后台 analytics cockpit 已覆盖脱敏用户注册/增长、插件下载/安装/调用、搜索 trend/heatmap、filter/provider latency/results/status、result category、geo/timezone、上传 lifecycle started/completed/failed、attemptId/duration/statusCode 脱敏元数据、资源上传失败原因/资源类型/content type/存储渠道/大小统计，且上传 lifecycle 治理写入已有超时保护，不会因治理库卡住阻塞真实上传主链；图片读写删/发布资产/签名读写/插件包 publish/re-edit upload lifecycle、插件图标手动上传/包内提取 upload lifecycle 与读写删 storage telemetry、存储渠道策略评估与操作前 enforcement（maxBytes 约束写入、trafficBytes 约束读取、operation 约束写/读/删）、local/R2/S3/OSS policy catalog 与 Data Governance profile 选择/默认 limits/config、encrypted `secure://storage/*` storage credential 绑定、memory/R2/S3-compatible/OSS 共享 object storage executor、通知渠道策略、插件审核通知投递计划/审计、多 Resend/SMTP/Feishu provider 实例配置语义、`secure://notifications/*` D1 加密凭据绑定、通知投递 planned/sent/skipped/failed 健康指标与 sentRate、Provider quota、provider token/request 消耗与 model/provider type 分布；单插件 analytics API 已返回下载/安装/调用 trend、unique actors、geo/channel/action/version/artifact/package-size breakdown，Dashboard assets 插件详情抽屉已对 owner/admin 展示这些私有分析指标。Release asset/signature 与 plugin package storage usage 已分离真实 object key 与脱敏 governance resource id，插件包按稳定 `plugin:{id}:version:{channel}:{version}` 聚合，插件图标按稳定 `plugin:{id}:icon` 聚合，避免以原始上传文件名或随机 `.tpex` key 聚合治理事件；通知默认仍是 plan-only，配置 `mode: "send"` 时 browser adapter 会写入按用户隔离的持久 inbox，并提供 `/api/dashboard/notifications/inbox` 查询与标记已读 API；Resend/webhook/Feishu/Lark 仍要求 secure credentials 与运行时收件人后发送，SMTP、Web Push / OS Notification permission 与真实浏览器可见证据仍未完成；S3/OSS 已接 dedicated object storage executor，但仍缺 live storage evidence 与生产凭据/迁移回填。后续继续补真实浏览器证据、真实凭据/live send 证据、SMTP adapter、S3/OSS live storage evidence、生产 D1 migration/backfill 和更完整运营大屏。
- Nexus Intelligence direct invoke quota：`/api/v1/intelligence/invoke` / Lab model 调用已在模型 dispatch 前 enforce `intelligence_provider_quota`，并用稳定 Provider Registry governance id（`metadata.providerRegistryId ?? provider.id`）记录 `provider.request` 与 provider usage ledger/governance usage；公开返回的 provider id 维持兼容。
- Nexus Provider Registry quota admin：Provider Registry Admin provider 卡片已展示 per-provider quota 状态、request/token/window 摘要，并通过既有 `/api/dashboard/provider-registry/providers/:id/quota` GET/POST API 直接编辑配额，管理员不再必须到通用 Data Governance 表单手填 provider id。
- App Data Plugins 与 Everything 方向：先建立统一数据源/索引诊断基线；Calculator 显式入口、`touch-snippets` date/time/uuid/clipboard 首批 placeholders、`touch-emoji-symbols` 首版 emoji/symbol 搜索复制已落地，后续继续补 Browser Data、Everything/App Launcher evidence、Quicklinks 与 Context Actions；Nexus SDK 插件开发任务流已落地，TuffEx CommandPalette 场景化 demo、基础组件与 per-component docs 首批覆盖已完成，后续继续深化真实使用场景；不包含更新系统 Nexus Hard-Cut。
- 插件发布当前切片：`touch-intelligence` 已补齐 Nexus 发布资产并修复 1.0.0 运行时加载源码 TS 的问题；1.0.1 包使用 bundled prelude 与 `@talex-touch/tuff-intelligence/client` CJS 入口，可重新发布到 Nexus；公共 npm 子包补发仍等待具备 `@talex-touch` publish 权限的 `NPM_TOKEN`。

## 归档与降权

- `docs/plan-prd/05-archive/*` - 历史 PRD 归档，不参与当前里程碑状态统计。
- `docs/plan-prd/next-edit/*` - 草稿池，不作为发布判定来源。
- `docs/plan-prd/docs/archive/TODO-pre-compression-2026-05-14.md` - TODO 压缩前快照。
- `docs/plan-prd/01-project/archive/changes/CHANGES-pre-doc-compression-2026-05-14.md` - CHANGES 压缩前快照。
- `docs/plan-prd/docs/archive/PRD-QUALITY-BASELINE-pre-compression-2026-05-14.md` - 质量基线压缩前快照。
- `docs/plan-prd/01-project/archive/PRODUCT-OVERVIEW-ROADMAP-2026Q1-pre-compression-2026-05-14.md` - 路线图压缩前快照。
- `docs/engineering/archive/README-pre-compression-2026-05-14.md` - Engineering README 压缩前快照。
- `docs/engineering/archive/ARCHIVE-pre-compression-2026-05-14.md` - Engineering ARCHIVE 压缩前快照。

## 文档维护规则

- 行为/接口/架构变更至少同步 `README / TODO / CHANGES / INDEX` 之一。
- 目标或质量门禁变化必须同步 Roadmap 与 Quality Baseline。
- 入口文档不承载长历史；长尾任务进入长期债务池，历史事实进入 CHANGES 或 archive。
