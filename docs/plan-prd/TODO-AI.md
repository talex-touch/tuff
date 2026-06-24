# Tuff AI Stable TODO

> 更新时间：2026-06-24
> 范围：Roadmap R2 / AI 2.5.0 Stable。主验收矩阵以 `04-implementation/Evidence-Matrix-AI-Stable-2026-06-18.md` 为准。

## 当前口径

- Stable 只覆盖 CoreBox `text.chat`、显式 `vision.ocr -> text.chat`、provider routing 与固定失败路径。
- OmniPanel Writing Tools、Workflow、Review Queue、Skills、Automation、Assistant 继续按 Beta / Experimental evidence 追踪。
- focused tests、schema、mock provider、dry-run、CDP raw 诊断不能替代 packaged Electron 体验证据。

## 已完成

- `AI-STABLE-01/02/03/04/05/06/07/08` 已绑定独立 packaged probe JSON + PNG artifact。
- CoreBox AI Ask packaged surface 已标记 `passed`。
- `corebox-search-states` packaged surface 已标记 `passed`：R2D 覆盖 idle、searching/warm-up、no-result retry/File Index settings 可接受截图；R2I 覆盖真实 result source/status/reason pills。
- `app-index-workbench` packaged surface 已标记 `passed`：Settings -> File Index -> App Index Manager 覆盖 summary counts、6 类 source filters、found/unchecked/disabled/attention diagnostic filters 与 filtered-empty state。
- `browser-login-recovery` packaged surface 已标记 `passed`：覆盖 browser-open failure waiting session、manual login URL copy、short code copy、timeout retry 文案与 network failure copy JSON。
- `omnipanel-writing-tools` packaged surface 已标记 `passed`：覆盖 selected-text context / recovery hint、writing actions、AI result preview、Retry / Copy / Replace Clipboard 与 replace confirmation。
- `provider-migration-evidence` surface 已标记 `passed`：覆盖 Nexus local-only dry-run migration summary、readiness/blockers/counts、secret redaction 与 dry-run 不声明 registry-primary readiness 边界。
- `assistant-floating-ball-entry` surface 已标记 `passed`：packaged evidence 覆盖 Settings 中 Assistant enabled + voice wake disabled、悬浮球可见且不抢焦点、拖动位置重启后持久化、点击打开 Voice Panel。
- `assistant-screenshot-translate` surface 已标记 `passed`：packaged evidence 覆盖 Settings 开关、剪贴板图片翻译入口、翻译结果窗口、空剪贴板与 provider fallback。
- `workflow-use-model-review-queue` surface 已标记 `passed`：packaged evidence 覆盖 Review Queue pending/failed 队列态、Use Model 输出、成本/trace 信号与失败恢复。
- `provider-registry-observability` surface 已标记 `passed`：packaged evidence 覆盖 provider health、scene latest run/recent failure、状态 filter 与 next-action hint。
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
- strict visible verifier 当前通过：`gate.passed=true`，13/13 required surfaces `passed`；2026-06-24 evidence inventory 确认 manifest 引用的 72 个唯一 artifact 均存在、非空，JSON artifact 均可解析。

## 状态明细

| 主题 | 状态 | 缺口 |
| --- | --- | --- |
| `corebox-search-states` | closed | 2026-06-22 R2D/R2I packaged evidence 已覆盖 idle、searching/warm-up、no-result retry/File Index settings 与 result source/status/reason pills；普通 `core-box` 从 `720x56` resize 到 `720x242`。 |
| `app-index-workbench` | closed | 2026-06-24 packaged Settings UI evidence 已覆盖 summary counts、UWP/Store、Steam、shortcut、protocol、AppRef、path filters，found/unchecked/disabled/attention states 与 filtered-empty distinction；diagnostic JSON gate 已通过。 |
| `browser-login-recovery` | closed | 2026-06-24 packaged evidence 已覆盖 browser-open failure waiting session、manual login URL copy、short code copy、timeout retry 文案与 network failure copy JSON。 |
| `omnipanel-writing-tools` | closed | 2026-06-24 packaged evidence 已覆盖 selected-text context / recovery hint、5 个 writing actions、AI result preview metadata、Retry / Copy / Replace Clipboard 与 replace confirmation。 |
| `provider-migration-evidence` | closed | 2026-06-24 Nexus local-only dry-run evidence 已覆盖 migration summary、planning readiness、blocker/counts、secret redaction 与 dry-run 不声明 registry-primary readiness；不代表生产 registry-primary ready。 |
| `assistant-floating-ball-entry` | closed | 2026-06-24 packaged probe 已覆盖 Assistant enabled + voice wake disabled、悬浮球可见且不抢焦点、拖动位置重启后持久化、点击打开 Voice Panel。 |
| `assistant-screenshot-translate` | closed | 2026-06-24 packaged evidence 已覆盖 Settings、clipboard image translate start/result、empty clipboard 与 provider fallback；截图翻译后续进入产品化 polish。 |
| `workflow-use-model-review-queue` | closed | 2026-06-24 packaged evidence 已覆盖 pending / failed queue、Use Model output、runtime cost/trace 与恢复文案。 |
| `provider-registry-observability` | closed | 2026-06-24 packaged evidence 已覆盖 provider health、scene latest run/recent failure、状态 filter 与 next-action hint。 |
| Broader visible surfaces | closed | R2 visible manifest 13/13 surfaces passed。 |
| Global visible gate | closed | strict visible verifier 当前可标 passed。 |
| AI Beta surfaces | open | Workflow Use Model、Review Queue、Assistant、Agent 工具执行等不反向阻塞 CoreBox Stable。 |

## Strict gate 闭环分组

| Surface | Artifact count | 摘要 |
| --- | ---: | --- |
| `assistant-screenshot-translate` | 6 | packaged Assistant image translate probe + Settings/start/result/empty/fallback PNG 已绑定。 |
| `workflow-use-model-review-queue` | 3 | Review Queue probe + pending/failed PNG 已绑定。 |
| `provider-registry-observability` | 3 | Provider registry probe + health/scene run PNG 已绑定。 |

## R2 artifact inventory

- Manifest artifact 总引用 72 次，去重后 72 个唯一文件，覆盖 13 个 passed surfaces：startup hot/cold、startup first-screen、CoreBox search states、app-index workbench、browser login recovery、CoreBox AI Ask、OmniPanel writing tools、provider migration evidence、Assistant floating ball entry、Assistant screenshot translate、Workflow review queue 与 Provider registry observability。
- `--requireExistingArtifacts --requireNonEmptyArtifacts` 已确认全部 manifest 引用存在且非空；JSON artifact 均可解析。
- `evidenceTagArtifacts` 没有 unknown artifact 引用；AI-STABLE tag artifact 均同时落在 `artifactPaths`。
- PNG / JSON 对应关系基本为同名 `*-dom.json` 或 `*-probe.json`；`packaged-corebox-hotkey-page-04.png` 由 `packaged-corebox-hotkey-capture.json` 的 `captures[].screenshotPath` 关联。

## 下一步

1. Assistant screenshot translate 进入灰度产品化：保留 Voice Panel 双入口，补截图模式选择、权限恢复、pin window polish 与 provider fallback 文案。
2. OmniPanel / Assistant 性能优化：聚焦窗口生命周期、悬浮球拖拽持久化、事件广播、packaged asset 排除与首屏不阻塞。
3. 桌面烟花 MVP：feature flag 默认关闭，轻量 overlay/canvas，限制粒子数、帧率、自动退出与无障碍降级。
4. 截图功能逐步引入：已落地 Voice Panel `capture + preview + copy` 基础切片；下一步补 save、权限恢复与平台 unsupported/provider unavailable 的可见失败态，再接 translate 产品化。
5. 保留 R2D idle、searching/warm-up、no-result 与 R2I result pills 作为最终 CoreBox Search evidence，避免旧 r2/r2b/r2c 或 `corebox-search-result-reasons.png` 被误用。
6. 后续每次产品化变更仍同步 `docs/engineering/reports/coreapp-visible-ai-stable-2026-06-18/`、Evidence Matrix、TODO 与 CHANGES；不使用旧 raw blocker artifact 冒充最终 evidence。

## R2 visible gate 执行梯队

| 梯队 | Surface | 目标时间 | 必须证明 | 关账条件 |
| --- | --- | ---: | --- | --- |
| done | `browser-login-recovery` | closed | Browser-open failure 不丢 device authorization session；manual login URL copy、short code copy、timeout/network failure 文案可见 | 2026-06-24 packaged evidence 已绑定；strict verifier 不再列该 surface。 |
| done | `app-index-workbench` | closed | Summary counts、UWP/Store/Steam/shortcut/protocol/AppRef/path source filters、attention/found/unchecked/disabled filters、no entries vs filtered-out empty states | 2026-06-24 packaged evidence 已绑定；strict verifier 不再列该 surface。 |
| done | `omnipanel-writing-tools` | closed | Selected-text context / recovery hint、writing actions、AI result preview、copy / replace / retry / confirmation states | 2026-06-24 packaged evidence 已绑定；strict verifier 不再列该 surface。 |
| done | `provider-migration-evidence` | closed | Dry-run migration summary、readiness/blockers/migrated/skipped/failed counts、secret redaction、dry-run 不声明 registry-primary readiness | 2026-06-24 local-only dry-run evidence 已绑定；strict verifier 不再列该 surface。 |
| done | `assistant-floating-ball-entry` | closed | Settings enabled + voice wake disabled、浮窗不抢焦点、拖动位置持久化、点击打开 Voice Panel | 2026-06-24 packaged evidence 已绑定；strict verifier 不再列该 surface。 |
| done | `assistant-screenshot-translate` | closed | Clipboard image translate、result window、empty clipboard 与 provider fallback | 2026-06-24 packaged evidence 已绑定；后续做产品化 polish。 |
| done | `workflow-use-model-review-queue` | closed | Use Model output 入 Review Queue、pending/failed queue、cost/trace signals、failed recovery | 2026-06-24 packaged evidence 已绑定。 |
| done | `provider-registry-observability` | closed | Provider health、latest usage、scene latest run、recent failure、filters、next-action hints | 2026-06-24 packaged evidence 已绑定；不暴露 provider secret。 |

每个 R2 follow-up 批次结束必须同步：

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
