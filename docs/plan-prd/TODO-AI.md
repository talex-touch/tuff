# Tuff AI Stable TODO

> 更新时间：2026-06-21
> 范围：Roadmap R2 / AI 2.5.0 Stable。主验收矩阵以 `04-implementation/Evidence-Matrix-AI-Stable-2026-06-18.md` 为准。

## 当前口径

- Stable 只覆盖 CoreBox `text.chat`、显式 `vision.ocr -> text.chat`、provider routing 与固定失败路径。
- OmniPanel Writing Tools、Workflow、Review Queue、Skills、Automation、Assistant 继续按 Beta / Experimental evidence 追踪。
- focused tests、schema、mock provider、dry-run、CDP raw 诊断不能替代 packaged Electron 体验证据。

## 已完成

- `AI-STABLE-01/02/03/04/05/06/07/08` 已绑定独立 packaged probe JSON + PNG artifact。
- CoreBox AI Ask packaged surface 已标记 `passed`。
- `corebox-search-states` packaged surface 已标记 `passed`：R2D 覆盖 idle、searching/warm-up、no-result retry/File Index settings 可接受截图；R2I 覆盖真实 result source/status/reason pills。
- 已覆盖：
  - text.chat success
  - OCR handoff success
  - logged-out fail-closed
  - provider unavailable
  - quota exhausted
  - model / capability unsupported
  - copy failure remains visible
  - Local/Ollama routing
- packaged startup hot/cold benchmark 已 passed。
- startup first-screen evidence 已 passed。
- strict visible verifier 仍按预期失败，最近口径为 `gate.failures.length=55`，剩余失败均来自 broader visible surfaces。

## 未完成

| 主题 | 状态 | 缺口 |
| --- | --- | --- |
| `corebox-search-states` | closed | 2026-06-22 R2D/R2I packaged evidence 已覆盖 idle、searching/warm-up、no-result retry/File Index settings 与 result source/status/reason pills；普通 `core-box` 从 `720x56` resize 到 `720x242`。 |
| Broader visible surfaces | open | app-index、login、OmniPanel、Assistant、Workflow、Provider surfaces 仍 pending。 |
| Global visible gate | open | strict visible verifier 仍不能标 passed。 |
| AI Beta surfaces | open | Workflow Use Model、Review Queue、Assistant、Agent 工具执行等不反向阻塞 CoreBox Stable。 |

## 下一步

1. 继续收 app-index、login、OmniPanel、Assistant、Workflow、Provider broader visible surfaces，不把 global visible gate 标 passed。
2. 保留 R2D idle、searching/warm-up、no-result 与 R2I result pills 作为最终 CoreBox Search evidence，避免旧 r2/r2b/r2c 或 `corebox-search-result-reasons.png` 被误用。
3. R2D 采集中记录的 app scanner `spawn EBADF` 已不再阻塞 CoreBox Search surface；如后续 app-index surface 复现，再单独处理。
4. 每新增 evidence 同步 `docs/engineering/reports/coreapp-visible-ai-stable-2026-06-18/`、Evidence Matrix、CHANGES。
5. 不使用旧 raw blocker artifact 冒充最终 evidence。

## 验证命令

```bash
corepack pnpm -C "apps/core-app" exec vitest run "scripts/coreapp-packaged-ai-ask-probe.test.ts" "src/main/modules/platform/coreapp-visible-experience-evidence.test.ts"
corepack pnpm -C "apps/core-app" exec vitest run "src/renderer/src/modules/box/adapter/hooks/clipboard-query-inputs.test.ts" "src/renderer/src/modules/box/adapter/hooks/useSearch.core.test.ts" "src/renderer/src/views/box/search-state.test.ts" "src/renderer/src/modules/box/adapter/hooks/useResize.test.ts"
corepack pnpm -C "apps/core-app" run typecheck
corepack pnpm -C "apps/core-app" run build:unpack
corepack pnpm -C "packages/test" exec vitest run "src/plugins/intelligence.test.ts"
corepack pnpm -C "plugins/touch-intelligence" run build
corepack pnpm -C "apps/core-app" run visible:experience:verify -- --input "../../docs/engineering/reports/coreapp-visible-ai-stable-2026-06-18/coreapp-visible-experience-manifest.json" --requireAllPassed --requireArtifactPaths --requireVisualArtifacts --requireCheckedEvidence --requireEvidenceTags --requireExistingArtifacts --requireNonEmptyArtifacts
git diff --check
```
