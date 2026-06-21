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
- strict visible verifier 仍按预期失败，最近口径为 `gate.failures.length=62`。

## 未完成

| 主题 | 状态 | 缺口 |
| --- | --- | --- |
| `corebox-search-states` | open | 代码侧已修普通文本 stale image input 与 no-result layout refresh；仍缺可运行签名包下 idle/no-result/result screenshot + DOM evidence。 |
| Broader visible surfaces | open | app-index、login、OmniPanel、Assistant、Workflow、Provider surfaces 仍 pending。 |
| Global visible gate | open | strict visible verifier 仍不能标 passed。 |
| AI Beta surfaces | open | Workflow Use Model、Review Queue、Assistant、Agent 工具执行等不反向阻塞 CoreBox Stable。 |

## 下一步

1. 恢复可运行签名包启动环境，重采 `corebox-search-states`。
2. 用真实普通 CoreBox target 采 idle、warm-up/searching、no-result retry + File Index settings、result source/status/reason pills。
3. 确认普通文本查询不会携带 stale image clipboard input。
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
