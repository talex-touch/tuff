# 项目进展严重问题审计与收口口径

> 更新时间：2026-06-18
> 定位：当前 roadmap / release / pricing / docs hygiene 的高风险问题收敛口径。本文只记录事实与下一步，不替代 `TODO.md` 的任务清单，也不把本地 preflight 误写为生产完成。

## 1. 当前事实基线

- 当前稳定基线：`2.4.10`。
- 当前代码版本：root / CoreApp `2.4.12-beta.8`。
- 当前本地 `HEAD=6b156fa31 fix(nexus): hide team credit pool for personal accounts`。
- 当前工作区存在大量未提交改动，覆盖 CoreApp、Nexus、packages、docs 与新增 QuickOps / i18n 文档；后续必须按 related-only 批次拆分验证。
- 最近完整发布链路证据仍是 `v2.4.11-beta.6` GitHub prerelease、Nexus BETA latest sync 与 Gate D strict 复核。
- `2.4.11` release checklist 已有本地/CI 通过记录；release integrity 仍未闭环。公共包发布已从当前 Roadmap blocker 降权，后续只跟踪版本变更 push 到 GitHub 后的自动发版 workflow 结果。

## 2. 严重问题分级

| 严重度 | 问题 | 当前风险 | 立即动作 |
| --- | --- | --- | --- |
| P0 | 文档版本与 HEAD 口径漂移 | Roadmap、README、Quality Baseline 曾混用 `2.4.11-beta.8`、`2.4.12-beta.6` 与不同 HEAD，影响决策可信度 | 入口统一指向本文与 `Current-Execution-Plan`；不再把历史 HEAD 写成当前事实 |
| P0 | release integrity 未闭环 | GitHub/Nexus release 可用不等于资产完整性、签名 URL 与 signature endpoint 完成 | `sha256`、`signatureUrl`、signature endpoint、manifest/download matrix 必须有真实链路证据 |
| Resolved | 公共包发布 blocker | 公共包发布不再作为独立 Roadmap / blocker / evidence 项 | 版本变更后只跟踪 GitHub 自动发版 workflow 结果；pack/preflight 仅保留为 CI hygiene |
| P0 | AI 体验闭环缺证 | CoreApp AI 架构已存在，但 Stable 仍缺 packaged Electron 文本/OCR成功、固定失败路径与 routing evidence | 优先补 CoreBox `text.chat`、显式 `vision.ocr -> text.chat`、未登录、provider unavailable、quota exhausted、model/capability unsupported、permission denied、Local/Ollama routing 八项 evidence |
| P1 | Search / Indexing 真实写入边界未完成 | SDK/diagnostics 已推进，但 File write/store、Everything 运行证据、Quicklinks feed/UI 仍可能被误判完成 | 下一批按 File write/store → Everything/Windows runtime evidence → Quicklinks feed/UI 执行 |
| P1 | 文档入口过载 | README/INDEX/TODO 承载过多历史流水账，弱化当前 SoT | 活跃入口只保留当前事实、P0/P1 与高价值专题；审计长文迁入 archive 或索引化 |
| P1 | AGENTS.md 过长且有漂移风险 | 技术栈、模块顺序、SDK marker 等易过期信息写死，后续代理可能按旧事实执行 | 拆为根硬规则 + 子目录 AGENTS；易漂移事实改为链接到源码或当前执行计划 |

## 3. 未推进或推进不足区域

- `Flow / DivisionBox / Automation / Skills`：仍是长期目标，近期没有形成可对外承诺的闭环证据。
- `Nexus production governance evidence`：本地 Wrangler / Miniflare 证据不等于 production / preview operator evidence；live send、object storage、production D1 migration/backfill、真实 provider quota 仍未闭环；固定矩阵见 `Evidence-Matrix-Nexus-Governance-2026-06-18.md`。
- 平台能力：owner 已完成平台验证，后续不再作为 Roadmap 待办或平台后续；实现仍必须保留可见 degraded/unsupported reason 与 fail-closed 行为；非阻塞 smoke 矩阵见 `Evidence-Matrix-Platform-2026-06-18.md`。
- `2.6.0 i18n / Domain Lexicon / Cloud Catalog`：当前是 PRD 与质量约束，不是运行时完成。
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
- 易漂移事实不写死：当前版本、SDK marker、模块加载顺序、发布状态统一引用 `package.json`、源码与本执行计划。

## 7. 下一步顺序

1. 同步入口文档到当前 `2.4.12-beta.8` / `HEAD=6b156fa31` 口径，并引用本文。
2. 拆分当前 dirty worktree，按 related-only 验证与提交，不混合 QuickOps、Nexus、AI、docs、packages。
3. 先补 R1 Release Integrity，再宣称发布链路完整闭环。
4. 补 AI packaged Electron 八项固定 evidence（CoreBox `text.chat`、显式 `vision.ocr -> text.chat`、未登录、provider unavailable、quota exhausted、model/capability unsupported、permission denied、Local/Ollama routing），再宣称 `2.5.0` AI Stable 体验闭环。
5. 入口文档瘦身与 AGENTS.md 分层已落地；后续保持 README/INDEX 只承载当前 SoT 与高价值导航。
