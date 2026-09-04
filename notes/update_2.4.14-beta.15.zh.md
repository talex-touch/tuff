# Tuff v2.4.14-beta.15 更新说明

## 摘要

- **AI 与工具调用边界加固：** 完善 Pi/CLI 运行时编排、Provider 配置快照、工具注册与确认路径；主进程、渲染端和插件 SDK 的流式 transport 统一保留调用方身份与错误清理语义。
- **隐私、权限与可观测性收口：** 新增 AI 编排运行记录保留迁移；强化敏感文本、权限通道、审计 flush、Sentry 上报和隐私生命周期的边界检查；Nexus 的 Credits 与遥测批量写入补齐幂等性保障。
- **发布与跨平台可靠性提升：** 加固 macOS/Linux 更新交接脚本、发布工件和下载响应；CI 包含包级构建/发布门禁、Nexus 文档与图标检查；原生音频依赖更新至兼容版本。

## 变更内容

- **AI、自动化与 SDK**

- 扩展 AI Agent、CLI 编排器和 Tool Gateway 的类型化工具调用、流式响应、配额与错误投影，避免失败或取消后遗留监听器、请求状态或未清理的流式资源。
- 将工具确认、调用方身份和权限约束贯穿预加载通道、主进程、渲染端与插件侧 API；系统动作和文件能力遵循同一授权边界。
- 补齐 Provider 配置快照、Nexus/本地/OpenAI/Anthropic Provider 与 Pi CLI 运行时的回归覆盖，防止配置切换或不可调用 bridge 被误判为可用。

- **数据、隐私与安全**

- 新增 `0041_ai_orchestrator_run_retention` 迁移，并将编排运行数据纳入保留、清理和隐私验收链路。
- 加固隐私生命周期、审计日志退避、敏感文本处理、插件安装与网络服务；传输 SDK 现在覆盖 stream 协议、renderer 存储和插件事件边界。
- 修复 Nexus 管理风险接口在异常凭据配置下可能暴露内部配置线索的问题；部署预览 HAR 在落盘前执行凭据脱敏。
- Credits 消费和遥测批量上报增加幂等性测试与服务端约束，降低重复提交导致重复扣费或重复计数的风险。

- **CoreApp、插件与体验**

- 改进 CoreBox 推荐重建、文件索引设置、剪贴板自动粘贴和插件安装队列，并补齐系统动作、窗口身份和单实例保护覆盖。
- 更新 JSON Formatter、Clipboard History、Translation 与 Intelligence 插件的 manifest、主题、输入和运行时接口；SDK 维持面向插件的兼容 transport 表面。
- TuffEx 继续完善输入、上下文菜单、折叠内容可访问性及动效降级；偏好减少动态效果的环境不再保留无限动画或不可达交互元素。

- **Nexus、文档与发布工程**

- Nexus 文档页面、双语 API 内容和 demo/图标门禁同步收口；发布下载新增 HEAD/下载响应处理并强化版本工件的服务端校验。
- 更新更新器脚本和交接助手的 macOS/Linux 回归测试；发布工作流拆分并校验各包的 CI/发布配置，减少平台特定脚本漂移。
- 保留已验证的 `napi` 与 `symphonia` 原生音频依赖版本；未纳入分别与当前 `napi` API 和 `@langchain/core` peer 范围不兼容的 `napi-derive` 与 Anthropic major 升级。

- **验证**

- 已执行 `pnpm quality:pr`：发布说明门禁、变更 lint、目标测试（122 项）以及 CoreApp Node/Web 类型检查均通过。
- Beta 仍是预发布通道；请优先在非生产 profile 验证 AI 工具调用、插件安装、更新交接和 Nexus 遥测路径后再扩大使用范围。
