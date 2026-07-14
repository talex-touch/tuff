# PRD: Tuff 2.5.0 AI 桌面入口收口

> 更新时间：2026-07-11
> 状态：Stable Gate Closed / Productization Follow-up / R9.2 P0/P1 Closed
> 目标版本：2.5.0
> 当前路线：`../04-implementation/Roadmap-vNext-2026-06-18.md`
> 当前验收矩阵：`../04-implementation/Evidence-Matrix-AI-Stable-2026-06-18.md`

## 1. 最终目标

2.5.0 将 AI 板块定位为 **桌面 AI 入口收口版本**：用户可以从 CoreBox 直接完成文本问答与显式 OCR 后问答，并在 provider / model / trace / 错误恢复路径上获得可解释反馈。

工程上复用现有 `intelligence.invoke()`、`@talex-touch/tuff-intelligence`、Provider/Capability 配置、Nexus `/api/v1/intelligence/invoke` 与审计能力；不重写 AI，不把 Nexus Scene runtime 全量编排塞进 2.5.0 Stable。

## 2. Stable Release Gate

2.5.0 Stable 只承诺 **CoreBox 文本 + OCR + provider routing + 明确失败路径**，完成标准以 packaged Electron 证据为准：

- CoreBox AI Ask `text.chat`：可选择有效 provider/model，返回可读答案，展示 provider / model / trace / latency metadata。
- CoreBox 显式 OCR → 问答：剪贴板或显式图片输入先走 `vision.ocr`，再把 OCR 文本交给 `text.chat`；不得把 image-only 输入误判为成功回答。
- 默认 Nexus AI provider：普通 `chat()` 通过已认证 `/api/v1/intelligence/invoke` 返回完整结果；`chatStream()` 通过已认证 `/api/v1/intelligence/stream` 消费真实 provider token SSE，不再投影 buffered 单 delta。stream start/delta/usage/end 保留 Nexus 实际 `traceId/provider/model/latency`；Nexus 继续执行 provider quota、request/audit、credits billing 与 usage ledger。retry/fallback 只允许在首个可见 delta 前，输出后失败直接 fail-closed，避免重复回放。未登录仍显式 `NEXUS_AUTH_REQUIRED` 且不发起请求，本地可用 provider fallback 行为保持不变。
- Nexus token SSE 失败帧与 `/invoke` 非 2xx body 均携带 canonical `code/message/reason/recovery`；CoreApp 在 stream 首 delta 前/后及普通 invoke HTTP 失败都保留 typed failure。guest/tokenMode guest preflight 同样在网络前返回 typed `NEXUS_AUTH_REQUIRED` reason/recovery。`/invoke` 必须显式 opt in `captureErrorResponseData`；generic network request 默认不保留 error body。legacy message-only/malformed body 仅兼容原始错误，不伪造 code；HTTP status 继续可观测，network retry/cooldown 不被旁路。
- Provider routing：Local/Ollama 作为首选 provider 时不得访问 disabled Nexus provider；disabled/unavailable provider 不得被 capability binding 带入真实调用。
- 固定失败路径：未登录、provider unavailable、quota exhausted、quota verification unavailable、model/capability unsupported、permission denied 都必须 fail-closed，并展示用户可理解的恢复建议；quota 存储/检查异常不得继续调用 provider。插件的 `agent.run` / `workflow.execute`、auto-run session 与 workflow run 还必须在 runtime/provider/tool 前额外通过 `intelligence.agents`，`intelligence.basic` 不得旁路自主执行权限。
- 审计与用量：成功调用的 audit / usage ledger 记录 `traceId / provider / model / latency / usage / success` 等安全字段；失败 provider attempt audit 显式记录 canonical `errorCode`，current/legacy runtime failure 使用 canonical `code/message/reason/recovery`。不得在新 SSE、trace 或 audit 中写入 Error stack/cause/任意 enumerable 字段；historical trace response 同样在读取边界清洗 legacy root/nested error。插件 quota/usage 与 provider-test/model-fetch/audit-stats/local-environment control plane 必须 host-owned，plugin invoke/stream 与 `chatLangChain` / `ttsSpeak` compatibility caller 都由 verified transport identity 绑定，不信任 payload caller；TTS cache 按 caller 隔离。Plugin local knowledge scope 与 document/chunk ids 同样由 actor identity 绑定，不能跨插件搜索或覆盖 SQLite rows。DeepAgent 必须把 Responses/LangChain token usage 归一并传播到 Agent、step 与 workflow aggregate，只有 upstream 未提供 usage 时才回退零；插件仅保留安全 capability discovery。默认不保存完整 prompt/response。

## 3. Beta / MVP（不作为 Stable 阻塞项）

以下能力可以继续迭代和采集证据，但不得用来替代 Stable 文本/OCR 体验闭环：

- OmniPanel Writing Tools MVP：划词翻译、摘要、改写、解释、纠错、代码解释/Review、结果预览、copy/retry/replace clipboard 二次确认；packaged evidence 已关闭，但产品成熟度仍按 Beta 跟踪，不扩大 2.5.0 Stable 契约。
- Desktop Context Capsule：选区、剪贴板、OCR、文件元数据、当前应用名/窗口标题等非敏感上下文，作为 OmniPanel / Workflow / 后续 Agent 的上下文输入基础；R9.2 host-owned assembler 已让 CoreBox/Assistant/Workflow/OmniPanel 的受治理 ContextPackage 进入 Provider messages。OmniPanel 使用 `new / light`，Workflow 每 run 首个 chat step 使用 `new / session`、后续 step `continue / session`；四入口 packaged owner/scope/single-dispatch evidence 已闭合。
- Workflow `Use Model` 与 Review Queue：packaged evidence 已覆盖 Use Model 输出、pending/failed 队列态、cost/trace 与失败恢复；更完整的 copied/clipboard-replaced 管理体验继续按 Beta 迭代。
- Workflow Template Center：剪贴板整理、会议纪要/摘要、文本批处理、代码解释/Review、日报/周报。
- Tuff Intents / Action Manifest、Skills Pack、Background Automations、AI 高级 Chat / DeepAgent 联动。
- `audio.tts` 已作为翻译结果朗读 Beta 能力接入 typed `ttsSpeak`，不作为 Stable 承诺。真实 runtime 目前由 OpenAI-compatible / SiliconFlow provider 提供；Nexus server 对该 non-chat shape 仍 fail-closed，故 default Nexus provider 不得广告或绑定 `audio.tts`，待真实 Nexus TTS runtime 落地后再恢复。

## 4. Experimental / 2.5.x 后续

- Assistant 悬浮球与截图翻译已有 historical packaged evidence；2026-07-13 code path 已新增 VoicePanel 打开自动聚焦、Enter 发送、Shift+Enter/IME 编辑保护、in-flight 去重与 Escape 关闭，Web Speech 麦克风拒绝后的系统设置深链 + 显式语音重试、macOS Screen Recording 权限恢复、指针/指定显示器/区域来源选择、image translate scene route metadata、`vision.ocr -> text.translate` 文本降级、provider/login/quota/OCR/文本翻译失败后直达 `/intelligence/channels` 的一键恢复，以及 pin window host-owned copy/close、work-area 限界、75%–200% 缩放和受支持平台透明度预设。区域 overlay 采用 typed submit/cancel、sender 校验与全局 DIP 映射，取消不触发后续动作。仍需 current-version packaged recapture 与多显示器/HiDPI 可见采证；语音唤醒继续作为 Experimental follow-up。
- Assistant screenshot 的 `vision.ocr -> text.translate` 降级链统一携带 `caller: core.assistant.screenshot-translate` 与稳定 source metadata，确保 CoreApp Intelligence quota guard、audit 与 provider routing 同时覆盖两阶段调用；不得以 host-internal source 省略 caller 绕过配额校验。
- `@talex-touch/utils/transport/events/types` 现统一导出 `IntelligenceErrorCode` 与 runtime guard；CoreBox image scene、Assistant clipboard/screenshot、OCR/text fallback 和 VoicePanel 共享 typed `code/reason/recovery`。已识别的登录、provider、quota、model/capability、permission、network 失败不再折叠成 `SCENE_UNAVAILABLE` / `OCR_UNAVAILABLE`，但仍允许 screenshot 先尝试 OCR/text degraded path；未知 stage 异常保持原兼容错误码。
- Official `touch-intelligence` 已清理 `AUTH_REQUIRED` / `QUOTA_EXCEEDED` 私有别名：显式与 message-only 失败统一输出 canonical `NEXUS_AUTH_REQUIRED`、`QUOTA_EXHAUSTED`、`QUOTA_CHECK_UNAVAILABLE`、`CAPABILITY_UNSUPPORTED`、`NETWORK_FAILURE`、`INVALID_REQUEST` 等 code。CoreBox result signal 同步提供对应中英文 reason/action；quota verification 不再显示 credits exhausted 建议。
- Plugin Intelligence SDK 已将 chat AI Command 的 `promptTemplate` / `promptVariables` 从 legacy metadata 提升为 typed invoke options：显式字段优先于旧 metadata 与 capability binding，primary/fallback provider 共用同一渲染 prompt。`touch-intelligence@1.1.0` 新增 CoreBox Rewrite、Summarize、Explain 三组 text-only stateless feature；`1.2.0` 再新增 bounded 本地 `ai-commands.json` registry、动态 text/html command feature、按 id 原子 reload/reconcile，以及可视化 create/update/delete/import/export/open/reload editor；editor 已新增与 host simple Mustache 语义一致的 live System Prompt 预览，明确 nested key、缺失变量空文本与 invalid JSON 状态，并提供语法修正、专业语气、友好语气、代码审查四个 host-owned starter preset。内置/自定义命令均复用 ask widget、provider/model 选择、copy/retry 与 host quota/audit/fallback，不读写 AI Ask history/Memory/handoff；显式后缀为空时消费 CoreBox 附带 text/html 剪贴板输入，默认 AI Ask 不隐式读取该输入。2026-07-13 `2.4.13-beta.4` partial packaged capture 已覆盖 editor ready/save、missing registry 初始化、VM-safe 变量 byte 校验与 dynamic exact/suffix CoreBox result；仍缺 provider-backed current-version command invocation 与 share-link / one-click install preset 分发，全局 current-version gate 未关闭。
- 多 Agent 长任务面板。
- `image.generate`、`image.edit`、`audio.stt`、`audio.transcribe` 已有 provider/SDK 实现，但跨 provider 产品契约与真实运行证据仍按 Experimental 管理；`video.generate` 尚未进入 Stable capability 集合。
- Nexus Scene runtime 全量 orchestration。
- Computer Use、CDP 浏览器控制、可视化交互、Token 节省策略。

## 5. 非目标

- 不承诺全量多模态生成/编辑稳定可用。
- 不承诺 OmniPanel Writing Tools、Workflow / Review Queue / Skills / Automation 作为 2.5.0 Stable 完成项。
- 不重写 AI，不把 `retired-ai-app` 合并进 CoreApp。
- 不把 Nexus Scene runtime 全量编排作为 2.5.0 主卖点。
- 不新增孤立 AI provider 模型；供应商仍遵守 Provider Registry / Capability / Scene 解耦。

## 6. 质量与安全约束

- Provider metadata 可普通存储；API Key / secret 必须通过 secure-store、plugin secret capability 或 `authRef`。
- 插件调用 AI 仍需 `intelligence.basic`；复制回答与“替换选中文本”仍需 `clipboard.write`，替换动作必须经 typed Plugin Clipboard SDK / host transport，macOS 自动化拒绝需保留可恢复失败提示。
- 前端不得把 unavailable/unsupported 当作成功结果。
- AI 审计默认不保存完整 prompt/response。
- 新增 CoreApp/Nexus 通信必须走 typed transport / SDK / HTTP API 封装，不新增 raw channel。
- Stable 能力只承诺 CoreBox 文本 + 显式 OCR、provider routing 与固定失败路径；streaming 只作为 `text.chat` 的可选实现方式，`vision.ocr` 维持非流式。
- 不能用 SDK/schema/focused tests、mock provider、dry-run、memory fallback 或 local fake response 宣称 packaged Electron 体验闭环。

## 7. 当前状态

- CoreBox AI Ask 的 `AI-STABLE-01..08` 已绑定 historical packaged JSON/PNG；artifact/schema/tag/file verifier 为 13/13 passed。manifest baseline 为 `2.4.12-beta.8`，当前 CoreApp 为 `2.4.13-beta.6`，`--requireCurrentVersion` 当前 fail-closed；新版本 recapture 前不再称为“当前 strict visible gate passed”。
- `text.chat`、`vision.ocr -> text.chat`、Local/Ollama routing、未登录、provider unavailable、quota exhausted、model/capability unsupported、permission denied 与 copy failure 均已关闭 Stable evidence；后续变更必须复验，不能回退。
- OmniPanel Writing Tools、Assistant、Workflow Use Model / Review Queue 与 Provider registry observability 已有 packaged surface evidence，但仍按 Beta / Experimental 产品化，不反向扩大 CoreBox Stable 契约。
- R9.2 ContextHygiene P0/P1 已闭合，并完成 inactive continuation、metadata-only tombstone explain、Workflow clone/context lifecycle 与 OmniPanel packaged context follow-up：Memory governance/Review、CompressionSnapshot、CoreBox `new/continue/stateless`、Workflow run isolation、OmniPanel/Assistant `new + light` 与 CoreBox 单次 dispatch 均有 contract evidence；isolated packaged context evidence 已覆盖 CoreBox + Assistant + Workflow + OmniPanel。下一批只跟踪 real-profile 与 gated `scopeRef` migration，不把这些 open level 写成 production 完成。
- 2026-07-13 默认 Nexus provider 的 authenticated token SSE、split UTF-8 frame 解析、后端 metadata、terminal usage 与治理计费已有 Core/Nexus focused tests；CoreApp Intelligence SDK 另以首个 emitted delta 为 fallback commit point，输出后错误直接传播且不调用下一 provider。这是代码级最近路径修复，不替代登录态 Nexus packaged success、真实 token pacing 或 server/model unsupported recapture。
- 2026-07-13 CoreApp plugin lifecycle 已为注入的 `IntelligenceSdk` 恢复 stream-capable typed transport，并与 renderer SDK 共用 least-privilege facade：`contextStream()` 保留 verified plugin actor 与 `_sdkapi`，进入 host-owned ContextHygiene token stream；prepare-turn、CompressionSnapshot 与 Memory 管理方法在属性读取、`in` 和枚举面均不可见，host handler 继续 fail-closed。官方 `touch-intelligence` 只在首个 widget-visible delta 前允许 stream-to-`contextInvoke()` compatibility；feature query/send/retry supersede 会取消旧 StreamController，晚返回 controller 自取消，旧 callback 不得覆盖新请求。FeatureSDK 透传首次 push 的 awaitable host completion，stream 状态随后复用既有 widget 做同步 update，不再逐 token clear+async push/file-icon resolve。focused tests/smoke 覆盖 hard-cut、start envelope、delta/end、fallback commit boundary、cancellation 与 in-place update；真实 provider token pacing 仍待 current-version packaged recapture。
- R9.3 Local Model Runtime 与 R9.4 ASR Provider Runtime 继续后置，避免在 ContextHygiene 治理边界稳定前扩大运行时面。

## 8. 分步验收

### Step 0：需求口径锁定

- [x] Stable 收窄为 CoreBox 文本/OCR、Nexus provider routing 与固定失败路径。
- [x] OmniPanel Writing Tools 标为 MVP/Beta，不再作为 Stable blocker。
- [x] Workflow Use Model / Review Queue / Template Center 标为 Beta，不再作为 Stable blocker。
- [x] 明确禁止用 focused tests / mock / dry-run 替代 packaged Electron 体验证据。

### Step 1：最近路径自动化

- [x] CoreApp AI focused tests 覆盖 provider routing、错误归一化、permission denied、Nexus 未登录 fallback。
- [x] `plugins/touch-intelligence` build 通过。
- [x] `packages/tuffex` typecheck 通过。
- [x] `git diff --check` 通过。

2026-06-18 最近执行环境为 Node `v24.9.0` + pnpm `10.32.1`。该步骤只证明最近路径自动化，不替代 Step 2/3 packaged Electron 体验证据。推荐命令见 `../04-implementation/Evidence-Matrix-AI-Stable-2026-06-18.md`。

### Step 2：packaged Electron 成功路径

- [x] CoreApp visible-experience evidence contract 已要求文本成功、OCR 成功与 Local/Ollama routing artifact。
- [x] `text.chat` 成功截图/录屏，包含 provider/model/trace metadata。
- [x] `vision.ocr -> text.chat` 成功截图/录屏，包含 OCR/text handoff trace。
- [x] Local/Ollama 首选 provider 时不访问 disabled Nexus provider 的 runtime log/trace。

### Step 3：packaged Electron 固定失败路径

- [x] CoreApp visible-experience evidence contract 已要求 permission denied artifact 与 block 条件。
- [x] 未登录：展示登录/恢复建议，且不调用 provider。
- [x] provider unavailable：不 fallback 到不可用 Nexus 或假成功 payload。
- [x] quota exhausted：fail-closed 并展示 quota 恢复建议。
- [x] model/capability unsupported：展示明确 unsupported reason。
- [x] permission denied：缺 `intelligence.basic` 或相关权限时不调用 Intelligence SDK。

### Step 4：Beta evidence 后续

- [x] OmniPanel Writing Tools 真实 provider-backed 运行、copy/retry/replace clipboard 与失败恢复 packaged evidence。
- [x] Workflow Use Model 输出进入 Review Queue 的 packaged workflow-run evidence。
- [x] Review Queue pending/copied/clipboard-replaced/failed filters、runtime cost signals 与失败恢复 packaged renderer evidence。

## 9. 关联入口

- 当前执行清单：`../TODO.md`
- Roadmap vNext：`../04-implementation/Roadmap-vNext-2026-06-18.md`
- AI Stable Evidence Matrix：`../04-implementation/Evidence-Matrix-AI-Stable-2026-06-18.md`
- 产品路线图：`../04-implementation/Roadmap-vNext-2026-06-18.md`
- 质量基线：`../docs/PRD-QUALITY-BASELINE.md`
- Nexus Provider Scene PRD：`../02-architecture/nexus-provider-scene-aggregation-prd.md`
