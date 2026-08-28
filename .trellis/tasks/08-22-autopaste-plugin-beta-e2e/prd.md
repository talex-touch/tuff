# 收敛 AutoPaste 并验收三个插件 Beta

## Goal

收敛 CoreBox 输入与 AutoPaste 的真实运行链路，修复 JSON Formatter、Clipboard History、touch-translation 的可见缺陷，并将三个插件分别构建、发布为 Nexus BETA 版本；从未安装状态完成安装、授权、Light/Dark 主题和完整功能验收，每个插件产出独立录屏。

## Confirmed Facts

- 当前稳定版分别为 JSON Formatter `1.0.8`、Clipboard History `1.1.12`、touch-translation `1.0.17`，生产 Nexus 三者均为官方、已审核、可下载版本。
- 当前 CoreApp 版本为 `2.4.14-beta.14`。
- JSON Formatter 已订阅 CoreBox 输入变化，但 manifest 隐藏输入框且未读取首次打开时的现有输入。
- Clipboard History 已使用 Feature SDK 输入订阅、180ms debounce、请求代次防陈旧响应，并展示宿主写入的 OCR 元数据。
- Clipboard OCR 由宿主内部 `local-system-ocr` / macOS Vision 链路提供，不依赖外部 AI Key。
- Translation 的 Prelude 通过宿主 Translation/Intelligence 服务选择真实 Provider；插件不得绕过宿主权限与审计链路。
- 生产 Nexus 的 BETA 目录需要认证受众；发布、审核、下载证据必须使用现有受支持 API/CLI，不直接改 D1。

## Requirements

- R1：CoreBox 当前输入与后续输入变化必须可靠进入 JSON Formatter；不得使用 `navigator.clipboard` 或开发服务器作为替代证据。
- R2：AutoPaste 继续由宿主的 typed Clipboard SDK、权限门禁、主进程写剪贴板、隐藏 CoreBox、平台粘贴快捷键与显式错误归一化共同所有；不得新增旁路。
- R3：Clipboard History 输入变化必须自动查询现有 SQLite 历史；复制一张含可读文字的图片后必须生成并显示真实 OCR 结果。
- R4：Translation 必须通过真实宿主 AI/Translation Provider 返回结果。若隔离配置无可用 Provider，优先使用仓库已有 CC Switch/CLI 导入能力；仍不可用时才使用本机 Ollama 小模型。
- R5：三个插件均须正确适配 Light 与 Dark，优先遵循宿主注入的 `window.$config.themeStyle`，系统主题仅作为自动模式来源。
- R6：三个插件使用已验证的不冲突 BETA：JSON Formatter `1.0.9-beta.4`、Clipboard History `1.1.13-beta.2`、touch-translation `1.0.18-beta.4`；package/manifest 版本一致。
- R7：三个 `.tpex` 必须通过构建、包策略、安全扫描、签名与 Nexus BETA 发布；准确审核各自版本并验证 attestation、policy、scan、admission、下载摘要。
- R8：使用隔离 CoreApp profile，从三个插件均未安装开始，经生产 Nexus 下载、权限确认、启用后执行全部功能；官方来源不得出现重复来源确认，缺失权限只走统一权限卡。
- R9：JSON Formatter、Clipboard History、touch-translation 各产出一段独立、连续录屏，包含未安装、安装、Light/Dark、关键功能成功结果；录屏不得泄露密钥、Token 或个人内容。
- R10：不向老板提问。自行解决；只有外部凭据、平台限制或产品取舍无法自行消除时，记录到本任务 `ques.md`。

## Acceptance Criteria

- [x] JSON Formatter 打开后自动获得 CoreBox 输入，格式化结果可见，Light/Dark 均无主题错配。
- [x] Clipboard History 随 CoreBox 输入自动搜索，真实图片 OCR 文本可见，Light/Dark 均无主题错配。
- [x] Translation 通过 Ollama `qwen2.5:3b` 经真实宿主 Provider 返回 AI 翻译结果，并显示 Provider/Model 证据，Light/Dark 均无主题错配。
- [x] AutoPaste 回填链路成功；数据库、记录、平台能力与快捷键失败均返回显式错误，不静默写入未知目标。
- [x] 三个 BETA `.tpex` 构建成功，版本、通道、SHA-256 均有记录。
- [x] 三个版本已提交 Nexus、审核后 eligible，BETA 下载字节与发布摘要一致。
- [x] 隔离 profile 证明三者从未安装到安装、授权、启用、执行成功。
- [x] 三段录屏可播放并覆盖各自完整验收步骤。
- [x] `ques.md` 只保留仍需老板处理的问题；当前明确为“无”。

## Out of Scope

- 不发布新的 CoreApp 桌面版本。
- 不修改生产数据库或绕过 Nexus 审核、扫描、签名和权限门禁。
- 不重写 Translation Provider 架构或 Clipboard OCR 引擎。
