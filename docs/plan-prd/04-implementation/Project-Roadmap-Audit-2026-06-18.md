# 项目进展严重问题审计与收口口径

> 更新时间：2026-06-18
> 定位：2026-06-18 的历史 roadmap / release / pricing / docs hygiene 审计。实时任务顺序只看 [`../TODO.md`](../TODO.md)；本文不得作为当前仓库状态或执行入口。

## 1. 历史事实边界

- 本文捕获的是 2026-06-18 的审计结论；当时的 package version、commit、branch 与 worktree 数值由 Git 历史保留，不再复制到长期文档。
- 当时确认 release integrity 尚未闭环，GitHub/Nexus 可用不等于资产、签名和 updater 契约完成。
- 公共包发布已从独立 Roadmap blocker 降权；后续只以版本变更后的自动发版 workflow 结果为证据。

## 2. 严重问题分级

| 严重度   | 问题                                 | 当前风险                                                                                              | 立即动作                                                                                                                                                                                       |
| -------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0       | 文档 live-state 口径漂移             | Roadmap、README 与 Quality Baseline 曾复制不同版本/commit/worktree 快照，影响决策可信度 | 活跃入口只链接动态源码与 `TODO.md`；历史仓库状态由 Git 保留，不再写成当前事实                                                                                                                    |
| P0       | release integrity 未闭环             | GitHub/Nexus release 可用不等于资产完整性、签名 URL 与 signature endpoint 完成                        | `sha256`、`signatureUrl`、signature endpoint、manifest/download matrix 必须有真实链路证据                                                                                                      |
| Resolved | 公共包发布 blocker                   | 公共包发布不再作为独立 Roadmap / blocker / evidence 项                                                | 版本变更后只跟踪 GitHub 自动发版 workflow 结果；pack/preflight 仅保留为 CI hygiene                                                                                                             |
| P0       | AI 体验闭环缺证                      | CoreApp AI 架构已存在，但 Stable 仍缺 packaged Electron 文本/OCR成功、固定失败路径与 routing evidence | 优先补 CoreBox `text.chat`、显式 `vision.ocr -> text.chat`、未登录、provider unavailable、quota exhausted、model/capability unsupported、permission denied、Local/Ollama routing 八项 evidence |
| P1       | Search / Indexing 真实写入边界未完成 | SDK/diagnostics 已推进，但 File write/store、Everything 运行证据、Quicklinks feed/UI 仍可能被误判完成 | 下一批按 File write/store → Everything/Windows runtime evidence → Quicklinks feed/UI 执行                                                                                                      |
| P1       | 文档入口过载                         | README/INDEX/TODO 承载过多历史流水账，弱化当前 SoT                                                    | 活跃入口只保留当前事实、P0/P1 与高价值专题；审计长文迁入 archive 或索引化                                                                                                                      |
| P1       | AGENTS.md 过长且有漂移风险           | 技术栈、模块顺序、SDK marker 等易过期信息写死，后续代理可能按旧事实执行                               | 拆为根硬规则 + 子目录 AGENTS；易漂移事实改为链接到源码或当前执行计划                                                                                                                           |

## 3. 未推进或推进不足区域

- `Flow / DivisionBox / Automation / Skills`：仍是长期目标，近期没有形成可对外承诺的闭环证据。
- `Nexus production governance evidence`：本地 Wrangler / Miniflare 证据不等于 production / preview operator evidence；live send、object storage、production D1 migration/backfill、真实 provider quota 仍未闭环；固定矩阵见 `Evidence-Matrix-Nexus-Governance-2026-06-18.md`。
- 平台能力：owner 已完成平台验证，后续不再作为 Roadmap 待办或平台后续；实现仍必须保留可见 degraded/unsupported reason 与 fail-closed 行为；非阻塞 smoke 矩阵见 `Evidence-Matrix-Platform-2026-06-18.md`。
- `2.6.0 i18n / Domain Lexicon / Cloud Catalog`：Phase 0-4 已有运行时实现，包含 locale/localized value、plugin manifest localization、unit Domain Lexicon V1 与 permission-gated Plugin SDK facade；CatalogService、签名/SQLite import/activate/rollback 与质量门禁仍未完成。
- `订阅/定价产品化`：订阅旧 PRD 已标注历史待重写，不能作为当前定价 SoT；当前 pricing SoT 为 `Pricing-SoT-2026-06-18.md`。

## 4. 当前定价口径

- 当前公开口径：Pioneer 阶段全量开放，价格为 `0 元 / $0`。
- 现有 `FREE / PRO / PLUS / TEAM / ENTERPRISE` 仅是计划分层与权限模型，不代表正式金额已确定。
- 当前没有正式 credits 单价、团队席位价、超额计费或 GA 后价格表；这些不得在 roadmap 中写成已定。
- 当前 pricing SoT 已补在 `Pricing-SoT-2026-06-18.md`；Pioneer 免费期边界、GA 后候选价格、AI credits 赠送/超额策略、Team seat 计费方式、Pioneer 保价范围仍是待决策项。

## 5. 文档清理策略

- 不重写 Git 历史，除非文档包含 secret、隐私数据或法律风险。
- 从活跃入口移除长审计流水账，只保留最新审计入口与 archive 链接。
- 可降权对象：连续 `cross-platform-compat-placeholder-*` 报告、竞品分析 `micro-rounds/*`、旧 `260111/260222/260316` 实施文档、pre-compression/full 快照、`05-archive/*`。
- `README` / `INDEX` 只保留当前 SoT、P0/P1、少量高价值专题；历史事实继续进入 `CHANGES` 或 archive。

## 6. AGENTS.md 优化方向

- 根 `AGENTS.md` 只保留不可违反规则：语言、风险确认、Storage/Secret/Sync、SDK/i18n、验证命令、文档同步。
- `apps/core-app/AGENTS.md` 承载 Electron / CoreBox / Storage / AI / QuickOps / Indexing 规则。
- `apps/nexus/AGENTS.md` 承载 Nuxt / SEO / i18n / Data Governance / Provider Registry 规则。
- `plugins/AGENTS.md` 承载 manifest、permission、SDK marker、plugin secret、TuffEx 样式入口规则。
- 易漂移事实不写死：version、SDK marker、模块加载顺序与发布状态统一引用 `package.json`、源码、evidence 和 `TODO.md`。

## 7. 历史结论与现行入口

- 入口文档已改为动态读取版本并拒绝保存 branch/HEAD/worktree 快照。
- Release Integrity、AI packaged evidence、R3 与 Nexus deployed evidence 的实时顺序只由 [`../TODO.md`](../TODO.md) 维护。
- 本文保留问题分类与证据边界，不再发布“下一步”指令。
