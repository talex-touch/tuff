# 当前项目进程与执行计划

> 更新时间：2026-06-18
> 定位：当前项目进程的短期执行 SoT。阶段化路线以 `Roadmap-vNext-2026-06-18.md` 为准，历史事实仍以 `../01-project/CHANGES.md` 为准，具体任务状态仍以 `../TODO.md` 为准。

## 1. 当前事实

- 当前稳定基线：`2.4.10`。
- 当前代码版本：root / CoreApp `2.4.12-beta.8`。
- 当前分支：`master`。
- 最近完整发布链路证据：`v2.4.11-beta.6` GitHub prerelease、Nexus BETA latest sync 与 Gate D strict 复核。
- `2.4.11` release checklist 已有完成记录：`quality:pr`、`publish:check`、`publish:check:pack`、`typecheck:all`、`quality:release` 与 `git diff --check` 均已通过。
- 新决策：公共包发布不再作为独立 Roadmap / blocker / evidence 项；后续只跟踪“版本变更后 push 到 GitHub 触发自动发版 workflow”的 CI/CD 结果。
- 新决策：平台验证已由 owner 完成，后续从 Roadmap、P0/P1、平台后续与 evidence 队列中移除。

## 2. 当前主线

1. **R0 口径清理**：把旧公共包发布 blocker、平台验证 blocker 与历史平台后续语义从活跃入口中移除，统一指向 vNext Roadmap。
2. **R1 Release Integrity**：补 Nexus release asset `sha256`、`signatureUrl`、signature endpoint、manifest/download matrix 自动校验。
3. **R2 AI 2.5.0 Stable**：修 provider routing，Local/Ollama 优先；补 CoreBox AI Ask 文本 + 显式 OCR、固定失败路径与 routing UI/log evidence。
4. **R3 Search / Indexing Runtime**：把 File write/store boundary、SQLite/FTS 写入、`scan_progress`、integrity reset 与 durable job history 收敛到 runtime task/store。
5. **R4-R7 并行小切片**：QuickOps 产品化、Plugin Trust Boundary、UI/TuffEx、Nexus Governance 按 related-only 推进。
6. **R8-R9 后续能力**：i18n / Domain Lexicon / Catalog 2.6.0 与 AI 2.5.x 后续不抢 R1-R3 稳定化窗口。

## 3. vNext Roadmap 摘要

| 阶段 | 主线 | 下一动作 | 验收证据 |
| --- | --- | --- | --- |
| R0 | 口径清理 | 同步 README / TODO / INDEX / Roadmap / Quality Baseline / CHANGES | 活跃文档无旧公共包发布凭据 blocker、无平台验证待办；`git diff --check` 通过 |
| R1 | Release Integrity | 对齐 Nexus `sha256`、`signatureUrl`、signature endpoint、manifest/download matrix | GitHub Release ↔ Nexus release metadata 自动校验通过 |
| R2 | AI 2.5.0 Stable | 修 provider routing；Local/Ollama 优先；补 CoreBox 文本/OCR、失败路径 UI 与 routing log/trace | `text.chat` / `vision.ocr -> text.chat` 成功，未登录、provider unavailable、quota/model unsupported、permission denied 与 Local/Ollama routing 可解释 |
| R3 | Search / Indexing Runtime | 迁移 File write/store、progress、integrity reset、durable job history | FileProvider 写入/进度/重置走 runtime task/store；focused tests 覆盖 |
| R4 | QuickOps 产品化 | 番茄钟模板列表/高级循环、清洁屏幕自动视觉合同、app quit cleanup、Flow/AI adapter | runtime 可持续清理；无系统副作用；测试覆盖 |
| R5 | Plugin Trust Boundary | 补剩余 shell/OS/network/fs/clipboard surface、secret cleanup UX、Widget sandbox 长尾 | 权限缺失 fail-closed；不写明文 secret；focused tests 覆盖 |
| R6 | UI / TuffEx | 主路径语义控件、keyboard/focus、legacy Tabs/Menu/Drawer、visual smoke | scoped ESLint + UI focused tests；减少 `div/span @click` 债务 |
| R7 | Nexus Governance | Provider Registry / Intelligence Admin、live send/object storage/D1 backfill/provider quota | 生产/preview runbook 和 API/UI evidence 可复现 |
| R8 | i18n / Domain Lexicon / Catalog 2.6.0 | `LocalizedText`、Domain Lexicon、插件 i18n facade、CatalogService | 禁止新增中文 fallback / 双语三元；catalog 进入 SQLite SoT |
| R9 | AI 2.5.x 后续 | 2.5.3 知识检索、2.5.4 ContextHygiene、2.5.5 GGUF runtime、2.5.8 ASR | 不抢 2.5.0 Stable；按独立 PRD 分阶段落地 |

## 4. 明确非阻塞项

- 公共包发布不再作为当前 Roadmap 阻塞项；版本变更后以 GitHub 自动发版 workflow 结果为准。
- 平台验证不再作为待办、平台后续或证据缺口追踪。
- OmniPanel Writing Tools、Workflow / Review Queue / Skills / Automation 继续保持 MVP/Beta，不进入当前 Stable 承诺。
- 本地模型 runtime `2.5.5` 与 ASR `2.5.8` 只保持 PRD 锁方向，不抢当前 AI 文本/OCR evidence。

## 5. 质量门禁

- 文档同步：`git diff --check`。
- PR 级质量：`pnpm quality:pr`。
- 发布级质量：`pnpm quality:release`。
- 包 manifest 预检继续作为 CI hygiene：`pnpm publish:check` 与 `pnpm publish:check:pack`，但不再代表公共包发布 blocker。
- AI 当前最近路径：`pnpm -C "apps/core-app" exec vitest run "src/main/modules/ai/intelligence-sdk.test.ts" "src/main/modules/plugin/plugin.test.ts"`、`pnpm -C "plugins/touch-intelligence" run build`、`pnpm -C "packages/tuffex" run typecheck`。

## 6. Guardrails

- 不把本地 mock、dry-run、preflight 或 focused test 误写成生产完成。
- 不新增 legacy/raw channel、旧 storage protocol、旧 SDK bypass 或明文 secret/localStorage 依赖。
- 不把 JSON 作为业务明文同步/落盘权威源；SQLite 仍是本地 SoT，sync payload 必须保持密文口径。
- 不以 `deviceId` 派生密钥；敏感凭据继续走 CoreApp local root-key secure-store。
- 不在没有用户确认时执行 `git push`、tag/release 创建、生产 API/DB 操作。

## 7. 参考入口

- `Roadmap-vNext-2026-06-18.md`：R0-R9 阶段化路线。
- `../TODO.md`：当前 2 周执行清单。
- `../README.md`：PRD / 规划主入口。
- `../01-project/CHANGES.md`：近 30 天事实与变更索引。
- `Release-2.4.11-Closure-2026-06-13.md`：`2.4.11` release checklist 与质量门禁证据。
- `AI-2.5x-Execution-Plan-2026-06-16.md`：AI 2.5.x 分阶段执行计划。
- `../03-features/search/INDEXING-RUNTIME-V1-PLAN.md`：Indexing Runtime V1 统一搜索源计划。
