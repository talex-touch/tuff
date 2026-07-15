# CoreApp AI Stable Visible Evidence Plan

> 日期：2026-06-18
> 范围：Tuff 2.5.0 AI Stable 的 CoreBox 文本/OCR、provider routing 与固定失败路径 evidence 采集清单。
> 状态：historical manifest 的 13/13 required surfaces 与 77 个 artifact 已通过 schema/tag/path/file gate；其 `baselineVersion=2.4.12-beta.8`，当前 CoreApp 为 `2.4.13-beta.6`。`--requireCurrentVersion` 当前 fail-closed，完成全量新版本 recapture 前不得称为当前全局 strict gate 已通过。

## 当前结论

- Historical packaged artifact 集覆盖 `2.4.12-beta.8`、`2.4.12-beta.10` 与 `2.4.13-beta.1`；当前 `2.4.13-beta.6` 尚未完成全量复采，不能把现有 `apps/core-app/dist` 或旧 notes 自动视为当前版本 evidence。2026-07-13 仅新增 AI Command editor/save/dynamic feature 的 current-version partial evidence。
- Packaged hot startup benchmark 已采到：`../startup-packaged-hot-runs-2026-06-21/汇总报告.md` 记录 10/10 PASS、Startup health P50 `552ms`、P95 `810ms`、0 WARN、0 ERROR。
- Packaged cold startup benchmark 已采到：`../startup-packaged-cold-runs-2026-06-21/汇总报告.md` 记录 10/10 PASS、per-run isolated userData、Startup health P50 `572ms`、P95 `615ms`、0 WARN、0 ERROR；long-tail note 为 `startup-packaged-cold-long-tail-notes.md`。
- Packaged startup first-screen 已采到：`startup-first-screen-settings.png` / `startup-first-screen-settings-dom.json` / `startup-health-summary.png` / `startup-health-summary-dom.json` 证明 2026-06-21 `2.4.12-beta.8` packaged app 首个主 CoreApp Settings/onboarding surface 可用、不是空白/阻塞加载，且 Settings/About 中版本、构建信息与 Startup health summary 可达。
- Packaged CDP live capture 可用：`packaged-cdp-live-capture.json` 与 `packaged-cdp-page-*.png` 证明 packaged Electron 截图链路可用。
- CoreBox 入口可见：`packaged-corebox-hotkey-capture.json` 证明通过 packaged app + `Command+E` 可打开真实 CoreBox target，包含 `bodyClass: "MacIntel core-box"` 与 `inputIdExists: true`。
- CoreBox AI Ask model-unsupported 历史失败态已采到：`packaged-ai-ask-provider-enabled-after-enter.png` 展示当时客户端硬编码 `NEXUS_STREAM_UNSUPPORTED` 的 packaged UI failure/recovery。2026-07-13 客户端与 Nexus 已接通 authenticated token SSE；该 artifact 不代表当前 Nexus stream 仍 unsupported，也不替代新的登录态 success / server-model-denial recapture。
- CoreBox AI Ask permission-denied 失败态已采到：`packaged-ai-ask-runtime-permission-denied-after-enter.png` 展示运行时撤销 `intelligence.basic` 后的权限恢复提示，且没有进入 Intelligence SDK provider 调用。
- CoreBox AI Ask Local/Ollama routing 已采到：`packaged-ai-ask-local-ollama-routing-after-enter.png` 展示真实 packaged CoreBox AI Ask 经 `local-default` / `qwen2.5:3b` 返回 `local-ok`，并展示 provider/model/latency/trace/input kind/capability metadata；`tuff-nexus-default` 在该 profile 中保持 disabled。
- CoreBox AI Ask quota exhausted 失败态已采到：`packaged-ai-ask-quota-exhausted.png` 展示真实 packaged CoreBox AI Ask 的配额不足 UI，包含重试/调整用量恢复建议；probe JSON 通过 `AI-STABLE-05` advisory check。
- CoreBox AI Ask logged-out 失败态已采到：`packaged-ai-ask-logged-out.png` 展示真实 packaged CoreBox AI Ask 的未登录恢复提示，probe JSON 通过 `AI-STABLE-03` advisory check。
- CoreBox AI Ask provider unavailable 失败态已采到：`packaged-ai-ask-provider-unavailable.png` 展示所有 `text.chat` provider disabled 时的 Provider 不可用恢复提示，且 `tuff-nexus-default` 保持 disabled；probe JSON 通过 `AI-STABLE-04` advisory check。
- CoreBox AI Ask text.chat 成功态已采到：`packaged-ai-ask-text-success.png` 展示真实 packaged CoreBox AI Ask 经 `local-default` / `qwen2.5:3b` 返回 `Response succeeded with answer.`，并展示 provider/model/latency/trace/input kind/capability metadata；probe JSON 通过 `AI-STABLE-01` advisory check。
- CoreBox AI Ask OCR handoff 成功态已采到：`raw/packaged-ai-ask-ocr-forced-feature-updated-plugin-after-wait.png` 展示真实 packaged CoreBox AI Ask 经剪贴板图片进入 OCR，再以 `local-default` / `qwen2.5:3b` 返回 `OCR response: vision ocr text success`，并展示 provider/model/latency/trace/input kind `text, image`/capability metadata；probe JSON 通过 `AI-STABLE-02` advisory check。
- CoreBox AI Ask copy failure 已采到：`packaged-ai-ask-copy-failure.png` 展示真实 packaged CoreBox AI Ask 在缺少 `clipboard.write` 时仍把 `复制失败：缺少 clipboard.write 权限` 与 `请在插件权限中允许 clipboard.write 后重试。` 留在 answer preview；probe JSON 为 `ok=true`，DOM 同时包含 `.AiChatbot__copyFailureNotice`、`clipboard.write` 与恢复提示。
- `corebox-ai-ask` manifest 已更新为 `passed`：text.chat success、OCR handoff success、logged-out、provider unavailable、quota exhausted、model unsupported、permission denied、copy failure 与 Local/Ollama routing evidence 均已绑定 artifact。
- Current-version AI Command editor 已采到：`packaged-ai-command-editor-2026-07-13.png` / `packaged-ai-command-editor-2026-07-13-probe.json` 覆盖 ready、preset、save；`packaged-ai-command-preset-preview-2026-07-13.png` 证明 `professional-tone` 草稿与 2 个变量的确定性 System Prompt 预览；`packaged-ai-command-dynamic-feature-2026-07-13.png` 与 `packaged-ai-command-dynamic-widget-2026-07-13.png` 证明保存后无需 reload/restart 即出现动态结果，并复用预编译 `intelligence-ask` renderer 打开无历史 AI Command widget。native CoreBox capture 中结果窗口为 `720×190`、widget 为 `720×600`，动态 file icon 已解析为插件根内资源。采证中同步修复 active feature item 被 disabled root provider 误拦截、runtime feature file icon 未初始化、动态 feature 引用未构建 widget id、missing registry 被误判 invalid、plugin VM 缺少 `Buffer` 以及 command prefix 被 `over` catch-all 抢占的问题；未调用 provider，不关闭 global current-version gate。
- `corebox-search-states` manifest 已更新为 `passed`：R2D 覆盖 idle、searching/warm-up、no-result retry/File Index settings 可接受截图；R2I 覆盖真实 result source/status/reason pills，窗口从 `720x56` resize 到 `720x242`。
- `app-index-workbench` manifest 已更新为 `passed`：packaged Settings -> File Index -> App Index Manager 真实 UI 覆盖 summary counts、UWP/Store、Steam、快捷方式、协议、AppRef、路径 source filters，found/unchecked/disabled/attention diagnostic states，以及 Steam + disabled filtered-empty state；diagnostic JSON gate 通过。
- `browser-login-recovery` manifest 已更新为 `passed`：packaged Settings 登录恢复弹窗覆盖 browser-open failure waiting session、manual login URL copy、short code copy、timeout retry 文案与 network failure copy JSON 证据。
- `omnipanel-writing-tools` manifest 已更新为 `passed`：packaged OmniPanel writing tools evidence 覆盖 selected-text context / recovery hint、5 个 writing actions、AI result preview metadata、Retry / Copy / Replace Clipboard 与 replace confirmation。
- `provider-migration-evidence` manifest 已更新为 `passed`：绑定 Nexus local-only dry-run migration summary，覆盖 readiness/blockers/counts、secret redaction 与 dry-run 不声明 registry-primary readiness 边界。
- `assistant-floating-ball-entry` manifest 已更新为 `passed`：packaged probe 覆盖 Settings 中 Assistant enabled + voice wake disabled、悬浮球可见且不抢焦点、拖动位置重启后持久化、点击打开 Voice Panel。
- `assistant-screenshot-translate` manifest 已更新为 `passed`：packaged Assistant image translate evidence 覆盖 Settings 开关、剪贴板图片翻译入口、结果窗口、空剪贴板与 provider fallback。
- `workflow-use-model-review-queue` manifest 已更新为 `passed`：packaged evidence 覆盖 Use Model output 入 Review Queue、pending/failed 队列态、成本/trace 信号与失败恢复文案。
- `provider-registry-observability` manifest 已更新为 `passed`：packaged evidence 覆盖 provider health、scene latest run/recent failure、状态 filter 与 next-action hint。
- Historical global artifact gate：13/13 required surfaces `passed`，manifest artifact 总引用 77 次；current-version gate 仍因 baseline mismatch 开放。

## Strict visible gate 闭环

2026-06-24 Assistant screenshot translate、Workflow review queue 与 Provider registry observability evidence 合入后，historical verifier 为 `gate.passed=true`、13/13 surfaces passed，没有 artifact missing/empty/tag/checklist failure。2026-07-13 新增 `--requireCurrentVersion`；对当前 manifest 运行得到 `manifest=2.4.12-beta.8, current=2.4.13-beta.4`，因此当前版本 gate 为 open。

| Surface                           | Group     | Artifact count | 当前状态                                                                                                         |
| --------------------------------- | --------- | -------------: | ---------------------------------------------------------------------------------------------------------------- |
| `assistant-screenshot-translate`  | assistant |              6 | passed：Settings、clipboard image translate start/result、empty clipboard 与 provider fallback evidence 已绑定。 |
| `workflow-use-model-review-queue` | workflow  |              3 | passed：pending / failed queue 与 probe JSON evidence 已绑定。                                                   |
| `provider-registry-observability` | provider  |              3 | passed：provider health 与 scene run evidence 已绑定。                                                           |

## R2 evidence artifact inventory

2026-06-24 inventory 校验 `coreapp-visible-experience-manifest.json` 当前引用：13 个 surfaces 全部 `passed`，manifest artifact 总引用 72 次，去重后 72 个唯一文件。所有 manifest 引用文件均存在、非空，JSON artifact 均可解析，`evidenceTagArtifacts` 没有指向 unknown artifact。

| Passed surface                    | Unique artifacts | 类型分布                   |
| --------------------------------- | ---------------: | -------------------------- |
| `startup-packaged-hot`            |                2 | 2 markdown reports         |
| `startup-packaged-cold`           |                3 | 3 markdown reports         |
| `startup-first-screen`            |                5 | 2 PNG + 3 JSON             |
| `corebox-search-states`           |               11 | 4 PNG + 7 JSON             |
| `app-index-workbench`             |                6 | 2 PNG + 4 JSON             |
| `browser-login-recovery`          |                4 | 2 PNG + 2 JSON             |
| `corebox-ai-ask`                  |               20 | 10 PNG + 10 JSON           |
| `omnipanel-writing-tools`         |                3 | 3 PNG                      |
| `provider-migration-evidence`     |                1 | 1 markdown dry-run summary |
| `assistant-floating-ball-entry`   |                5 | 4 PNG + 1 JSON             |
| `assistant-screenshot-translate`  |                6 | 4 PNG + 2 JSON             |
| `workflow-use-model-review-queue` |                3 | 2 PNG + 1 JSON             |
| `provider-registry-observability` |                3 | 2 PNG + 1 JSON             |

截图/JSON 对应关系可复核：startup first-screen、CoreBox search states、AI Ask fixed paths 均有同名 `*-dom.json` 或 `*-probe.json` 配对。唯一非同名配对是 `packaged-corebox-hotkey-page-04.png`，它由 `packaged-corebox-hotkey-capture.json` 的 `captures[].screenshotPath` 关联，属于 capture JSON 对应关系，不是缺失证据。

## 下一批产品化 TODO

按 Roadmap / TODO 口径，R2 historical visible evidence 已关闭；current-version recapture 仍由 `--requireCurrentVersion` 保持 fail-closed。下一批在不冒充新 packaged evidence 的前提下推进 OmniPanel / Assistant 产品化、性能和灰度体验。

| Priority | Item                                      | 估时 | 取舍                                                                                                                                                                                                      |
| -------: | ----------------------------------------- | ---: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|        1 | Assistant screenshot translate 灰度产品化 | 3-5h | permission recovery、cursor/display/region 来源、image scene 路由 metadata、OCR 文本降级、pin host copy/close/work-area 限界与 zoom/opacity controls 已落 code path；待 current-version packaged recapture、provider fallback 文案和多显示器/HiDPI 采证。 |
|        2 | OmniPanel / Assistant 性能优化            | 2-4h | VoicePanel 首开竞态、悬浮球位置/display lifecycle 与三个 Assistant mode-exclusive renderer chunks 已落 code/focused/build contract；继续其余窗口生命周期、非 Assistant packaged asset 排除、首屏不阻塞及 current-version 启动/多显示器/HiDPI/hot-plug 采证。 |
|        3 | 桌面烟花 MVP                              | 2-4h | feature flag + 轻量 overlay/canvas，默认关闭；限制粒子数、帧率与自动退出，避免常驻 GPU/CPU 占用。                                                                                                         |
|        4 | 截图功能逐步引入                          | 3-6h | capture + preview + copy/save/translate、明确失败态、typed region overlay 与 OCR 文本降级已落；继续补多显示器/HiDPI、真实 provider 可见采证和 translate 产品化。                                          |

## 本次已完成

- 生成 visible-experience manifest：`coreapp-visible-experience-manifest.json`。
- 生成 checklist：`COREAPP_VISIBLE_EXPERIENCE_CHECKLIST.md`。
- 2026-06-24 App Index workbench evidence 已关闭：`app-index-workbench-summary-2026-06-24.png/json` 证明 summary counts、6 类 source filters 与 found/unchecked/disabled/attention diagnostic states；`app-index-workbench-filtered-empty-2026-06-24.png/json` 证明 Steam + disabled filtered-empty 与 unconfigured empty state 可区分；`app-index-workbench-diagnostic-2026-06-24.json` 通过 `app-index:diagnostic:verify`。
- 2026-06-24 browser login recovery evidence 已关闭：`login-browser-open-failure.png/json` 证明 browser-open failure 不丢 device authorization waiting session，manual login URL / short code copy 按钮可见且 copy result 为 success；`login-timeout-or-network-failure.png/json` 证明短超时后失败文案、retry/close action 与 network failure copy 可复核。
- 2026-06-24 OmniPanel writing tools evidence 已关闭：packaged evidence 覆盖 selected-text context / recovery hint、5 个 writing actions、AI result preview metadata、Retry / Copy / Replace Clipboard 与 replace confirmation；`omnipanel-writing-tools` 不再出现在 strict verifier failure list 中。
- 2026-06-24 Provider migration evidence 已关闭：`provider-migration-dry-run-2026-06-24.md` 证明 Nexus migration dry-run summary、planning readiness、blocker/counts、secret redaction 与 dry-run 不声明 registry-primary readiness；该证据为 local-only dry-run，不等于生产 registry-primary ready。
- 2026-06-24 Assistant floating ball evidence 已关闭：`assistant-floating-ball-probe-2026-06-24.json` 与 4 张 PNG 证明 Settings 中 Assistant enabled + voice wake disabled、悬浮球可见且不抢焦点、拖动位置重启后持久化、点击后 Voice Panel 打开并展示 `翻译剪贴板图片` / `截图并翻译` 入口。
- 2026-07-13 Assistant floating-ball code follow-up：saved position 现按自身坐标选择 display，保留负桌面坐标并 clamp 到当前 work area；canonical `{-1,-1}` 仍使用 cursor display 默认位置。30 个 focused tests、targeted ESLint 与 CoreApp node typecheck passed；这不把 2026-06-24 historical artifact 升级为 current-version 多显示器/HiDPI 证据。
- 2026-07-13 Assistant display-topology code follow-up：模块订阅并清理 `display-added` / `display-removed` / `display-metrics-changed`，只重排 live 悬浮球和 visible Voice Panel，不创建窗口、抢焦点、重复广播或覆盖 saved position。33 个 behavioral tests + 7 个 startup contract tests、targeted ESLint 与 CoreApp node typecheck passed；真实 display hot-plug/HiDPI 和 current-version packaged evidence 仍 open。
- 2026-07-13 Assistant renderer chunk follow-up：`AppEntrance` 将 FloatingBall、VoicePanel、ScreenshotRegionSelector 改为按 window mode 动态加载；production renderer build 分别生成约 8.36 / 44.16 / 6.03 kB 的独立 JS chunks。8 个 startup contract tests、targeted ESLint、CoreApp web typecheck 与 `electron-vite build` passed；没有 startup benchmark 或 packaged recapture，不把 chunk 拆分写成已测得的启动性能结论。
- 2026-06-24 Assistant screenshot translate evidence 已关闭：`assistant-image-translate-probe-2026-06-24.json` 与 4 张 PNG 证明 Settings 开关、剪贴板图片翻译入口、翻译结果窗口、空剪贴板与 provider fallback。
- 2026-06-24 Workflow review queue evidence 已关闭：`workflow-review-queue-probe-2026-06-24.json`、pending / failed 两张 PNG 覆盖 Review Queue 主路径与失败恢复。
- 2026-06-24 Provider registry observability evidence 已关闭：`provider-registry-observability-probe-2026-06-24.json`、provider health / scene run 两张 PNG 覆盖状态观测与 next-action。
- 严格验证输出：`coreapp-visible-strict-verify-output.json`。
- 严格验证 current-version 口径：`coreapp-visible-strict-verify-output.json` 记录 13/13 required surfaces 与 77 个 artifact 的 schema/tag/path/file checks 均通过；`gate.passed=false` 的唯一 failure 是 `manifest=2.4.12-beta.8, current=2.4.13-beta.4`。
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
- 2026-06-22 CoreBox search states R2D packaged 复采取得可见态证据：重新构建 `apps/core-app/dist/mac-arm64/tuff.app` 到 `2.4.12-beta.10` 并用本机 Apple Development 身份签名后，普通 `core-box` target 可通过 CDP 9472 访问；`corebox-search-idle-2026-06-22-r2d.*` 证明 idle state，`corebox-search-searching-2026-06-22-r2d.*` 证明 searching/warm-up 可见态，`corebox-search-no-result-2026-06-22-r2d.*` 证明 no-result retry/File Index settings 出现在可接受截图中。R2D-only 阶段仍保持 pending，因为 isolated packaged profile 无 result rows，source/status/reason pills 仍缺真实可见样本；本次采集还记录 app scanner `spawn EBADF`。
- 2026-06-22 CoreBox search states R2I packaged 复采关闭 result pills 缺口：同一个 initialized packaged profile 通过 `screenshot` 查询返回真实结果，普通 `core-box` 窗口从 `720x56` resize 到 `720x242`，`corebox-search-result-pills-2026-06-22-r2i.png` 展示 2 行结果、2 个 source badge、system 行 status/reason pills 无重叠。`corebox-search-states` 已标记 `passed`；全局 visible gate 仍因 broader surfaces pending 失败。
- 2026-06-22 R2I evidence 同步后复跑严格验证：`gate.passed=false`、`failureCount=55`、exit `1` 仍符合预期；`corebox-search-states` 不再出现在 failure list 中，剩余 failures 来自 app-index/login/OmniPanel/Assistant/Workflow/Provider broader surfaces pending。
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
- CoreBox search states R2D evidence：`corebox-search-states-recapture-2026-06-22-r2d.json`、`corebox-search-cdp-inventory-2026-06-22-r2d.json`、`corebox-search-idle-2026-06-22-r2d.*`、`corebox-search-searching-2026-06-22-r2d.*` 与 `corebox-search-no-result-2026-06-22-r2d.*`。
- CoreBox search states R2I evidence：`corebox-search-cdp-inventory-2026-06-22-r2i.json`、`corebox-search-result-pills-2026-06-22-r2i.png` 与 `corebox-search-result-pills-2026-06-22-r2i-dom.json`。
- Raw probe logs, pid files, `*-output.json` mirrors and duplicate stage screenshots are intentionally not required by the manifest and should stay local / ignored unless a future investigation needs them.
- `raw/blocker-corebox-search-*` 是 2026-06-21 `corebox-search-states` blocker 诊断：它们证明当前 packaged capture target/resize/search 触发链路未满足验收，不能作为 passed evidence。

## 当前采集 readiness

- `packaged-artifact`: ready，`apps/core-app/dist/mac-arm64/tuff.app` 版本匹配 `2.4.13-beta.1`。
- `browser-smoke-boundary`: warning，browser-only smoke 只能作为 Electron preload 缺失的负面证据，不能作为 AI visible proof。
- `electron-dev-capture`: blocked，当前 Electron dev capture 没有暴露可用 remote debugging target。
- `screen-recording`: warning，macOS Screen Recording 权限未检查。

补充 packaged CDP / CoreBox probe：

- 使用 isolated userData 启动 packaged app 并加 `--remote-debugging-port`，CDP target 枚举与 `Page.captureScreenshot` 可用。
- 直接给主 app 传 `--touch-type=core-box` 不能进入 CoreBox；可用路径是 packaged app + `Command+E` hotkey，由主进程创建 CoreBox BrowserWindow。
- `packaged-corebox-hotkey-page-*.png` 只证明 CoreBox 入口可见，不是 AI 成功/失败 evidence。
- `packaged-ai-ask-provider-enabled-after-enter.png` 是 2026-06-18 真实 AI Ask 执行后的 packaged UI failure evidence，错误为当时客户端硬编码的 `NEXUS_STREAM_UNSUPPORTED`；2026-07-13 后仅按历史 failure-handling artifact 保留。
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

- `corebox-ai-ask`、startup、search/app-index、login recovery、OmniPanel、Assistant、Workflow 与 Provider registry historical surfaces 已是 13/13 `passed`；当前 `2.4.13-beta.6` 必须完成 recapture/update baseline 并通过 `--requireCurrentVersion`，才能重新关闭 current gate。
- 2026-07-13 默认 Nexus authenticated token SSE、实际后端 metadata、terminal usage、治理计费与 pre-delta-only fallback 只有 focused code/test evidence；本目录未新增登录态 Nexus packaged success，也未用旧 `NEXUS_STREAM_UNSUPPORTED` 截图冒充当前 capability denial。
- checklist 中的 `[x] AI-STABLE-*` 只表示 CoreBox AI Ask packaged evidence 已绑定并通过本报告验收；不能替代其它 visible surfaces 或 Beta/Experimental AI surface 的 evidence。
- `evidenceTags` 必须显式对应 `AI-STABLE-xx`，且 tag 必须通过 `evidenceTagArtifacts` 指向已附加 artifact；没有 tag 或没有 artifact 绑定的截图/说明不能关闭固定证据矩阵项。每个 tag 至少需要一个截图或录屏 artifact，且同一张截图/录屏不能复用关闭多个 `AI-STABLE-*` 固定证据项；probe JSON / trace 只能作为补充证据。
- `packaged-cdp-page-*.png` 与 `packaged-corebox-hotkey-page-*.png` 只证明 CDP 截图链路和 CoreBox 入口可见。
- focused tests、build、typecheck、manifest/checklist 生成都不能替代 packaged Electron 文本/OCR成功、固定失败路径和 routing trace。
- 成功态仍需要登录态、有效 provider/model 或本地 Local/Ollama 环境；当前 OCR 证据依赖已同步到最新插件入口的 signed-in evidence profile，后续复采需保持同等或更强的 profile/插件一致性。
- Report hygiene: keep this directory to summary docs, manifest/checklist, strict/readiness outputs and final evidence screenshots/JSON; put exploratory captures under `raw/` or `_local/` so `.gitignore` keeps them out of commits.
