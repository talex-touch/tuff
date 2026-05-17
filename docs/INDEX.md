# 文档索引

> 更新时间：2026-05-16
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

- 当前基线：`2.4.10-beta.25`。
- 当前主线：`2.4.10` Windows App 索引、Windows 应用启动体验、基础 legacy/compat 收口与 release evidence。
- 当前阻塞：Windows 真机 evidence、search trace `200` 样本、clipboard stress `120000ms`、Windows final acceptance gate、Nexus Release Evidence 写入。
- 下一版本门槛：`2.4.11` 关闭或显式降权剩余 legacy/compat/size 债务，补齐 Windows/macOS release-blocking 回归；Linux best-effort。
- 质量现状：PR lint 已收敛为 changed-file lint；`file-provider.ts` 编译边界已恢复（完整 `fileProvider` 导出），CoreApp `typecheck:node` 已通过；2026-05-16 live-tree 审计未发现新的 P0 fixed fake-success；`quality:release` 仍被 CoreApp 既有 lint debt 阻断，需记录最近路径替代验证；旧 compat registry / legacy allowlist / size allowlist 已不在 live tree，治理以 `quality:pr`、`quality:release`、Windows acceptance verifier、最近路径测试与人工清单为准。

## 高价值专题入口

- `docs/plan-prd/02-architecture/UNIFIED-LEGACY-COMPAT-STRUCTURE-REMEDIATION-PRD-2026-03-16.md` - Legacy/兼容/结构治理统一实施 PRD。
- `docs/plan-prd/03-features/ai-2.5.0-plan-prd.md` - Tuff 2.5.0 AI 桌面入口收口 Plan PRD。
- `docs/plan-prd/03-features/ai-2.5.3-local-knowledge-retrieval-prd.md` - Tuff 2.5.3 本地知识检索与上下文构建 PRD。
- `docs/plan-prd/03-features/ai-2.5.5-local-model-runtime-prd.md` - Tuff 2.5.5 本地开源模型运行时 PRD。
- `docs/plan-prd/03-features/ai-2.5.8-asr-provider-runtime-prd.md` - Tuff 2.5.8 ASR Provider Runtime PRD。
- `docs/plan-prd/02-architecture/intelligence-power-generic-api-prd.md` - Intelligence 能力路由与 Provider 抽象。
- `docs/plan-prd/02-architecture/nexus-provider-scene-aggregation-prd.md` - Nexus Provider 聚合与 Scene 编排重构 PRD。
- `docs/plan-prd/report/cross-platform-compat-placeholder-deep-review-2026-05-13.md` - 跨平台兼容与占位实现深度复核报告。
- `docs/plan-prd/report/cross-platform-compat-placeholder-followup-2026-05-14.md` - 跨平台兼容与占位实现跟进报告。
- `docs/plan-prd/report/cross-platform-compat-placeholder-summary-2026-05-15.md` - 跨平台兼容、占位实现与治理口径总结。
- `docs/plan-prd/report/cross-platform-compat-placeholder-deep-audit-2026-05-16.md` - 跨平台兼容、占位实现与架构健壮性深度审计。
- `docs/plan-prd/report/coreapp-startup-async-blocking-analysis-2026-05-13.md` - CoreApp 启动异步化与首屏卡顿分析。
- `docs/plan-prd/04-implementation/NexusDeviceAuthRiskControl-260316.md` - Nexus 设备授权风控实施方案。
- `docs/plan-prd/docs/NEXUS-RELEASE-ASSETS-CHECKLIST.md` - Release assets 核对入口。
- `retired-ai-app/deploy/README.zh-CN.md` - AI 1Panel 部署手册。
- 2.5.0 Intelligence 当前切片：CoreBox AI Ask handoff session、Nexus `/api/v1/intelligence/invoke` credits 扣减与 CoreApp credits summary、Tuff-native Tool Kit foundation、Nexus docs prerender 已进入 dev 分支；仍不得抢占 `2.4.10` Windows release evidence gate。
- 2.5.3 本地知识方向：SQLite / FTS5 / metadata / Context Builder 优先，embeddings 与 rerank 作为增强项，不把向量数据库作为 MVP 第一优先级。
- 2.5.5 本地模型方向：不强依赖 Ollama，优先内置 GGUF / `llama.cpp` runtime；Ollama 仅作为可选兼容后端，模型权重按需下载到用户数据目录。
- 2.5.8 ASR 方向：本地 `whisper.cpp` + 云端 ASR provider 抽象，支持 `local-only/cloud-only/auto`；TTS 不进入 Stable。
- 插件发布当前切片：`touch-intelligence` 已补齐 Nexus 发布资产并修复 1.0.0 运行时加载源码 TS 的问题；1.0.1 包使用 bundled prelude 与 `@talex-touch/tuff-intelligence/client` CJS 入口，可重新发布到 Nexus。

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
