# Tuff AI Stable TODO

> 更新时间：2026-06-22
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
- strict visible verifier 仍按预期失败，最近口径为 `gate.failures.length=55`，剩余失败均来自 broader visible surfaces；2026-06-24 inventory 确认 manifest 引用的 41 个唯一 artifact 均存在、非空，JSON artifact 均可解析。

## 状态明细

| 主题 | 状态 | 缺口 |
| --- | --- | --- |
| `corebox-search-states` | closed | 2026-06-22 R2D/R2I packaged evidence 已覆盖 idle、searching/warm-up、no-result retry/File Index settings 与 result source/status/reason pills；普通 `core-box` 从 `720x56` resize 到 `720x242`。 |
| Broader visible surfaces | open | app-index、OmniPanel、Assistant、Workflow、Provider surfaces 仍 pending；`browser-login-recovery` 已 passed。 |
| Global visible gate | open | strict visible verifier 仍不能标 passed。 |
| AI Beta surfaces | open | Workflow Use Model、Review Queue、Assistant、Agent 工具执行等不反向阻塞 CoreBox Stable。 |

## Strict gate failure 分组

| Surface | Failure count | 摘要 |
| --- | ---: | --- |
| `app-index-workbench` | 7 | 未 passed、无 artifact、无 screenshot/recording，4 个 required evidence 未勾选。 |
| `omnipanel-writing-tools` | 7 | 未 passed、无 artifact、无 screenshot/recording，4 个 writing tools evidence 未勾选。 |
| `assistant-floating-ball-entry` | 7 | 未 passed、无 artifact、无 screenshot/recording，4 个 floating ball evidence 未勾选。 |
| `assistant-screenshot-translate` | 7 | 未 passed、无 artifact、无 screenshot/recording，4 个 clipboard image translate evidence 未勾选。 |
| `workflow-use-model-review-queue` | 7 | 未 passed、无 artifact、无 screenshot/recording，4 个 Review Queue evidence 未勾选。 |
| `provider-registry-observability` | 7 | 未 passed、无 artifact、无 screenshot/recording，4 个 provider registry evidence 未勾选。 |
| `provider-migration-evidence` | 6 | 未 passed、无 artifact，4 个 migration evidence 未勾选；该 surface 不要求 visual artifact。 |

## R2 artifact inventory

- Manifest artifact 总引用 63 次，去重后 45 个唯一文件，覆盖 startup hot/cold、startup first-screen、CoreBox search states、browser login recovery、CoreBox AI Ask 这 6 个 passed surfaces。
- `--requireExistingArtifacts --requireNonEmptyArtifacts` 已确认全部 manifest 引用存在且非空；JSON artifact 均可解析。
- `evidenceTagArtifacts` 没有 unknown artifact 引用；AI-STABLE tag artifact 均同时落在 `artifactPaths`。
- PNG / JSON 对应关系基本为同名 `*-dom.json` 或 `*-probe.json`；`packaged-corebox-hotkey-page-04.png` 由 `packaged-corebox-hotkey-capture.json` 的 `captures[].screenshotPath` 关联。

## 下一步

1. Roadmap 推荐路径：`app-index-workbench`（3-5h）仍适合作为下一批 visible surface；如复现 app scanner `spawn EBADF`，按 app-index surface 单独处理。
2. 后续排序：`provider-registry-observability`、`omnipanel-writing-tools`、`assistant-floating-ball-entry`、`provider-migration-evidence`、`assistant-screenshot-translate`、`workflow-use-model-review-queue`。
3. 保留 R2D idle、searching/warm-up、no-result 与 R2I result pills 作为最终 CoreBox Search evidence，避免旧 r2/r2b/r2c 或 `corebox-search-result-reasons.png` 被误用。
4. 每新增 evidence 同步 `docs/engineering/reports/coreapp-visible-ai-stable-2026-06-18/`、Evidence Matrix、CHANGES；不使用旧 raw blocker artifact 冒充最终 evidence。

## R2 visible gate 执行梯队

| 梯队 | Surface | 目标时间 | 必须证明 | 关账条件 |
| --- | --- | ---: | --- | --- |
| done | `browser-login-recovery` | closed | Browser-open failure 不丢 device authorization session；manual login URL copy、short code copy、timeout/network failure 文案可见 | 2026-06-24 packaged evidence 已绑定；strict verifier 不再列该 surface。 |
| 1 | `app-index-workbench` | 3-5h | Summary counts、UWP/Store/Steam/shortcut/protocol/AppRef/path source filters、attention/found/unchecked/disabled filters、no entries vs filtered-out empty states | 如复现 `spawn EBADF`，只写 app-index blocker；不得回退 `corebox-search-states` passed。 |
| 3 | `provider-registry-observability` | 3-5h | Provider health、latest usage、scene latest run、recent failure、attention/healthy/degraded/unhealthy/unknown filters、next-action hints | 不暴露 provider secret；截图/DOM evidence 绑定 manifest。 |
| 3 | `omnipanel-writing-tools` | 3-5h | Selected-text context 或 recovery hint、translate/summarize/rewrite/explain/review actions、AI result preview、copy/replace/retry/confirmation states | 只处理 OmniPanel，不混 Assistant 或 Workflow。 |
| 3 | `assistant-floating-ball-entry` | 3-5h | Settings enabled + voice wake disabled、浮窗不抢焦点、拖动位置持久化、点击打开 Voice Panel | 需要 screenshot/recording artifact。 |
| 4 | `provider-migration-evidence` | 3-6h | Dry-run 或 execute migration evidence、readiness/blockers/migrated/skipped/failed counts、secret redaction、dry-run 不声明 registry-primary readiness | 该 surface 不要求 visual artifact，但必须有可审计 evidence 文件。 |
| 4 | `assistant-screenshot-translate` | 4-6h | Clipboard image 从 Assistant Voice Panel 进入翻译、读取剪贴板而非主动截图、结果窗口可见、空剪贴板/provider fallback 可恢复 | 环境不可复现时记录 blocker，不伪造 success。 |
| 4 | `workflow-use-model-review-queue` | 4-7h | Use Model output 入 Review Queue、pending/copied/clipboard-replaced/failed filters、cost signals、failed copy/replace retry/clear-failure | 链路长，最后处理。 |

每个 surface 批次结束必须同步：

- `docs/engineering/reports/coreapp-visible-ai-stable-2026-06-18/README.md`
- `docs/engineering/reports/coreapp-visible-ai-stable-2026-06-18/coreapp-visible-experience-manifest.json`
- `docs/plan-prd/TODO-AI.md`
- `docs/plan-prd/01-project/CHANGES.md`
- 如 strict gate failure count 或总状态变化，再同步 `docs/plan-prd/TODO.md`

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
