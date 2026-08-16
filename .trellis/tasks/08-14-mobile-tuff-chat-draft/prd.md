# Mobile 跨设备会话应用草案

## Goal

在 `apps/mobile` 规划一个 iOS / Android 跨设备会话客户端，让用户以现有 Nexus/CoreApp 账号安全登录，在手机与平板等设备完成连续的文本对话、模型选择、流式回复和会话浏览。首轮只形成可审阅的产品与技术草案，不创建应用包、不安装依赖、不修改现有产品代码。

## Product Decision

- 产品名为 `Mobile`，代码包为 `apps/mobile`。它是 Tuff 的跨设备会话入口，覆盖手机与平板，不限制于单一设备形态。
- 产品是 Nexus/CoreApp 同账号的伴侣客户端，不创建独立账号体系。
- 会话的跨端同步是目标能力，但当前不存在服务端会话 SoT；MVP 不得将本地桌面历史描述为已同步。实际同步必须以新增的受认证会话服务为前提。

## Confirmed Facts

- 工作区目前没有 Expo 或 React Native 包；`pnpm-workspace.yaml` 对 `apps/*` 采用显式目录白名单，新增移动 App 必须登记。
- `@talex-touch/tuffex` 与 `@talex-touch/intelligence-uikit` 是 Vue/Web UI，依赖 DOM API，不能直接运行在 React Native；移动端只能继承 Tuff 的交互语言、设计令牌和消息语义。
- `@talex-touch/tuff-intelligence` 和 `@talex-touch/utils` 已提供可共享的 Intelligence 消息、Provider 与流事件类型；其 Node/LangGraph 运行时不能打入移动端。
- CoreApp 的 `text.chat` 支持 `preferredProviderId`、`modelPreference` 与 `start` / `delta` / `usage` / `part` / `end` 流事件；桌面 transport 依赖 Electron IPC 与 `MessagePort`，移动端不兼容。
- Nexus 已有 device authorization：`/api/app-auth/device/start` 创建临时代码，浏览器登录后确认，`poll` 返回 app token。现有 `/api/oauth/token` 强制 client secret，不能给公开移动端使用。
- Nexus 当前没有面向聊天、流式 Intelligence 或跨端会话同步的 HTTP API；Provider 密钥属于服务端，不能发送到移动端。

## Initial Technical Direction

- 新建 `apps/mobile`，采用 Expo managed workflow + TypeScript + React Native。在 Expo 官方模块不能满足真实原生需求前，不生成 iOS/Android 原生工程。
- Nexus 新增一个受 app token 认证的 Mobile BFF，负责用户、Provider/模型可见性、会话和 SSE 聊天流；Mobile 实现 HTTP/SSE adapter，不复刻 Electron IPC transport。
- Mobile 通过现有 device authorization 在系统浏览器登录；app token 使用 SecureStore 保存，启动、过期、撤销和拒绝均要有明确状态。
- MVP 包含：设备授权登录、会话列表、文本消息、图片输入、Provider/模型选择、流式渲染与取消、受保护的本地缓存。
- MVP 不包含：桌面本地搜索/索引、插件运行时、工具执行、语音、OCR/截图、自定义 Swift/Kotlin 模块。首版发布门槛包含服务端会话 SoT 与 CoreApp 接入；未完成跨端历史一致性不得发布聊天功能。

## Requirements

- 新 App 放在 `apps/mobile`，成为 pnpm workspace 的独立跨设备客户端包；不得引入 Electron、Node 原生模块或 Vue DOM UI 的运行时依赖。
- 视觉与交互继承 Tuff 的会话模型和信息层级，但由 React Native 组件原生实现，建立跨端可共享的令牌与协议边界。
- 所有聊天、Provider 选择、取消和错误状态必须走服务端的明确 API 契约；不允许 App 保存或接收 Provider API Key。
- App 只可使用公开客户端安全的 device authorization；app token 必须保存在系统安全存储，不写入日志、AsyncStorage 或分析数据。
- 架构草案必须比较 Expo managed、Expo prebuild 与 React Native CLI，并给出后续升级门槛。
- 首版发布前，移动端和 CoreApp 必须通过同一服务端 Conversation API 读写同账号历史，并以端到端测试验证消息顺序、取消后的最终状态和用户隔离。

## Acceptance Criteria

- [ ] 给出 Expo、Expo prebuild、React Native CLI 的取舍，及可验证的推荐方案。
- [ ] 给出 `apps/mobile` 的包边界、建议目录结构与依赖准入规则。
- [ ] 给出客户端、Nexus BFF、Tuff Intelligence 协议与凭证之间的边界，明确哪些现有代码可复用、哪些必须重写。
- [ ] 给出基于 Nexus device authorization 的移动登录流程、令牌存储与失败处理。
- [ ] 给出面向 iOS/Android 的 MVP 用户流程、主要屏幕、状态与非目标。
- [ ] 首版在移动端与 CoreApp 通过同一服务端 Conversation API 显示一致的同账号会话历史；未满足该条件不得发布聊天功能。
- [ ] 给出分阶段实施顺序、风险、验证策略及从 Expo managed 进入 prebuild 的触发条件。
- [ ] 用户确认草案后，才可运行 `task.py start` 并创建产品代码。
