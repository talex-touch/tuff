# 启用插件视图安全默认值 #298

## Goal

将所有生产插件 BrowserWindow/WebContentsView 统一硬切到 Electron 安全默认值和版本化 host preload；移除不安全 compat/webview/任意本地协议旁路，并为旧 SDK 与 legacy runtime 需求提供稳定迁移错误。

## Confirmed Facts

- 三条主链路（CoreBox、DivisionBox、public plugin window）已接入共享 profile、host preload、独立 partition、navigation policy 与 authoritative WebContents registration。
- `compat-plugin-view` 仍启用 `nodeIntegration`、subframe Node、webview，关闭 context isolation、sandbox、web security；默认仅在 `TUFF_PLUGIN_SECURE_VIEWS=1` 时强制 secure。
- 主窗口仍通过 `enableWebviewTag: true` 开启历史 webview；对应 `PluginView.vue` / `ViewPlugin.vue` 当前无生产引用，但仍保留可复用的不安全实现。
- bundled `clipboard-history` 与 `touch-translation` 使用 webcontent 且仍声明 SDK 260428；`touch-intelligence` 已声明 260713。
- `atom:` 当前把任意解码路径直接转成 `file:` fetch；仅旧的非 bundled `touch-image` 使用。
- 插件 partition 未注册 default-session `tfile:` handler；插件本地资源应继续只通过 canonical `file:` root policy。

## Requirements

### R1. Mandatory Secure Profile

- 删除生产可达的 unsafe compat profile 和 `TUFF_PLUGIN_SECURE_VIEWS` 分支。
- 所有插件 Electron surface 固定为 `webSecurity: true`、`nodeIntegration: false`、`nodeIntegrationInSubFrames: false`、`contextIsolation: true`、`sandbox: true`、`webviewTag: false`。
- managed webPreferences、preload、partition、additionalArguments 不接受插件覆盖。

### R2. Deterministic Legacy Gate

- SDK 低于 `SdkApi.V260615`、unsupported SDK、custom preload、webview 或显式 legacy runtime 必须在构造 BrowserWindow/WebContentsView 前拒绝。
- 返回稳定 `PLUGIN_WINDOW_LEGACY_RUNTIME_UNSUPPORTED`，消息只包含 reason、最低 SDK 与迁移动作，不包含路径或注入内容。
- 不提供 env、manifest 或 renderer payload 逃生开关；开发模式同样 fail closed。
- bundled webcontent 插件迁移到受支持 SDK marker，并通过真实 preload smoke。

### R3. Versioned Minimal Preload

- shared bootstrap 明确包含固定 `bridgeVersion`，host 与 preload 必须验证相同版本。
- page context 仅暴露冻结的 `$plugin`、`$config`、`$channel`；`$plugin.bridgeVersion` 可用于能力检测。
- 不暴露 raw IPC、Electron、process、require、filesystem、channel key 或 destroy/sendSync。

### R4. Sender-Bound Navigation And Resource Policy

- top-level navigation仅允许 exact local entry（含 hash）或显式 dev exact loopback origin。
- subframe/resource 仅允许 canonical plugin root；popup、webview attach、download、permissions全部拒绝。
- session callbacks必须按 owner WebContents id fail closed；非 owner/shared session request 不继承能力。
- 协议仅允许明确的 `file/data/blob` 与 dev same-origin `http/https/ws/wss`；其他 scheme 拒绝。

### R5. Remove Bypasses

- 主窗口关闭 `webviewTag`；历史无引用 `<webview>` host 不再作为生产实现存在。
- `atom:` 不再读取本地文件；保留 scheme 时只返回稳定 410 compatibility response。
- public plugin window只加载 canonical local HTML，且窗口控制继续只按 owning plugin registry 解析。

### R6. Compatibility And Documentation

- CoreBox、DivisionBox、public window 三条链路使用同一 compatibility gate、bridge version和policy。
- 文档说明最低 SDK、禁用 custom preload/webview、可用 globals、remote/download限制与错误码。
- 不将 Widget app-renderer sandbox误归类为独立 Electron plugin view；其现有 capability sandbox 保持独立。

## Acceptance Criteria

- [x] 仓库无生产可达 unsafe compat profile或 `TUFF_PLUGIN_SECURE_VIEWS`。
- [x] 每条插件 BrowserWindow/WebContentsView 链路在创建对象前完成 SDK/legacy/owner gate，并固定六项安全 preferences。
- [x] 旧 SDK、custom preload、webview、explicit legacy返回 `PLUGIN_WINDOW_LEGACY_RUNTIME_UNSUPPORTED`；SDK保留 code。
- [x] bridge version缺失/错误确定性失败；page context无 require/process/Electron/raw IPC。
- [x] navigation、subframe、popup、download、permission、protocol、canonical local resource测试覆盖 owner与非 owner。
- [x] 主窗口 `webviewTag=false`，历史 webview host已移除；`atom:` 无任意文件读取。
- [x] bundled webcontent插件完成 SDK migration，插件验证和真实 preload smoke通过。
- [x] focused tests、node/web typecheck、scoped lint、production build、preload artifact/smoke与 `git diff --check` 全部通过。

## Out Of Scope

- 完成 #297 Prelude utilityProcess RPC hard cut。
- 重构 Widget renderer capability sandbox。
- 允许第三方 legacy preload、Node renderer、remote production UI或下载能力。
