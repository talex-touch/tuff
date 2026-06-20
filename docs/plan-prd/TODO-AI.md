# Tuff AI Stable TODO

> 更新时间：2026-06-20
> 范围：Roadmap R2 / AI 2.5.0 Stable 收口清单。主验收矩阵仍以 `04-implementation/Evidence-Matrix-AI-Stable-2026-06-18.md` 为准。

## 当前口径

- Stable 只覆盖 CoreBox `text.chat`、显式 `vision.ocr -> text.chat`、provider routing 与固定失败路径。
- OmniPanel Writing Tools、Workflow、Review Queue、Skills、Automation 继续按 MVP/Beta evidence 追踪，不能替代 AI Stable。
- focused tests、schema、mock provider、dry-run、CDP 链路截图只能证明最近路径，不能关闭 packaged Electron 体验项。

## 已收口

- CoreApp AI evidence contract 已要求 `AI-STABLE-*` tag 绑定独立 artifact，同一截图/录屏不能复用关闭多个固定项。
- `AI-STABLE-01` / `AI-STABLE-02` advisory success checks 已要求 input kind、provider、model、latency、trace 与非空回答信号。
- `AI-STABLE-03` 到 `AI-STABLE-07` failure checks 已拒绝 provider 调用、SDK 调用、provider returned answer、fallback success 或 fake-success 反证。
- `AI-STABLE-08` Local/Ollama routing check 已拒绝 disabled Nexus fallback、Nexus provider call/response、Nexus provider metadata、当前 input echo 假阳性与 widget 加载失败反证，并要求 provider/model/latency/trace/input kind/capability metadata。
- Visible-experience strict gate 已拒绝未知 `AI-STABLE-*` tag 和孤儿 tag artifact key，防止非验收 ID 混入 AI Stable 证据矩阵。
- Packaged CDP/CoreBox capture 链路可用，已采到 CoreBox hotkey target、`NEXUS_STREAM_UNSUPPORTED` model/capability unsupported UI 与 runtime `intelligence.basic` permission denied UI。
- 当前 partial evidence：`AI-STABLE-06`、`AI-STABLE-07`、`AI-STABLE-08` 已绑定顶层 curated probe JSON + PNG artifact，并出现在 strict verify output 中；由于 `corebox-ai-ask` surface 仍是 `pending`，它们不能标记为 completed。
- 2026-06-20 复跑 strict visible-experience verify 仍按预期 exit `1`，当前 `failureCount=94`：`corebox-ai-ask` 缺 `AI-STABLE-01/02/03/04/05` tag 与文本/OCR成功、登录恢复、provider unavailable、quota exhausted 等 evidence；其它 visible surfaces 也仍为 pending。该失败结果是缺口证据，不是回归通过证据。
- 2026-06-20 Local/Ollama 预检已确认本机 Ollama 可用：`/api/tags` 返回 `qwen2.5:3b` 与 `qwen3:0.6b`，其中 `qwen2.5:3b` 在 `/api/chat` 非流式 smoke 中返回非空 `local-ok`；`qwen3:0.6b` 返回空回答，不能用于关闭成功 evidence。预检 JSON 保存在 ignored `_local/`，只作为采集前置，不作为 packaged UI evidence。
- 2026-06-20 已采到 `AI-STABLE-08` packaged Local/Ollama routing evidence：isolated profile 禁用 `tuff-nexus-default`，使用 precompiled `touch-intelligence` widget 与 `local-default` / `qwen2.5:3b`，UI 展示 `local-ok`、Routing provider metadata、provider/model/latency/trace/input kind/capability；artifact 为 `packaged-ai-ask-local-ollama-routing-probe.json` 与 `packaged-ai-ask-local-ollama-routing-after-enter.png`。
- 2026-06-20 当前阶段收尾：`coreapp-packaged-ai-ask-probe` 已支持导出 CDP target/select/send helpers、优先选择非 `division-box` CoreBox target、用 CDP keyboard/mouse 激活 AI Ask、返回 `submitPreparation` 诊断、优先点击 `.CoreBox-SendButton` 提交并在失败时仍产出 JSON/screenshot；`useSearch` fallback widget item 已补 `defaultAction: "intelligence-action"`、`actionId: "send"` 与 prompt payload，避免 send button 点击 fallback item 后 `onItemAction()` 直接返回。已通过 `coreapp-packaged-ai-ask-probe.test.ts`、`useSearch.core.test.ts`、CoreApp `build:vite` 与 scoped `git diff --check`。
- 2026-06-20 packaged evidence blocker：`corepack pnpm -C "apps/core-app" run build:unpack` 与直接 `electron-builder --dir` 仍被本地损坏 `node_modules/.bin/pnpm` shim / electron-builder module collector 卡住；随后从 `dist/tuff.app.zip` 手工解包并覆盖 `app.asar` 的 `dist/mac-arm64/tuff.app` 启动即退出，因此当前 `apps/core-app/dist/mac-arm64/tuff.app` 不能作为可靠 packaged evidence 来源。下一次采证前必须先恢复或重建可靠 packaged app。

## 仍未完成

| ID | 状态 | 缺口 |
| --- | --- | --- |
| AI-STABLE-01 | open | 需要真实 packaged Electron `text.chat` 成功截图/录屏，展示可读答案、provider/model/latency/input kind/trace。 |
| AI-STABLE-02 | open | 需要真实 packaged Electron 显式图片 OCR handoff 后进入文本问答，不能用 image-only 或失败态冒充。 |
| AI-STABLE-03 | open | 需要真实未登录状态 UI，证明不调用 provider，并展示登录/恢复建议。 |
| AI-STABLE-04 | open | 需要 provider disabled/unavailable 时的 fail-closed UI 与 routing trace，证明不 fallback 到不可用 Nexus 或假 payload。 |
| AI-STABLE-05 | open | 需要 quota exhausted UI、恢复建议与 quota evaluation evidence。 |
| AI-STABLE-06 | partial | 已绑定 `packaged-ai-ask-provider-enabled-probe.json` 与 `packaged-ai-ask-provider-enabled-after-enter.png`；仍因 `corebox-ai-ask` surface pending 保持 partial。 |
| AI-STABLE-07 | partial | 已绑定 `packaged-ai-ask-runtime-permission-denied-probe.json` 与 `packaged-ai-ask-runtime-permission-denied-after-enter.png`；仍因 `corebox-ai-ask` surface pending 保持 partial。 |
| AI-STABLE-08 | partial | 已绑定 `packaged-ai-ask-local-ollama-routing-probe.json` 与 `packaged-ai-ask-local-ollama-routing-after-enter.png`；仍因 `corebox-ai-ask` surface pending 保持 partial。 |

## 下一步

1. 先恢复可靠 packaged app：优先修复本地 pnpm shim / electron-builder module collector，或重新生成完整 `dist/mac-arm64/tuff.app`；不要继续使用当前手工 repack 失败产物采证。
2. 恢复 packaged app 后优先复跑 `AI-STABLE-05` quota evidence：使用 isolated quota profile，跑 `visible:experience:ai-ask-probe --submit --expectEvidenceTag AI-STABLE-05`，确认 `submitPreparation.readyForPrompt=true`、`submitMethod=cdp-send-button` 或等价路径，并验证 quota DB/permission DB seed。
3. 继续采集 `AI-STABLE-03/04` failure evidence；这些不依赖成功回答，优先级高于 OCR 成功态。
4. 在有效 provider/model 就绪后采集 `AI-STABLE-01` 文本成功和 `AI-STABLE-02` OCR handoff 成功。
5. 保持 `AI-STABLE-06/07/08` 独立 artifact 绑定，不把 `[-]` partial tag 解读为 completed；若后续迁到 `evidence/coreapp-visible/*` 命名路径，必须同步 manifest/checklist/strict output。
6. 每新增一条 evidence，同步 `docs/engineering/reports/coreapp-visible-ai-stable-2026-06-18/`、Evidence Matrix、CHANGES。

## 验证命令

```bash
corepack pnpm -C "apps/core-app" exec vitest run "scripts/coreapp-packaged-ai-ask-probe.test.ts" "src/main/modules/platform/coreapp-visible-experience-evidence.test.ts"
corepack pnpm -C "apps/core-app" run visible:experience:verify -- --input "../../docs/engineering/reports/coreapp-visible-ai-stable-2026-06-18/coreapp-visible-experience-manifest.json" --requireAllPassed --requireArtifactPaths --requireVisualArtifacts --requireCheckedEvidence --requireEvidenceTags --requireExistingArtifacts --requireNonEmptyArtifacts
git diff --check
```

严格 verify 在全部 packaged evidence 未齐前预期仍可能 exit `1`；失败时必须记录剩余 gate failures，不能改弱门禁。
