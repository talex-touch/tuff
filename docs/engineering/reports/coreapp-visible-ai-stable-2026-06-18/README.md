# CoreApp AI Stable Visible Evidence Plan

> 日期：2026-06-18
> 范围：Tuff 2.5.0 AI Stable 的 CoreBox 文本/OCR、provider routing 与固定失败路径 evidence 采集清单。
> 状态：CoreBox AI Ask packaged surface 已通过；packaged hot/cold startup benchmark 与 startup first-screen visible state 已通过；packaged CDP/CoreBox/AI Ask 链路可用，已采到 text.chat success、vision.ocr -> text.chat handoff、logged-out、provider unavailable、quota、model/capability unsupported、permission denied、copy failure 与 Local/Ollama routing evidence；全局 strict visible gate 仍因其它 required surfaces pending 而失败。

## 当前结论

- Packaged app artifact ready：`apps/core-app/dist/mac-arm64/tuff.app` 版本匹配 `2.4.12-beta.8`。
- Packaged hot startup benchmark 已采到：`../startup-packaged-hot-runs-2026-06-21/汇总报告.md` 记录 10/10 PASS、Startup health P50 `552ms`、P95 `810ms`、0 WARN、0 ERROR。
- Packaged cold startup benchmark 已采到：`../startup-packaged-cold-runs-2026-06-21/汇总报告.md` 记录 10/10 PASS、per-run isolated userData、Startup health P50 `572ms`、P95 `615ms`、0 WARN、0 ERROR；long-tail note 为 `startup-packaged-cold-long-tail-notes.md`。
- Packaged startup first-screen 已采到：`startup-first-screen-settings.png` / `startup-first-screen-settings-dom.json` / `startup-health-summary.png` / `startup-health-summary-dom.json` 证明当前 `2.4.12-beta.8` packaged app 首个主 CoreApp Settings/onboarding surface 可用、不是空白/阻塞加载，且 Settings/About 中版本、构建信息与 Startup health summary 可达。
- Packaged CDP live capture 可用：`packaged-cdp-live-capture.json` 与 `packaged-cdp-page-*.png` 证明 packaged Electron 截图链路可用。
- CoreBox 入口可见：`packaged-corebox-hotkey-capture.json` 证明通过 packaged app + `Command+E` 可打开真实 CoreBox target，包含 `bodyClass: "MacIntel core-box"` 与 `inputIdExists: true`。
- CoreBox AI Ask model-unsupported 失败态已采到：`packaged-ai-ask-provider-enabled-after-enter.png` 展示真实 packaged CoreBox AI Ask 的 `NEXUS_STREAM_UNSUPPORTED` 模型/能力不支持错误。
- CoreBox AI Ask permission-denied 失败态已采到：`packaged-ai-ask-runtime-permission-denied-after-enter.png` 展示运行时撤销 `intelligence.basic` 后的权限恢复提示，且没有进入 Intelligence SDK provider 调用。
- CoreBox AI Ask Local/Ollama routing 已采到：`packaged-ai-ask-local-ollama-routing-after-enter.png` 展示真实 packaged CoreBox AI Ask 经 `local-default` / `qwen2.5:3b` 返回 `local-ok`，并展示 provider/model/latency/trace/input kind/capability metadata；`tuff-nexus-default` 在该 profile 中保持 disabled。
- CoreBox AI Ask quota exhausted 失败态已采到：`packaged-ai-ask-quota-exhausted.png` 展示真实 packaged CoreBox AI Ask 的配额不足 UI，包含重试/调整用量恢复建议；probe JSON 通过 `AI-STABLE-05` advisory check。
- CoreBox AI Ask logged-out 失败态已采到：`packaged-ai-ask-logged-out.png` 展示真实 packaged CoreBox AI Ask 的未登录恢复提示，probe JSON 通过 `AI-STABLE-03` advisory check。
- CoreBox AI Ask provider unavailable 失败态已采到：`packaged-ai-ask-provider-unavailable.png` 展示所有 `text.chat` provider disabled 时的 Provider 不可用恢复提示，且 `tuff-nexus-default` 保持 disabled；probe JSON 通过 `AI-STABLE-04` advisory check。
- CoreBox AI Ask text.chat 成功态已采到：`packaged-ai-ask-text-success.png` 展示真实 packaged CoreBox AI Ask 经 `local-default` / `qwen2.5:3b` 返回 `Response succeeded with answer.`，并展示 provider/model/latency/trace/input kind/capability metadata；probe JSON 通过 `AI-STABLE-01` advisory check。
- CoreBox AI Ask OCR handoff 成功态已采到：`raw/packaged-ai-ask-ocr-forced-feature-updated-plugin-after-wait.png` 展示真实 packaged CoreBox AI Ask 经剪贴板图片进入 OCR，再以 `local-default` / `qwen2.5:3b` 返回 `OCR response: vision ocr text success`，并展示 provider/model/latency/trace/input kind `text, image`/capability metadata；probe JSON 通过 `AI-STABLE-02` advisory check。
- CoreBox AI Ask copy failure 已采到：`packaged-ai-ask-copy-failure.png` 展示真实 packaged CoreBox AI Ask 在缺少 `clipboard.write` 时仍把 `复制失败：缺少 clipboard.write 权限` 与 `请在插件权限中允许 clipboard.write 后重试。` 留在 answer preview；probe JSON 为 `ok=true`，DOM 同时包含 `.AiChatbot__copyFailureNotice`、`clipboard.write` 与恢复提示。
- `corebox-ai-ask` manifest 已更新为 `passed`：text.chat success、OCR handoff success、logged-out、provider unavailable、quota exhausted、model unsupported、permission denied、copy failure 与 Local/Ollama routing evidence 均已绑定 artifact。全局 strict visible gate 仍是 `failed`，因为 startup/search/app-index/login/OmniPanel/Assistant/Workflow/Provider surfaces 仍 pending。

## 本次已完成

- 生成 visible-experience manifest：`coreapp-visible-experience-manifest.json`。
- 生成 checklist：`COREAPP_VISIBLE_EXPERIENCE_CHECKLIST.md`。
- 严格验证输出：`coreapp-visible-strict-verify-output.json`。
- 严格验证退出码：`coreapp-visible-strict-verify-exit-code.txt`，当前为 `1`，符合预期。
- 2026-06-21 packaged startup hot/cold evidence 已关闭：当前 `2.4.12-beta.8` packaged artifact 通过 hot/cold benchmark，manifest 中 `startup-packaged-hot` 与 `startup-packaged-cold` 均为 `passed`。
- 历史快照：2026-06-21 采集 text.chat success 前复跑严格验证为 `gate.passed=false`、`failureCount=88`，当时 `corebox-ai-ask` 已绑定 `AI-STABLE-03/04/05/06/07/08` partial tags，尚未绑定文本成功和 OCR 成功 evidence。
- 2026-06-21 追加采集 text.chat success 后复跑严格验证：`gate.passed=false`、`failureCount=86`、exit `1` 仍符合预期；`corebox-ai-ask` 已绑定 `AI-STABLE-01/03/04/05/06/07/08` partial tags，当时剩余缺口收敛到 `AI-STABLE-02`、OCR success、text+OCR metadata 与 copy failure。
- 2026-06-21 追加采集 OCR handoff success 后，`corebox-ai-ask` 已绑定 `AI-STABLE-01/02/03/04/05/06/07/08` partial tags；`AI-STABLE-02` artifact 暂绑定 `raw/packaged-ai-ask-ocr-forced-feature-updated-plugin-after-wait-*`，因为这组 capture 是当前有效 OCR evidence。当时 surface 仍为 `pending`，下一步缺口是 copy failure 与 broader visible surface checklist；后续 copy failure 复采已关闭这一缺口。
- 2026-06-21 同步 manifest/checklist 后复跑严格验证：`gate.passed=false`、`failure_count=82`、exit `1` 仍符合预期；当时 `corebox-ai-ask` 只剩 `Copy failure remains visible inside the preview` 这一项缺口，其它 failures 来自 startup/search/app-index/login/OmniPanel/Assistant/Workflow/Provider surfaces 仍 pending。
- 2026-06-21 copy failure packaged evidence 已关闭：发布形态 profile 使用 `touch-intelligence/dist/build` precompiled plugin 后，CDP 9412 通过 action panel refresh probe 触发 `copy-answer`，`packaged-ai-ask-copy-failure-probe.json` 为 `ok=true`，`packaged-ai-ask-copy-failure.png` 展示 answer preview 内的可见 copy failure notice。旧 `raw/packaged-ai-ask-copy-failure-*` 仍仅作为历史 blocker 诊断保留。
- 2026-06-21 copy failure evidence 同步后复跑严格验证：`gate.passed=false`、`failure_count=80`、exit `1` 仍符合预期；`corebox-ai-ask` 已为 `passed`，剩余 failures 来自 broader visible surfaces pending。
- 2026-06-21 startup hot/cold evidence 同步后复跑严格验证：`gate.passed=false`、`failure_count=68`、exit `1` 仍符合预期；`startup-packaged-hot`、`startup-packaged-cold` 与 `corebox-ai-ask` 均为 `passed`，当时剩余 failures 来自 first-screen/search/app-index/login/OmniPanel/Assistant/Workflow/Provider surfaces pending。
- 2026-06-21 startup first-screen evidence 同步后复跑严格验证：`gate.passed=false`、`failure_count=62`、exit `1` 仍符合预期；`startup-packaged-hot`、`startup-packaged-cold`、`startup-first-screen` 与 `corebox-ai-ask` 均为 `passed`，剩余 failures 来自 search/app-index/login/OmniPanel/Assistant/Workflow/Provider surfaces pending。
- 2026-06-21 CoreBox search states 复采仍保持 pending：CDP 9434/9435 中 `division-box` target 可见 720x500 结果区但只广播输入、不走本地搜索；普通 `core-box` target 接受 query input 但停在 720x56，`.CoreBoxRes` hidden，no-result retry / File Index settings 与 result source/status/reason pills 均未出现。无效采证已移动到 `raw/blocker-corebox-search-*`，仅作为 blocker 诊断，不进入 manifest。
- CoreBox AI Ask checklist 已包含 `permission denied` 与 `Local/Ollama routing` evidence 项。
- CoreBox AI Ask manifest/checklist 已新增 `evidenceTags` 与 `evidenceTagArtifacts`：当前把 packaged evidence 绑定到 `AI-STABLE-01/02/03/04/05/06/07/08`，且每个 tag 都指向对应 packaged probe JSON / screenshot；由于 `corebox-ai-ask` surface 已为 `passed`，checklist 用 `[x]` 标记这些 tag。
- 采集 readiness 输出：`coreapp-visible-readiness.json` 与 `coreapp-visible-readiness-output.json`。
- 采集 readiness 退出码：`coreapp-visible-readiness-exit-code.txt`，当前为 `1`。
- Packaged CDP live probe：`packaged-cdp-live-capture.json`、`packaged-cdp-page-01.png`、`packaged-cdp-page-02.png`、`packaged-cdp-page-03.png`、`packaged-cdp-live-capture.log`。
- Packaged CoreBox hotkey evidence：`packaged-corebox-hotkey-capture.json` 与 `packaged-corebox-hotkey-page-04.png`。
- Packaged CoreBox AI Ask model-unsupported evidence：`packaged-ai-ask-provider-enabled-probe.json` 与 `packaged-ai-ask-provider-enabled-after-enter.png`。
- Packaged CoreBox AI Ask runtime permission-denied evidence：`packaged-ai-ask-runtime-permission-denied-probe.json` 与 `packaged-ai-ask-runtime-permission-denied-after-enter.png`。
- Packaged CoreBox AI Ask Local/Ollama routing evidence：`packaged-ai-ask-local-ollama-routing-probe.json` 与 `packaged-ai-ask-local-ollama-routing-after-enter.png`。
- Packaged CoreBox AI Ask quota exhausted evidence：`packaged-ai-ask-quota-exhausted-probe.json` 与 `packaged-ai-ask-quota-exhausted.png`。
- Packaged CoreBox AI Ask logged-out evidence：`packaged-ai-ask-logged-out-probe.json` 与 `packaged-ai-ask-logged-out.png`。
- Packaged CoreBox AI Ask provider unavailable evidence：`packaged-ai-ask-provider-unavailable-probe.json` 与 `packaged-ai-ask-provider-unavailable.png`。
- Packaged CoreBox AI Ask text.chat success evidence：`packaged-ai-ask-text-success-probe.json` 与 `packaged-ai-ask-text-success.png`。
- Packaged CoreBox AI Ask OCR handoff evidence：`raw/packaged-ai-ask-ocr-forced-feature-updated-plugin-after-wait-probe.json` 与 `raw/packaged-ai-ask-ocr-forced-feature-updated-plugin-after-wait.png`。
- Packaged CoreBox AI Ask copy failure evidence：`packaged-ai-ask-copy-failure-probe.json` 与 `packaged-ai-ask-copy-failure.png`。
- Packaged startup benchmark evidence：`../startup-packaged-hot-runs-2026-06-21/汇总报告.md`、`../startup-packaged-hot-runs-2026-06-21/第10次运行报告.md`、`../startup-packaged-cold-runs-2026-06-21/汇总报告.md`、`../startup-packaged-cold-runs-2026-06-21/第01次运行报告.md` 与 `startup-packaged-cold-long-tail-notes.md`。
- Packaged startup first-screen evidence：`startup-first-screen-settings.png`、`startup-first-screen-settings-dom.json`、`startup-health-summary.png`、`startup-health-summary-dom.json` 与 `startup-first-screen-cdp-target-inventory.json`。
- Raw probe logs, pid files, `*-output.json` mirrors and duplicate stage screenshots are intentionally not required by the manifest and should stay local / ignored unless a future investigation needs them.
- `raw/blocker-corebox-search-*` 是 2026-06-21 `corebox-search-states` blocker 诊断：它们证明当前 packaged capture target/resize/search 触发链路未满足验收，不能作为 passed evidence。

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
- Local/Ollama preflight 已确认本机 `qwen2.5:3b` 可返回非空 `local-ok`；`AI-STABLE-08` packaged routing evidence 已用该模型采集完成。`qwen3:0.6b` 预检返回空回答，不能用于关闭成功或 routing evidence。预检 JSON 位于 ignored `_local/`，不是可提交 UI evidence。
- `packaged-ai-ask-quota-exhausted.png` 是真实 AI Ask quota exhausted UI evidence；采集时使用 fresh Chromium userData + seeded Tuff business profile，`touch-intelligence` 从 DB 加载，`touch-intelligence.intelligence-ask` search provider enabled，plugin quota disabled，UI 展示“AI 配额不足，请稍后重试或调整用量”。
- `packaged-ai-ask-logged-out.png` 是真实 AI Ask logged-out UI evidence；采集时使用 isolated profile，无登录态，不调用 provider 并展示登录恢复文案。
- `packaged-ai-ask-provider-unavailable.png` 是真实 AI Ask provider unavailable UI evidence；采集时使用 signed-in isolated profile，所有 `text.chat` providers disabled，UI 展示 Provider 不可用与设置/重试恢复文案。
- `packaged-ai-ask-text-success.png` 是真实 AI Ask text.chat success UI evidence；采集时使用 signed-in Local/Ollama profile，`tuff-nexus-default` disabled，`local-default` / `qwen2.5:3b` 返回非空答案并展示成功态 metadata。
- `raw/packaged-ai-ask-ocr-forced-feature-updated-plugin-after-wait.png` 是真实 AI Ask OCR handoff UI evidence；采集时使用从 signed-in text-success profile 派生的新 profile，排除旧 `DevToolsActivePort` / `Singleton*`，并把 profile 内已安装的 `touch-intelligence` 插件入口同步到当前源码 hash。UI 展示 OCR response、provider/model/latency/trace、input kind `text, image`、capability `text.chat` 与“图片已识别为文字上下文并参与回答”。
- `packaged-ai-ask-copy-failure.png` 是真实 AI Ask copy failure UI evidence；采集 profile 使用 `touch-intelligence/dist/build` precompiled plugin，缺少 `clipboard.write` 后 answer preview 保留 `复制失败`、`clipboard.write` 权限原因与恢复提示。

## AI Stable 必补 artifact

- `evidence/coreapp-visible/corebox-ai-text-success.png`
- `evidence/coreapp-visible/corebox-ai-copy-failure.png`
- `AI-STABLE-01` text.chat success partial：已绑定 `packaged-ai-ask-text-success-probe.json` 与 `packaged-ai-ask-text-success.png`。
- `AI-STABLE-02` OCR handoff success partial：已绑定 `raw/packaged-ai-ask-ocr-forced-feature-updated-plugin-after-wait-probe.json` 与 `raw/packaged-ai-ask-ocr-forced-feature-updated-plugin-after-wait.png`。
- `AI-STABLE-03` logged-out partial：已绑定 `packaged-ai-ask-logged-out-probe.json` 与 `packaged-ai-ask-logged-out.png`。
- `AI-STABLE-04` provider unavailable partial：已绑定 `packaged-ai-ask-provider-unavailable-probe.json` 与 `packaged-ai-ask-provider-unavailable.png`。
- `AI-STABLE-05` quota exhausted partial：已绑定 `packaged-ai-ask-quota-exhausted-probe.json` 与 `packaged-ai-ask-quota-exhausted.png`。
- `AI-STABLE-06` model/capability unsupported partial：已绑定 `packaged-ai-ask-provider-enabled-probe.json` 与 `packaged-ai-ask-provider-enabled-after-enter.png`。
- `AI-STABLE-07` permission denied / copy failure：已绑定 `packaged-ai-ask-runtime-permission-denied-probe.json`、`packaged-ai-ask-runtime-permission-denied-after-enter.png`、`packaged-ai-ask-copy-failure-probe.json` 与 `packaged-ai-ask-copy-failure.png`。
- `AI-STABLE-08` Local/Ollama routing partial：已绑定 `packaged-ai-ask-local-ollama-routing-probe.json` 与 `packaged-ai-ask-local-ollama-routing-after-enter.png`。

Local/Ollama routing 已使用 `qwen2.5:3b` 采集。证据同时保留 UI screenshot 与 probe JSON，显示 `local-default`、`qwen2.5:3b`、latency、trace、input kind、`text.chat` capability，且 advisory check 未出现 disabled Nexus fallback/call/response counter-signal。

## 通过条件

CoreBox AI Ask 需要全部勾选以下 checklist 项；当前已采集 text.chat success、OCR handoff success、copy failure、固定失败态与 Local/Ollama routing，`corebox-ai-ask` surface 已通过。全局 strict gate 仍需 broader visible surfaces pass：

- CoreBox AI Ask `text.chat` success preview is visible. 已采集。
- CoreBox AI Ask clipboard image `vision.ocr -> text.chat` success preview is visible. 已采集。
- Text and OCR success previews show a non-empty answer without empty-response copy. 已采集。
- Provider, model, latency, trace id, and input kind metadata are visible for text and OCR paths. 已采集。
- Copy failure remains visible inside the preview. 已采集。
- Logged-out failure shows a sign-in recovery hint. 已采集。
- Provider unavailable failure shows a provider health or settings recovery hint. 已采集。
- Quota exhausted failure shows a credits or team quota recovery hint. 已采集。
- Model unsupported failure shows a supported model or capability recovery hint. 已采集。
- Permission denied failure does not call Intelligence SDK and shows a permission recovery hint. 已采集。
- Local/Ollama preferred routing does not call disabled Nexus provider and shows routing trace or provider metadata. 已采集。

## 复验命令

```bash
corepack pnpm -C "apps/core-app" run visible:experience:verify -- --input "../../docs/engineering/reports/coreapp-visible-ai-stable-2026-06-18/coreapp-visible-experience-manifest.json" --requireAllPassed --requireArtifactPaths --requireVisualArtifacts --requireCheckedEvidence --requireEvidenceTags --requireExistingArtifacts --requireNonEmptyArtifacts
```

严格复验也可以直接调用脚本以生成纯 JSON 输出：

```bash
corepack pnpm -C "apps/core-app" exec tsx "scripts/coreapp-visible-experience-verify.ts" --input "../../docs/engineering/reports/coreapp-visible-ai-stable-2026-06-18/coreapp-visible-experience-manifest.json" --requireAllPassed --requireArtifactPaths --requireVisualArtifacts --requireCheckedEvidence --requireEvidenceTags --requireExistingArtifacts --requireNonEmptyArtifacts
```

## Packaged AI Ask probe

Use the reusable probe when a packaged Electron app is already running with remote debugging enabled:

```bash
corepack pnpm -C "apps/core-app" run visible:experience:ai-ask-probe -- --remoteDebuggingUrl "http://127.0.0.1:9342/json/list" --output "../../docs/engineering/reports/coreapp-visible-ai-stable-2026-06-18/raw/packaged-ai-ask-probe.json" --screenshot "../../docs/engineering/reports/coreapp-visible-ai-stable-2026-06-18/raw/packaged-ai-ask-probe.png"
```

For one or more fixed AI Stable items, add `--expectEvidenceTag AI-STABLE-xx` to record advisory DOM-signal checks in the probe JSON:

```bash
corepack pnpm -C "apps/core-app" run visible:experience:ai-ask-probe -- --remoteDebuggingUrl "http://127.0.0.1:9342/json/list" --expectEvidenceTag AI-STABLE-03 --output "../../docs/engineering/reports/coreapp-visible-ai-stable-2026-06-18/raw/packaged-ai-ask-logged-out-probe.json" --screenshot "../../docs/engineering/reports/coreapp-visible-ai-stable-2026-06-18/raw/packaged-ai-ask-logged-out.png"
```

This helper only attaches to an existing packaged CDP target, selects the CoreBox window, optionally types input, and captures DOM/screenshot artifacts. It does not launch Tuff, seed plugins, mutate permissions, or call provider APIs by itself.

2026-06-20 update: advisory `--expectEvidenceTag` checks now require grouped signals for success/routing paths. `AI-STABLE-01` and `AI-STABLE-02` must show text/OCR handoff, visible answer text, provider, model, latency, input kind and trace signals; they also reject visible failure-state text such as `Error`, `请求失败`, `NEXUS_STREAM_UNSUPPORTED`, permission denied, quota, provider unavailable, or logged-out copy. `AI-STABLE-03` through `AI-STABLE-07` must show the expected fixed failure class and recovery hint, and are rejected if the same capture also shows provider invocation, Intelligence SDK invocation, provider returned answer, `text.chat` response, fallback success, or fake-success counter-signals. `AI-STABLE-08` must show Local/Ollama/local provider plus routing/provider metadata, provider, model, latency, trace, input kind and capability signals, and must not show disabled Nexus fallback/call counter-signals. The probe also removes the current input echo before matching evidence signals and blocks widget-load failures, so prompt text such as `Local Ollama routing` cannot satisfy the check by itself.

## 边界

- `corebox-ai-ask` 与 startup surfaces 已是 `passed`，但全局 visible-experience gate 仍失败；不能把这些 surface 通过解读为 search/app-index/login/OmniPanel/Assistant/Workflow/Provider 等 broader surfaces 已完成。
- checklist 中的 `[x] AI-STABLE-*` 只表示 CoreBox AI Ask packaged evidence 已绑定并通过本报告验收；不能替代其它 visible surfaces 或 Beta/Experimental AI surface 的 evidence。
- `evidenceTags` 必须显式对应 `AI-STABLE-xx`，且 tag 必须通过 `evidenceTagArtifacts` 指向已附加 artifact；没有 tag 或没有 artifact 绑定的截图/说明不能关闭固定证据矩阵项。每个 tag 至少需要一个截图或录屏 artifact，且同一张截图/录屏不能复用关闭多个 `AI-STABLE-*` 固定证据项；probe JSON / trace 只能作为补充证据。
- `packaged-cdp-page-*.png` 与 `packaged-corebox-hotkey-page-*.png` 只证明 CDP 截图链路和 CoreBox 入口可见。
- focused tests、build、typecheck、manifest/checklist 生成都不能替代 packaged Electron 文本/OCR成功、固定失败路径和 routing trace。
- 成功态仍需要登录态、有效 provider/model 或本地 Local/Ollama 环境；当前 OCR 证据依赖已同步到最新插件入口的 signed-in evidence profile，后续复采需保持同等或更强的 profile/插件一致性。
- Report hygiene: keep this directory to summary docs, manifest/checklist, strict/readiness outputs and final evidence screenshots/JSON; put exploratory captures under `raw/` or `_local/` so `.gitignore` keeps them out of commits.
