# CoreApp AI Stable Visible Evidence Plan

> 日期：2026-06-18
> 范围：Tuff 2.5.0 AI Stable 的 CoreBox 文本/OCR、provider routing 与固定失败路径 evidence 采集清单。
> 状态：partial evidence collected；packaged CDP/CoreBox/AI Ask 链路可用，已采到 `model/capability unsupported` 失败态；严格门禁仍 blocked。

## 当前结论

- Packaged app artifact ready：`apps/core-app/dist/mac-arm64/tuff.app` 版本匹配 `2.4.12-beta.8`。
- Packaged CDP live capture 可用：`packaged-cdp-live-capture.json` 与 `packaged-cdp-page-*.png` 证明 packaged Electron 截图链路可用。
- CoreBox 入口可见：`packaged-corebox-hotkey-capture.json` 证明通过 packaged app + `Command+E` 可打开真实 CoreBox target，包含 `bodyClass: "MacIntel core-box"` 与 `inputIdExists: true`。
- CoreBox AI Ask model-unsupported 失败态已采到：`packaged-ai-ask-provider-enabled-after-enter.png` 展示真实 packaged CoreBox AI Ask 的 `NEXUS_STREAM_UNSUPPORTED` 模型/能力不支持错误。
- CoreBox AI Ask permission-denied 失败态已采到：`packaged-ai-ask-runtime-permission-denied-after-enter.png` 展示运行时撤销 `intelligence.basic` 后的权限恢复提示，且没有进入 Intelligence SDK provider 调用。
- `corebox-ai-ask` manifest 仍保持 `pending`：当前只满足 model unsupported 与 permission denied 两项，不能关闭 text/OCR 成功或其它失败/routing 项。

## 本次已完成

- 生成 visible-experience manifest：`coreapp-visible-experience-manifest.json`。
- 生成 checklist：`COREAPP_VISIBLE_EXPERIENCE_CHECKLIST.md`。
- 严格验证输出：`coreapp-visible-strict-verify-output.json`。
- 严格验证退出码：`coreapp-visible-strict-verify-exit-code.txt`，当前为 `1`，符合预期。
- CoreBox AI Ask checklist 已包含 `permission denied` 与 `Local/Ollama routing` evidence 项。
- 采集 readiness 输出：`coreapp-visible-readiness.json` 与 `coreapp-visible-readiness-output.json`。
- 采集 readiness 退出码：`coreapp-visible-readiness-exit-code.txt`，当前为 `1`。
- Packaged CDP live probe：`packaged-cdp-live-capture.json`、`packaged-cdp-page-01.png`、`packaged-cdp-page-02.png`、`packaged-cdp-page-03.png`、`packaged-cdp-live-capture.log`。
- Packaged CoreBox hotkey evidence：`packaged-corebox-hotkey-capture.json` 与 `packaged-corebox-hotkey-page-04.png`。
- Packaged CoreBox AI Ask model-unsupported evidence：`packaged-ai-ask-provider-enabled-probe.json` 与 `packaged-ai-ask-provider-enabled-after-enter.png`。
- Packaged CoreBox AI Ask runtime permission-denied evidence：`packaged-ai-ask-runtime-permission-denied-probe.json` 与 `packaged-ai-ask-runtime-permission-denied-after-enter.png`。
- Raw probe logs, pid files, `*-output.json` mirrors and duplicate stage screenshots are intentionally not required by the manifest and should stay local / ignored unless a future investigation needs them.

## 当前采集 readiness

- `packaged-artifact`: ready，`apps/core-app/dist/mac-arm64/tuff.app` 版本匹配 `2.4.12-beta.8`。
- `browser-smoke-boundary`: warning，browser-only smoke 只能作为 Electron preload 缺失的负面证据，不能作为 AI visible proof。
- `electron-dev-capture`: blocked，当前 Electron dev capture 没有暴露可用 remote debugging target。
- `screen-recording`: warning，macOS Screen Recording 权限未检查。

补充 packaged CDP / CoreBox probe：

- 使用 isolated userData 启动 packaged app 并加 `--remote-debugging-port`，CDP target 枚举与 `Page.captureScreenshot` 可用。
- 直接给主 app 传 `--touch-type=core-box` 不能进入 CoreBox；可用路径是 packaged app + `Command+E` hotkey，由主进程创建 CoreBox BrowserWindow。
- `packaged-corebox-hotkey-page-*.png` 只证明 CoreBox 入口可见，不是 AI 成功/失败 evidence。
- `packaged-ai-ask-provider-enabled-after-enter.png` 是真实 AI Ask 执行后的 packaged UI failure evidence，错误为 `NEXUS_STREAM_UNSUPPORTED`。
- `packaged-ai-ask-runtime-permission-denied-after-enter.png` 是真实 AI Ask 运行时权限拒绝 UI evidence；启动前缺 `intelligence.basic` 只会导致插件 enable blocked，不能作为 CoreBox permission-denied UI evidence。

## AI Stable 必补 artifact

- `evidence/coreapp-visible/corebox-ai-text-success.png`
- `evidence/coreapp-visible/corebox-ai-ocr-success.png`
- `evidence/coreapp-visible/corebox-ai-copy-failure.png`
- `evidence/coreapp-visible/corebox-ai-failure-logged-out.png`
- `evidence/coreapp-visible/corebox-ai-failure-provider-unavailable.png`
- `evidence/coreapp-visible/corebox-ai-failure-quota-exhausted.png`
- `evidence/coreapp-visible/corebox-ai-failure-model-unsupported.png`：已有替代采集 artifact `packaged-ai-ask-provider-enabled-after-enter.png`，仍需后续整理到正式 evidence 路径。
- `evidence/coreapp-visible/corebox-ai-failure-permission-denied.png`：已有替代采集 artifact `packaged-ai-ask-runtime-permission-denied-after-enter.png`，仍需后续整理到正式 evidence 路径。
- `evidence/coreapp-visible/corebox-ai-local-ollama-routing.png`

## 通过条件

CoreBox AI Ask 需要全部勾选以下 checklist 项；当前只勾选 model unsupported：

- CoreBox AI Ask `text.chat` success preview is visible.
- CoreBox AI Ask clipboard image `vision.ocr -> text.chat` success preview is visible.
- Provider, model, latency, trace id, and input kind metadata are visible for text and OCR paths.
- Copy failure remains visible inside the preview.
- Logged-out failure shows a sign-in recovery hint.
- Provider unavailable failure shows a provider health or settings recovery hint.
- Quota exhausted failure shows a credits or team quota recovery hint.
- Model unsupported failure shows a supported model or capability recovery hint. 已采集。
- Permission denied failure does not call Intelligence SDK and shows a permission recovery hint. 已采集。
- Local/Ollama preferred routing does not call disabled Nexus provider and shows routing trace or provider metadata.

## 复验命令

```bash
pnpm -C "apps/core-app" run visible:experience:verify -- --input "../../docs/engineering/reports/coreapp-visible-ai-stable-2026-06-18/coreapp-visible-experience-manifest.json" --requireAllPassed --requireArtifactPaths --requireVisualArtifacts --requireCheckedEvidence --requireExistingArtifacts --requireNonEmptyArtifacts
```

## 边界

- `corebox-ai-ask` 仍是 `pending`，不能把单个失败态截图冒充 AI Stable 体验闭环。
- `packaged-cdp-page-*.png` 与 `packaged-corebox-hotkey-page-*.png` 只证明 CDP 截图链路和 CoreBox 入口可见。
- focused tests、build、typecheck、manifest/checklist 生成都不能替代 packaged Electron 文本/OCR成功、固定失败路径和 routing trace。
- 成功态仍需要登录态、有效 provider/model 或本地 Local/Ollama 环境；当前 isolated profile 不具备成功态闭环条件。
- Report hygiene: keep this directory to summary docs, manifest/checklist, strict/readiness outputs and final evidence screenshots/JSON; put exploratory captures under `raw/` or `_local/` so `.gitignore` keeps them out of commits.
