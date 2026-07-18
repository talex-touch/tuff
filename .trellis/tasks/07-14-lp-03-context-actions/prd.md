# LP-03 Super Panel-lite Context Actions

## Goal

在用户显式触发 Context Actions 时，将当前选中文本或剪贴板图片带入 CoreBox，并展示可执行、可诊断的上下文动作，复用现有 CoreBox、插件、Clipboard、TuffIntelligence、OCR、Translation、Snippets 与 Browser Open 能力，缩小与 uTools“超级面板”的核心体验差距。

## Background

- `TuffQuery.inputs` 与 `TuffInputType` 已支持 `text`、`image`、`files`、`html`。
- 插件功能通过 `IPluginFeature.acceptedInputTypes` 声明输入类型，`PluginFeaturesAdapter` 统一完成匹配与执行。
- OmniPanel 已拥有显式快捷键、选中文本捕获、剪贴板快照/恢复及不可用诊断。
- CoreBox 已通过 `TuffItem.actions`、`CoreBoxEvents.item.execute` 与 `ISearchProvider.onExecute` 路由动作。
- TuffIntelligence 已提供 `text.translate`、`text.summarize`、`text.rewrite`、`code.review`、`vision.ocr`、`image.caption`；Browser Open 已有外部 URL 校验策略；Snippets 与开发工具已有官方插件。

## Requirements

1. 用户显式触发 Context Actions 后，优先捕获活动应用选中文本；无选中文本时读取剪贴板图片。
2. Context Actions 输入、来源、匹配、执行结果、失败与不可用原因必须使用共享的判别联合和类型化路由合同。
3. CoreBox 必须清楚展示上下文类型、来源、动作来源、不可用原因以及执行中的 loading/执行后结果状态。
4. 文本上下文至少提供：QuickReview、翻译、总结、润色、改写、保存为 Snippet、网页搜索、现有 JSON/Base64/URL 等开发工具入口。
5. 图片上下文至少提供：OCR、翻译图片文字、AI 解释图片。
6. 官方插件动作必须沿用 `PluginFeaturesAdapter` 和插件生命周期；AI/OCR 必须沿用 TuffIntelligence；网页搜索必须沿用校验后的 Browser Open。
7. Context Actions 不得在后台自动读取新的敏感剪贴板内容；只有显式触发路径可以捕获选中文本或读取剪贴板图片。
8. 失败必须 fail-closed，并向用户展示可恢复的原因；不得伪装成功。

## Acceptance Criteria

- [x] 选中文本后显式触发 Context Actions，CoreBox 展示文本上下文及规定动作，执行后出现真实结果或明确失败原因。
- [x] 剪贴板含图片且无选中文本时显式触发，CoreBox 展示图片上下文以及 OCR、图片文字翻译、AI 解释动作。
- [x] Snippet、开发工具与翻译插件动作仍由现有插件适配器执行，不新增旁路。
- [x] AI/OCR/网页搜索动作分别通过 TuffIntelligence、系统 OCR 能力与外部 URL 策略执行。
- [x] 不可用 provider、缺失插件、选区捕获失败或空上下文均在 CoreBox 可见。
- [x] focused tests 覆盖输入归一化、动作匹配、显式读取边界、执行成功/失败与插件路由。
- [x] CoreApp node/web 类型检查、构建及可执行 UI smoke 通过。

## Out of Scope

- 全局鼠标右键浮层或任意位置悬浮面板。
- 新 raw channel、额外 preload 暴露或 ad-hoc IPC。
- 文件动作系统、文件自动上传 AI。
- 云市场、团队同步、复杂工作流。
