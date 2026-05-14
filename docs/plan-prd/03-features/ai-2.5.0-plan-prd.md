# PRD: Tuff 2.5.0 AI 桌面入口收口

> 更新时间：2026-05-14
> 状态：In Implementation / Core Nexus AI Invoke Slice
> 目标版本：2.5.0
> 完整快照：`./archive/ai-2.5.0-plan-prd.full-2026-05-14.md`

## 1. 最终目标

2.5.0 将 AI 板块定位为 **桌面 AI 入口收口版本**：用户从 CoreBox / OmniPanel 直接完成问答、划词处理、剪贴板整理等高频桌面任务。

工程上复用现有 `intelligence.invoke()`、`@talex-touch/tuff-intelligence`、Provider/Capability 配置与审计能力；不重写 AI，不把 Nexus Scene runtime 全量编排塞进 2.5.0 Stable。

## 2. Stable 范围

- CoreBox AI Ask：文本问答、剪贴板图片 `vision.ocr -> text.chat`、复制回答、重试、失败可见。
- OmniPanel Writing Tools：划词翻译、摘要、改写、解释、纠错、代码解释/Review。
- Workflow `Use Model` 节点：文本输入、结构化输出、失败重试、用量审计。
- Review Queue 最小闭环：AI 输出先进入预览，再由用户复制、替换剪贴板、保存或交给插件动作。
- Desktop Context Capsule：选区、剪贴板、OCR、文件元数据、当前应用名/窗口标题等非敏感上下文。
- 默认 Nexus AI provider：登录态 `/api/v1/intelligence/invoke` 调用 Nexus Intelligence Provider / Provider Registry mirror；未登录显式 `NEXUS_AUTH_REQUIRED` 并 fallback。
- 审计与用量：记录 `traceId / provider / model / latency / usage / success / errorCode`，默认不保存完整 prompt/response。

## 3. Beta / Experimental

### Beta

- Workflow Template Center：剪贴板整理、会议纪要/摘要、文本批处理、代码解释/Review、日报/周报。
- Tuff Intents / Action Manifest。
- Skills Pack。
- Background Automations，默认需要用户确认。
- AI 高级 Chat / DeepAgent 联动。

### Experimental / 2.5.x 后续

- Assistant 悬浮球与语音唤醒。
- 多 Agent 长任务面板。
- `image.generate`、`image.edit`、`audio.tts`、`audio.stt`、`audio.transcribe`、`video.generate`。
- Nexus Scene runtime 全量 orchestration。

## 4. 非目标

- 不承诺全量多模态生成/编辑稳定可用。
- 不重写 AI，不把 `retired-ai-app` 合并进 CoreApp。
- 不把 Nexus Scene runtime 全量编排作为 2.5.0 主卖点。
- 不新增孤立 AI provider 模型；供应商仍遵守 Provider registry / Capability / Scene 解耦。

## 5. 质量与安全约束

- Provider metadata 可普通存储；API Key / secret 必须通过 secure-store 或 `authRef`。
- 插件调用 AI 仍需 `intelligence.basic`；复制回答仍需 `clipboard.write`。
- 前端不得把 unavailable/unsupported 当作成功结果。
- AI 审计默认不保存完整 prompt/response。
- 新增 CoreApp/Nexus 通信必须走 typed transport / SDK / HTTP API 封装，不新增 raw channel。
- Stable 能力只承诺文本 + OCR。

## 6. 当前状态

- CoreBox AI Ask 最小 Stable 切片已接入 `text.chat` 与 `vision.ocr -> text.chat`。
- 登录态 Nexus AI invoke 薄接口已进入实现切片。
- OmniPanel Writing Tools MVP 已接入翻译/摘要/改写/解释/Review、结果预览、Desktop Context Capsule、copy/retry/replace clipboard 二次确认。
- 后续重点：Workflow `Use Model` 节点、完整 Review Queue、3 个 P0 Workflow 模板。

## 7. 验收清单

- [ ] CoreBox AI Ask 文本 + OCR 场景可用，失败提示清晰。
- [ ] OmniPanel Writing Tools MVP 场景可用，用户可预览、复制、重试、替换剪贴板。
- [ ] Nexus AI invoke 未登录、provider 不可用、quota 不足、模型不支持均返回明确错误。
- [ ] Provider secret 不进入普通配置/localStorage/日志。
- [ ] AI 审计字段满足最小用量统计且不保存完整 prompt/response。
- [ ] 最近路径 typecheck/test 通过或记录既有失败项。
- [ ] README/TODO/CHANGES/INDEX/Roadmap/Quality Baseline 按影响同步。

## 8. 关联入口

- 当前执行清单：`../TODO.md`
- 产品路线图：`../01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- 质量基线：`../docs/PRD-QUALITY-BASELINE.md`
- Nexus Provider Scene PRD：`../02-architecture/nexus-provider-scene-aggregation-prd.md`
