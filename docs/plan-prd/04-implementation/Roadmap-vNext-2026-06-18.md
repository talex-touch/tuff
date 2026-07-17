# Roadmap vNext

> 更新时间：2026-07-16
> 定位：R0-R9 产品阶段与能力边界。当前两周执行顺序以 `../TODO.md` 为准，实时任务状态以 Trellis 为准。

## 决策锁定

- 公共包发布不再作为独立 Roadmap / blocker / evidence 项；后续只跟踪“版本变更后 push 到 GitHub 触发自动发版 workflow”的 CI/CD 结果。
- 平台验证已由 owner 完成，后续从 Roadmap、P0/P1、平台后续与 evidence 队列中移除。
- 当前版本从根目录与 `apps/core-app/package.json` 读取；当前分支、HEAD 和 worktree 只在执行时检查，不写入 Roadmap。
- GitHub push、tag/release、生产 API/DB 操作仍属于需要明确授权的操作；自动发版只作为版本变更 push 后的流水线结果跟踪。

## 关联 SoT / Evidence

- Pricing：`Pricing-SoT-2026-06-18.md`。
- AI Stable：`Evidence-Matrix-AI-Stable-2026-06-18.md`。
- Nexus Governance：`Evidence-Matrix-Nexus-Governance-2026-06-18.md`。
- Platform Capability：`Evidence-Matrix-Platform-2026-06-18.md`（非阻塞 smoke / regression，不恢复为 release blocker）。
- Release Integrity：`Evidence-Matrix-Release-Integrity-2026-06-21.md`。
- Launcher / TuffIntelligence / QuickReview：`Launcher-TuffIntelligence-QuickReview-Roadmap-2026-07-07.md`。

## Roadmap

| 阶段 | 主线 | 要交付什么 | 完成标准 |
| --- | --- | --- | --- |
| R0 | 稳定化与口径清理 | 先关闭 usage 统计双写、sync 半写风险和任务树漂移；入口文档只保留事实源边界 | 已知数据正确性缺陷关闭；活跃任务可判定；文档无易漂移版本/worktree 口径 |
| R1 | Release Integrity | Nexus release asset `sha256`、`signatureUrl`、signature endpoint、manifest/download matrix 对齐 | GitHub Release ↔ Nexus release metadata 自动校验通过 |
| R2 | AI 2.5.0 Stable | 修 provider routing；Local/Ollama 优先；CoreBox AI Ask 文本 + 显式 OCR；失败路径 UI | `Evidence-Matrix-AI-Stable-2026-06-18.md` 的固定 evidence item 关闭；`text.chat` / `vision.ocr -> text.chat` 成功，未登录、provider unavailable、quota/model unsupported、permission denied 与 Local/Ollama routing 都可解释 |
| R3 | Search / Indexing Runtime | File write/store boundary、SQLite/FTS 写入、`scan_progress`、integrity reset、durable job history | FileProvider 写入/进度/重置都走 runtime task/store；focused tests 覆盖 |
| R4 | QuickOps 产品化 | 番茄钟模板列表/高级循环、清洁屏幕自动视觉合同、app quit cleanup、Flow/AI adapter | QuickOps 状态型 runtime 可持续清理；无系统副作用；测试覆盖 |
| R5 | Plugin Trust Boundary | 剩余 shell/OS/network/fs/clipboard permission surface、secret cleanup UX、Widget sandbox 长尾 | 权限缺失全部 fail-closed；不写明文 secret；插件 focused tests 覆盖 |
| R6 | UI / TuffEx | 主路径语义控件、keyboard/focus、legacy Tabs/Menu/Drawer 小切片、visual smoke 恢复 | scoped ESLint + UI focused tests；减少 `div/span @click` 债务 |
| R7 | Nexus Governance | Provider Registry / Intelligence Admin 收敛、live send/object storage/D1 backfill/provider quota fail-closed | `Evidence-Matrix-Nexus-Governance-2026-06-18.md` 的 production / preview evidence 可复现；memory/local-only 只能标记 partial |
| R8 | i18n / Domain Lexicon / Catalog 2.6.0 | `LocalizedText`、Domain Lexicon、插件 i18n facade、CatalogService 验签/导入/回滚 | 禁止新增中文 fallback / 双语三元；catalog 进入 SQLite SoT |
| R9 | AI 2.5.x 后续 | 2.5.3 知识检索、2.5.4 ContextHygiene、2.5.5 本地 GGUF runtime、2.5.8 ASR | 先不抢 2.5.0 Stable；按独立 PRD 分阶段落地 |

## 阶段关系（非实时优先级）

- R0 的 Usage、Nexus sync 与 task/doc convergence 已关闭；实时执行顺序只由 [`../TODO.md`](../TODO.md) 维护。
- R1 / R3 / R5 继续承载发布与原生打包、Search / Indexing evidence 和插件隔离等稳定性能力。
- R2 historical visible evidence 保持历史边界；current-version recapture 只有在 `TODO.md` 排到时才执行。
- R4–R7 只接受直接降低稳定性风险的 related-only 小切片。
- R8/R9 新能力继续保留路线；CatalogService、完整本地模型等按 `TODO.md` 恢复。

## 执行约束

- 不把本地 mock、dry-run、preflight 或 focused test 写成生产完成。
- 不新增 legacy/raw channel、旧 storage protocol、旧 SDK bypass 或明文 secret/localStorage 依赖。
- SQLite 仍是本地 SoT；JSON 只允许作为密文同步载荷或可校验 catalog 下载载荷。
- AI Stable 只承诺 CoreBox 文本 + 显式 OCR、provider routing 与固定失败路径；OmniPanel Writing Tools 为 MVP/Beta，Workflow / Review Queue / Skills / Automation 保持 Beta。
- 平台能力继续要求 degraded/unsupported reason 与 fail-closed；平台 smoke 只按 `Evidence-Matrix-Platform-2026-06-18.md` 做非阻塞回归跟踪。
- 每个阶段按 related-only 小切片推进，代码、测试、文档一起收口。
