# Roadmap vNext

> 更新时间：2026-06-22
> 定位：当前剩余工作的阶段化执行路线。本文是 R0-R9 的执行 SoT，替代旧的 npm publish / 平台验证 blocker 口径。

## 决策锁定

- 公共包发布不再作为独立 Roadmap / blocker / evidence 项；后续只跟踪“版本变更后 push 到 GitHub 触发自动发版 workflow”的 CI/CD 结果。
- 平台验证已由 owner 完成，后续从 Roadmap、P0/P1、平台后续与 evidence 队列中移除。
- 当前代码版本以 root / CoreApp `2.4.13-beta.1` 为口径；当前分支存在多主题未提交改动，后续仍按 related-only 拆分验证。
- GitHub push、tag/release、生产 API/DB 操作仍属于需要明确授权的操作；自动发版只作为版本变更 push 后的流水线结果跟踪。

## 关联 SoT / Evidence

- Pricing：`Pricing-SoT-2026-06-18.md`。
- AI Stable：`Evidence-Matrix-AI-Stable-2026-06-18.md`。
- Nexus Governance：`Evidence-Matrix-Nexus-Governance-2026-06-18.md`。
- Platform Capability：`Evidence-Matrix-Platform-2026-06-18.md`（非阻塞 smoke / regression，不恢复为 release blocker）。
- Release Integrity：`Evidence-Matrix-Release-Integrity-2026-06-21.md`。

## Roadmap

| 阶段 | 主线 | 要交付什么 | 完成标准 |
| --- | --- | --- | --- |
| R0 | 口径清理 | 移除 npm publish / 平台验证相关 blocker；把当前 `2.4.13-beta.1`、GitHub 自动发版口径写入规划 | 文档无 `包发布凭据`、平台验证作为待办；`git diff --check` 通过 |
| R1 | Release Integrity | Nexus release asset `sha256`、`signatureUrl`、signature endpoint、manifest/download matrix 对齐 | GitHub Release ↔ Nexus release metadata 自动校验通过 |
| R2 | AI 2.5.0 Stable | 修 provider routing；Local/Ollama 优先；CoreBox AI Ask 文本 + 显式 OCR；失败路径 UI | `Evidence-Matrix-AI-Stable-2026-06-18.md` 的固定 evidence item 关闭；`text.chat` / `vision.ocr -> text.chat` 成功，未登录、provider unavailable、quota/model unsupported、permission denied 与 Local/Ollama routing 都可解释 |
| R3 | Search / Indexing Runtime | File write/store boundary、SQLite/FTS 写入、`scan_progress`、integrity reset、durable job history | FileProvider 写入/进度/重置都走 runtime task/store；focused tests 覆盖 |
| R4 | QuickOps 产品化 | 番茄钟模板列表/高级循环、清洁屏幕自动视觉合同、app quit cleanup、Flow/AI adapter | QuickOps 状态型 runtime 可持续清理；无系统副作用；测试覆盖 |
| R5 | Plugin Trust Boundary | 剩余 shell/OS/network/fs/clipboard permission surface、secret cleanup UX、Widget sandbox 长尾 | 权限缺失全部 fail-closed；不写明文 secret；插件 focused tests 覆盖 |
| R6 | UI / TuffEx | 主路径语义控件、keyboard/focus、legacy Tabs/Menu/Drawer 小切片、visual smoke 恢复 | scoped ESLint + UI focused tests；减少 `div/span @click` 债务 |
| R7 | Nexus Governance | Provider Registry / Intelligence Admin 收敛、live send/object storage/D1 backfill/provider quota fail-closed | `Evidence-Matrix-Nexus-Governance-2026-06-18.md` 的 production / preview evidence 可复现；memory/local-only 只能标记 partial |
| R8 | i18n / Domain Lexicon / Catalog 2.6.0 | `LocalizedText`、Domain Lexicon、插件 i18n facade、CatalogService 验签/导入/回滚 | 禁止新增中文 fallback / 双语三元；catalog 进入 SQLite SoT |
| R9 | AI 2.5.x 后续 | 2.5.3 知识检索、2.5.4 ContextHygiene、2.5.5 本地 GGUF runtime、2.5.8 ASR | 先不抢 2.5.0 Stable；按独立 PRD 分阶段落地 |

## 优先级排序

1. 先做 R0：把旧 blocker 从文档和执行口径里彻底删干净。
2. 接 R1 + R2：发版完整性和 AI Stable 是当前最影响产品可信度的两条。
3. 再做 R3：Indexing Runtime 是后续 App Data / Everything / Quicklinks 的地基。
4. R4–R7 并行小切片推进，但不要混提交。
5. R8/R9 作为下一阶段产品能力，不抢当前稳定化窗口；分批计划见 `R8-R9-Next-Stage-Execution-Plan-2026-06-24.md`，先 R8 locale core / localized value，再 R9 2.5.3 local knowledge 与 2.5.4 ContextHygiene。

## 执行约束

- 不把本地 mock、dry-run、preflight 或 focused test 写成生产完成。
- 不新增 legacy/raw channel、旧 storage protocol、旧 SDK bypass 或明文 secret/localStorage 依赖。
- SQLite 仍是本地 SoT；JSON 只允许作为密文同步载荷或可校验 catalog 下载载荷。
- AI Stable 只承诺 CoreBox 文本 + 显式 OCR、provider routing 与固定失败路径；OmniPanel Writing Tools 为 MVP/Beta，Workflow / Review Queue / Skills / Automation 保持 Beta。
- 平台能力继续要求 degraded/unsupported reason 与 fail-closed；平台 smoke 只按 `Evidence-Matrix-Platform-2026-06-18.md` 做非阻塞回归跟踪。
- 每个阶段按 related-only 小切片推进，代码、测试、文档一起收口。
