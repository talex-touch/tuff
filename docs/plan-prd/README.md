# Talex Touch - 项目文档中心

> 更新时间：2026-05-21
> 定位：PRD / 规划主入口。历史长文已下沉到 `CHANGES` 与专题文档；当前执行项以 `TODO.md` 为准。

## 快速入口

- [项目待办（2 周主清单）](./TODO.md)
- [产品总览与路线图](./01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md)
- [变更日志（近 30 天 + 历史归档）](./01-project/CHANGES.md)
- [文档质量基线](./docs/PRD-QUALITY-BASELINE.md)
- [长期债务池](./docs/TODO-BACKLOG-LONG-TERM.md)
- [文档盘点历史快照（2026-03-17）](./docs/DOC-INVENTORY-AND-NEXT-STEPS-2026-03-17.md)

## 当前单一口径

- 当前基线：`2.4.10`（GitHub Release 与 Nexus release metadata sync 已成功）；当前 live tree 已进入 `2.4.11-beta.2`。
- 当前主线：`2.4.11` 关闭或显式降权剩余 legacy/compat/size 债务，补齐 Windows/macOS 阻塞级回归；Linux 保持 documented best-effort。CoreBox app launch handoff 已补 immediate hide，避免慢启动期间 launcher 可见卡死；AI compat 生产退役端点已钉住 HTTP `410` 与迁移目标，不再返回可消费占位 payload。
- 下一版本门槛：`2.5.0` AI 桌面入口收口，Stable 只承诺文本 + OCR，Workflow/Skills/Automation 保持 Beta。
- 质量现状：PR lint 已收敛为 changed-file lint；`file-provider.ts` 编译边界已恢复（完整 `fileProvider` 导出），CoreApp `typecheck:node` 已通过；2026-05-20 自动化审计未发现新的 P0 fixed fake-success，本轮已补 CoreBox app launch immediate-hide、MetaOverlay renderer action bridge、CoreApp secure-store `safeStorage` 优先后端与 Nexus retired intelligence endpoint 410 合同测试；2026-05-21 已继续推进 Assistant 截屏翻译 typed event、推荐上下文来源开关、可选 AI embedding/rerank fail-open 测试、壁纸个性化、设置页资产兼容提示、TuffEx 基础组件文档覆盖与 Nexus storage/upload lifecycle governance telemetry；`touch-snipaste` shell capability、`touch-window-presets` 展示期权限请求、Browser Data source-level diagnostics、widget runtime sandbox、裸 console 与 SRP 大文件仍是优先治理点；`quality:release` 仍受 CoreApp 既有 lint debt 阻断，需记录最近路径替代验证；旧 compat registry / legacy allowlist / size allowlist 已不在 live tree，治理以 `quality:pr`、`quality:release`、Windows acceptance verifier、最近路径测试与人工清单为准；npm 公共子包发布仍因 `NPM_TOKEN` 无法 publish `@talex-touch` scope 阻塞。
- 范围约束：`2.5.0` AI、Provider Registry 高级策略、SRP 大拆分可继续规划/小切片，但不得抢占 `2.4.11` 稳定化与债务退场主线。

## 当前主线（2 周）

1. 继续收敛 `2.4.11` legacy/compat/size 债务，不新增 legacy/raw channel/旧 storage/旧 SDK bypass；旧自动清册不再作为 live SoT。
2. 聚焦插件 shell capability、动态执行边界、secret backend 与 SRP 小切片，不再做泛化 placeholder 扫描。
3. 补齐 Windows/macOS 阻塞级人工回归；Linux 仅记录 best-effort smoke 与桌面环境限制。
4. 推进 `2.5.0` AI 桌面入口小切片，但 Stable 范围保持文本 + OCR。

详见：[TODO](./TODO.md)。

## 未闭环能力

### P0 - 2.4.11

- Windows/macOS 阻塞级人工回归证据闭环。
- Linux best-effort smoke 与限制说明。
- AI 兼容占位成功响应退场：当前 live tree 已无历史 `retired-ai-app` 路径；Nexus `intelligence-lab/*` 与旧 orchestrator 入口返回 `410` 与迁移目标，仍按 TODO 继续防止新增生产 fake-success。
- CLI token 与插件 provider secret storage 收口：文件权限缓解与 `usePluginSecret()` 迁移已推进；CoreApp secure-store 已优先 Electron `safeStorage`，Credential Locker/libsecret 与遗留 secret evidence 仍待闭环。
- 插件 shell capability 诊断统一。
- Transport Wave A retained alias/hard-cut 继续推进。
- CoreApp 启动异步化真机 benchmark 与长尾补证。
- 公共 npm 子包补发：`@talex-touch/utils@1.0.50`、`@talex-touch/tuffex@0.3.5`、`@talex-touch/unplugin-export-plugin@1.2.16`、`@talex-touch/tuff-cli@0.0.3`、`@talex-touch/tuff-core@0.0.1`、`@talex-touch/tuff-intelligence@0.0.2` 仍需刷新具备 `@talex-touch` publish 权限的 `NPM_TOKEN` 后补发。

### P1+

- Tuff 2.5.0 AI 桌面入口：CoreBox AI Ask、handoff session、Nexus invoke credits 扣减、CoreApp credits summary、Tuff-native Tool Kit foundation、Nexus docs prerender routes 与 OmniPanel Writing Tools MVP 已进入 dev 切片，后续 Workflow `Use Model`、完整 Review Queue 与 P0 模板。
- Tuff 2.5.3 本地知识检索：方向已锁定为 SQLite / FTS5 / metadata / Context Builder 优先，embeddings 与 rerank 作为增强项，不把向量数据库作为 MVP 第一优先级。
- Tuff 2.5.5 本地开源模型运行时：方向已锁定为“不强依赖 Ollama，优先内置 GGUF / llama.cpp runtime”；Ollama 仅作为可选兼容后端，模型权重按需下载到用户数据目录，不进入应用安装包。
- Tuff 2.5.8 ASR Provider Runtime：方向已锁定为本地 `whisper.cpp` + 云端 ASR provider 抽象，支持 `local-only/cloud-only/auto` 策略；TTS 不进入该版本 Stable。
- App Data Plugins 与 Everything 收口：新增 Roadmap 与 Raycast/uTools 常用能力差距矩阵，Calculator 显式入口、`touch-snippets` date/time/uuid/clipboard 首批 placeholders、`touch-emoji-symbols` 首版 emoji/symbol 搜索复制已落地；后续聚焦 Browser Data、Everything/App Launcher evidence、Quicklinks、Context Actions，以及 Windows Everything SDK/CLI 策略、路径授权过滤与真机 evidence；Nexus SDK 插件开发任务流文档已落地，TuffEx 场景化 demo、基础组件与 per-component docs 首批覆盖已完成，后续继续深化真实使用场景；不包含更新系统 Nexus Hard-Cut。
- Nexus Provider Registry / Scene 编排：已具备 secure store、Scene run、Dashboard run、AI mirror、health/usage ledger 与最小策略路由，后续补旧 AI provider 表退场与高级策略。
- Nexus Data Governance / Analytics：已新增共享治理事件与配置层、`/api/dashboard/governance/analytics` 聚合 API、search/visit telemetry bridge 与后台 Data Governance analytics cockpit，覆盖脱敏用户注册/增长、插件下载/安装/调用、搜索 trend/heatmap、filter/provider latency/results/status、result category、geo/timezone、上传生命周期 started/completed/failed、attemptId/duration/statusCode 脱敏元数据、资源上传失败原因/资源类型/content type/存储渠道/大小统计，且上传 lifecycle 治理写入已有超时保护，不会因治理库卡住阻塞真实上传主链；图片读写删/发布资产/签名读写/插件包 publish/re-edit upload lifecycle、插件图标手动上传/包内提取 upload lifecycle 与读写删 storage telemetry、存储渠道策略评估与操作前 enforcement（maxBytes 约束写入、trafficBytes 约束读取、operation 约束写/读/删）、local/R2/S3/OSS policy catalog 与 Data Governance profile 选择/默认 limits/config、encrypted `secure://storage/*` storage credential 绑定、memory/R2/S3-compatible/OSS 共享 object storage executor、通知渠道策略、插件审核通知投递计划/审计、多 Resend/SMTP/Feishu provider 实例配置语义、`secure://notifications/*` D1 加密凭据绑定、通知投递 planned/sent/skipped/failed 健康指标与 sentRate、Provider quota、provider token/request 消耗与 model/provider type 分布；单插件 analytics API 已返回下载/安装/调用 trend、unique actors、geo/channel/action/version/artifact/package-size breakdown，以及评论状态、已通过平均评分和评分分布，Dashboard assets 插件详情抽屉已对 owner/admin 展示这些私有分析指标与评论质量。Release asset/signature 与 plugin package storage usage 已分离真实 object key 与脱敏 governance resource id，插件包按稳定 `plugin:{id}:version:{channel}:{version}` 聚合，插件图标按稳定 `plugin:{id}:icon` 聚合，避免以原始上传文件名或随机 `.tpex` key 聚合治理事件。通知默认仍是 plan-only，配置 `mode: "send"` 时 browser adapter 会写入按用户隔离的持久 inbox，并提供 `/dashboard/notifications` 用户侧通知中心、浏览器原生通知权限/测试入口、`/api/dashboard/notifications/inbox` 查询与标记已读 API、`/api/dashboard/notifications/channels/test` 指定渠道 dry-run/按配置 send 测试 API；Data Governance 页面已接入通知渠道测试面板，可直接选择保存的渠道查看 delivery status/reason/provider/adapter。Resend/webhook/Feishu/Lark 仍要求 secure credentials 与运行时收件人后发送，SMTP、Web Push 推送与真实跨浏览器可见证据仍未完成；S3/OSS 已接 dedicated object storage executor，但仍缺 live storage evidence 与生产凭据/迁移回填。后续补真实浏览器证据、真实凭据/live send 证据、SMTP adapter、S3/OSS live storage evidence、生产 D1 migration/backfill 与更完整运营大屏。
- Nexus Intelligence direct invoke quota：`/api/v1/intelligence/invoke` / Lab model 调用已在模型 dispatch 前 enforce `intelligence_provider_quota`，并用稳定 Provider Registry governance id（`metadata.providerRegistryId ?? provider.id`）记录 `provider.request` 与 provider usage ledger/governance usage；公开返回的 provider id 维持兼容。
- Nexus Provider Registry quota admin：Provider Registry Admin provider 卡片已展示 per-provider quota 状态、request/token/window 摘要，并通过既有 `/api/dashboard/provider-registry/providers/:id/quota` GET/POST API 直接编辑配额，管理员不再必须到通用 Data Governance 表单手填 provider id。
- Native transport V1：补 macOS/Windows/Linux 真机 smoke 与打包依赖验证。
- AttachUIView、Multi Attach View、Widget Sandbox、Flow Transfer、DivisionBox 等进入长期债务池。

## 高价值专题入口

- [Legacy/兼容/结构治理统一实施 PRD](./02-architecture/UNIFIED-LEGACY-COMPAT-STRUCTURE-REMEDIATION-PRD-2026-03-16.md)
- [Tuff 2.5.0 AI 桌面入口收口 Plan PRD](./03-features/ai-2.5.0-plan-prd.md)
- [Tuff 2.5.3 本地知识检索 PRD](./03-features/ai-2.5.3-local-knowledge-retrieval-prd.md)
- [Tuff 2.5.5 本地开源模型运行时 PRD](./03-features/ai-2.5.5-local-model-runtime-prd.md)
- [Tuff 2.5.8 ASR Provider Runtime PRD](./03-features/ai-2.5.8-asr-provider-runtime-prd.md)
- [CloudShare 插件内容包发布 PRD](./03-features/cloudshare-plugin-content-prd.md)
- [App Data Plugins 与 Everything 收口 Roadmap](./03-features/search/APP-DATA-PLUGINS-AND-EVERYTHING-ROADMAP.md)
- [Raycast / uTools 常用能力差距矩阵](./03-features/search/RAYCAST-UTOOLS-CAPABILITY-GAP-MATRIX.md)
- [Nexus Provider 聚合与 Scene 编排 PRD](./02-architecture/nexus-provider-scene-aggregation-prd.md)
- [Nexus Intelligence Provider 旧表退场实施计划](./04-implementation/NexusIntelligenceProviderRetirement-2026-05-16.md)
- [Intelligence 能力路由与 Provider 抽象](./02-architecture/intelligence-power-generic-api-prd.md)
- [跨平台兼容与占位实现深度复核报告](./report/cross-platform-compat-placeholder-deep-review-2026-05-13.md)
- [跨平台兼容与占位实现跟进报告](./report/cross-platform-compat-placeholder-followup-2026-05-14.md)
- [跨平台兼容、占位实现与治理口径总结](./report/cross-platform-compat-placeholder-summary-2026-05-15.md)
- [跨平台兼容、占位实现与架构健壮性深度审计](./report/cross-platform-compat-placeholder-deep-audit-2026-05-16.md)
- [跨平台兼容、占位实现与架构健壮性增量审计](./report/cross-platform-compat-placeholder-incremental-audit-2026-05-19.md)
- [跨平台兼容、占位实现与架构健壮性自动化审计](./report/cross-platform-compat-placeholder-automation-audit-2026-05-20.md)
- [CoreApp 启动异步化与首屏卡顿分析](./report/coreapp-startup-async-blocking-analysis-2026-05-13.md)
- [Nexus 设备授权风控实施方案](./04-implementation/NexusDeviceAuthRiskControl-260316.md)
- [v2.4.7 发版收口清单（historical）](./01-project/RELEASE-2.4.7-CHECKLIST-2026-02-26.md)

## 文档治理规则

- 入口文档只保留当前事实、下一动作与高价值导航；历史细节进入 `CHANGES` 或 archive。
- 行为/接口/架构改动至少同步 `README / TODO / CHANGES / INDEX` 之一。
- 目标或质量门禁变化必须同时同步 Roadmap 与 Quality Baseline。
- `TODO.md` 只承载 2 周主清单；长期事项进入 `TODO-BACKLOG-LONG-TERM.md`。
- `CHANGES.md` 只保留近 30 天；完整压缩前快照见 `01-project/archive/changes/CHANGES-pre-doc-compression-2026-05-14.md`。
