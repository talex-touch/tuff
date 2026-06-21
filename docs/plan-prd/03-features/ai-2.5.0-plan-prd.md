# PRD: Tuff 2.5.0 AI 桌面入口收口

> 更新时间：2026-06-18
> 状态：In Implementation / Stable Scope Reconciled / Evidence Open
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
- 默认 Nexus AI provider：登录态通过 `/api/v1/intelligence/invoke` 调用 Nexus Intelligence Provider / Provider Registry mirror；未登录显式 `NEXUS_AUTH_REQUIRED`，不发起无效 provider 请求，并允许本地可用 provider fallback。
- Provider routing：Local/Ollama 作为首选 provider 时不得访问 disabled Nexus provider；disabled/unavailable provider 不得被 capability binding 带入真实调用。
- 固定失败路径：未登录、provider unavailable、quota exhausted、model/capability unsupported、permission denied 都必须 fail-closed，并展示用户可理解的恢复建议。
- 审计与用量：记录 `traceId / provider / model / latency / usage / success / errorCode` 等安全字段，默认不保存完整 prompt/response。

## 3. Beta / MVP（不作为 Stable 阻塞项）

以下能力可以继续迭代和采集证据，但不得用来替代 Stable 文本/OCR 体验闭环：

- OmniPanel Writing Tools MVP：划词翻译、摘要、改写、解释、纠错、代码解释/Review、结果预览、copy/retry/replace clipboard 二次确认；需要真实 provider-backed packaged evidence 后再提升稳定等级。
- Desktop Context Capsule：选区、剪贴板、OCR、文件元数据、当前应用名/窗口标题等非敏感上下文，作为 OmniPanel / Workflow / 后续 Agent 的上下文输入基础；Stable 只要求 CoreBox evidence 中展示 input kind / OCR handoff trace。
- Workflow `Use Model` 节点：文本输入、结构化输出、失败重试、用量审计。
- Review Queue 最小闭环：AI 输出先进入预览，再由用户复制、替换剪贴板、保存或交给插件动作。
- Workflow Template Center：剪贴板整理、会议纪要/摘要、文本批处理、代码解释/Review、日报/周报。
- Tuff Intents / Action Manifest、Skills Pack、Background Automations、AI 高级 Chat / DeepAgent 联动。
- `audio.tts` 已作为翻译结果朗读 Beta 能力接入 typed `ttsSpeak`，不作为 Stable 承诺。

## 4. Experimental / 2.5.x 后续

- Assistant 悬浮球与语音唤醒。
- 多 Agent 长任务面板。
- `image.generate`、`image.edit`、`audio.stt`、`audio.transcribe`、`video.generate`。
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
- 插件调用 AI 仍需 `intelligence.basic`；复制回答仍需 `clipboard.write`。
- 前端不得把 unavailable/unsupported 当作成功结果。
- AI 审计默认不保存完整 prompt/response。
- 新增 CoreApp/Nexus 通信必须走 typed transport / SDK / HTTP API 封装，不新增 raw channel。
- Stable 能力只承诺 CoreBox 文本 + 显式 OCR、provider routing 与固定失败路径；streaming 只作为 `text.chat` 的可选实现方式，`vision.ocr` 维持非流式。
- 不能用 SDK/schema/focused tests、mock provider、dry-run、memory fallback 或 local fake response 宣称 packaged Electron 体验闭环。

## 7. 当前状态

- CoreBox AI Ask、Nexus invoke、`NEXUS_AUTH_REQUIRED`、OmniPanel actions、Workflow service / Review Queue UI-helper 都已有 dev 切片，不是空壳。
- 2026-06-17 已暴露 provider routing 风险：disabled Tuff Nexus 仍可能因 runtime token 注入与 `text.chat` capability binding 被带入流式调用；修复方向是只返回 provider 与 binding 均启用的候选。
- Local/Ollama 是当前用户预期 provider；仍需重启 CoreApp 后验证 `local-default` 作为 `text.chat` 首选 provider 时 `intelligence.stream()` 不访问 Nexus，并能把 token delta 增量渲染到 widget。
- OmniPanel Writing Tools MVP、Workflow Use Model、Review Queue 与 3 个 P0 模板保留为 Beta 证据队列，不作为 AI Stable 完成条件。
- 当前最大缺口是 packaged Electron 文本/OCR成功、固定失败路径、provider/model metadata chips 与 routing log/trace evidence。

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
- [ ] `text.chat` 成功截图/录屏，包含 provider/model/trace metadata。
- [ ] `vision.ocr -> text.chat` 成功截图/录屏，包含 OCR/text handoff trace。
- [ ] Local/Ollama 首选 provider 时不访问 disabled Nexus provider 的 runtime log/trace。

### Step 3：packaged Electron 固定失败路径

- [x] CoreApp visible-experience evidence contract 已要求 permission denied artifact 与 block 条件。
- [ ] 未登录：展示登录/恢复建议，且不调用 provider。
- [ ] provider unavailable：不 fallback 到不可用 Nexus 或假成功 payload。
- [ ] quota exhausted：fail-closed 并展示 quota 恢复建议。
- [ ] model/capability unsupported：展示明确 unsupported reason。
- [ ] permission denied：缺 `intelligence.basic` 或相关权限时不调用 Intelligence SDK。

### Step 4：Beta evidence 后续

- [ ] OmniPanel Writing Tools 真实 provider-backed 运行、copy/retry/replace clipboard 与失败恢复证据。
- [ ] Workflow Use Model 输出进入 Review Queue 的 packaged workflow-run 证据。
- [ ] Review Queue pending/copied/clipboard-replaced/failed 过滤、runtime cost signals、失败恢复证据。

## 9. 关联入口

- 当前执行清单：`../TODO.md`
- Roadmap vNext：`../04-implementation/Roadmap-vNext-2026-06-18.md`
- AI Stable Evidence Matrix：`../04-implementation/Evidence-Matrix-AI-Stable-2026-06-18.md`
- 产品路线图：`../04-implementation/Roadmap-vNext-2026-06-18.md`
- 质量基线：`../docs/PRD-QUALITY-BASELINE.md`
- Nexus Provider Scene PRD：`../02-architecture/nexus-provider-scene-aggregation-prd.md`
