# 当前项目进程与执行计划

> 更新时间：2026-07-13
> 定位：当前项目进程的短期执行 SoT。阶段化路线以 `Roadmap-vNext-2026-06-18.md` 为准，历史事实仍以 `../01-project/CHANGES.md` 为准，具体任务状态仍以 `../TODO.md` 为准。

## 1. 当前事实

- 当前稳定基线：`2.4.10`。
- 当前代码版本：root / CoreApp `2.4.13-beta.6`。
- 当前分支：`master`。
- 最近完整发布链路证据：`v2.4.11-beta.6` GitHub prerelease、Nexus BETA latest sync 与 Gate D strict 复核。
- `2.4.11` release checklist 已有完成记录：`quality:pr`、`publish:check`、`publish:check:pack`、`typecheck:all`、`quality:release` 与 `git diff --check` 均已通过。
- 新决策：公共包发布不再作为独立 Roadmap / blocker / evidence 项；后续只跟踪“版本变更后 push 到 GitHub 触发自动发版 workflow”的 CI/CD 结果。
- 新决策：平台验证已由 owner 完成，后续从 Roadmap、P0/P1、平台后续与 evidence 队列中移除。

## 2. 当前主线

1. **R0 口径清理**：保持 README / TODO / Roadmap / Quality Baseline 的版本、任务状态和 evidence 边界一致；入口只保留当前 SoT。
2. **R1 Release Integrity**：等待并接入 Nexus release asset `sha256`、`signatureUrl`、signature endpoint、manifest signature 与 signing public key；外部签名材料未齐前不宣称闭环。
3. **R2 AI 2.5.0 Stable**：historical 13/13 visible surfaces 已 passed；当前 `2.4.13-beta.6` 相对 manifest baseline `2.4.12-beta.8` 的 recapture 仍开放，并由 `--requireCurrentVersion` fail-closed。Assistant / OmniPanel / screenshot 继续产品化 follow-up，不得反向把历史 evidence 冒充当前版本。
4. **R3 Search / Indexing Runtime**：优先补 attach-only natural Settings recent task evidence 与真实 profile preflight / simulation；未确认影响范围前不执行 SQLite/FTS 或 `scan_progress` 迁移。
5. **R4-R7 并行小切片**：QuickOps、Plugin Trust Boundary、UI/TuffEx、Nexus Governance 按 related-only 推进，production / preview evidence 不用 local-only 代替。
6. **R8-R9 后续能力**：R8 Phase 0-4 与 R9.2 P0/P1 closure 已落；R8 下一批推进 CatalogService MVP，R9 real-profile/GGUF/ASR follow-up 继续不抢 R1/R3/Nexus evidence 窗口。

## 3. vNext Roadmap 摘要

| 阶段 | 主线                                  | 下一动作                                                                                                                                                     | 验收证据                                                                                             |
| ---- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| R0   | 口径清理                              | 同步 README / TODO / Roadmap / Quality Baseline / CHANGES                                                                                                    | 活跃文档版本口径一致；`git diff --check` 通过                                                        |
| R1   | Release Integrity                     | 等待签名 sidecar、manifest signature、Nexus signature metadata 与 public key 后再跑真实矩阵                                                                  | GitHub Release ↔ Nexus release metadata / signature 自动校验通过                                     |
| R2   | AI 2.5.0 Stable                       | 产品化 follow-up：Assistant screenshot translate、OmniPanel / Assistant performance、桌面烟花 MVP、截图 capture 渐进引入                                     | 不回退 13/13 visible surfaces；每批有专项 tests / evidence                                           |
| R3   | Search / Indexing Runtime             | 采 attach-only natural Settings evidence；真实 profile preflight / simulation 后再决定 migration execute                                                     | FileProvider 写入/进度/重置走 runtime task/store；真实 profile evidence 可复核                       |
| R4   | QuickOps 产品化                       | 清洁屏幕 visual evidence、Pomodoro advanced loop 产品路径 evidence、packaged app quit cleanup evidence；runtime / diagnostics / lifecycle focused tests 已落 | runtime 可持续清理；无系统副作用；测试覆盖                                                           |
| R5   | Plugin Trust Boundary                 | 补剩余 shell/OS/network/fs/clipboard surface、secret cleanup UX、Widget sandbox 长尾                                                                         | 权限缺失 fail-closed；不写明文 secret；focused tests 覆盖                                            |
| R6   | UI / TuffEx                           | 主路径语义控件、keyboard/focus、legacy Tabs/Menu/Drawer、visual smoke                                                                                        | scoped ESLint + UI focused tests；减少 `div/span @click` 债务                                        |
| R7   | Nexus Governance                      | Provider Registry / Intelligence Admin、production / preview browser evidence、D1/R2/live send/provider quota                                                | 生产/preview runbook 和 API/UI evidence 可复现                                                       |
| R8   | i18n / Domain Lexicon / Catalog 2.6.0 | Domain Lexicon V1 与 Plugin SDK facade 已完成；下一步 CatalogService MVP                                                                                     | signature/hash/schema fail-closed、SQLite import/activate/rollback；禁止新增中文 fallback / 双语三元 |
| R9   | AI 2.5.x 后续                         | 2.5.3 真实数据 evidence、2.5.4 Compression / Memory 搜索编辑来源审计、后续 GGUF / ASR                                                                        | 不抢 Stable；按独立 PRD 分阶段落地                                                                   |

## 4. 明确非阻塞项

- 公共包发布不再作为当前 Roadmap 阻塞项；版本变更后以 GitHub 自动发版 workflow 结果为准。
- 平台验证不再作为待办、平台后续或证据缺口追踪。
- OmniPanel Writing Tools、Workflow / Review Queue / Skills / Automation 继续保持 MVP/Beta，不进入当前 Stable 承诺。
- 本地模型 runtime `2.5.5` 与完整 ASR `2.5.8` 仍不抢当前 AI 文本/OCR evidence；VoicePanel 已有受治理云端短音频 `audio.stt` 小切片只计 code/focused evidence，不代表 R9.4 本地 runtime、策略、artifact 或 packaged provider 闭环。

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
