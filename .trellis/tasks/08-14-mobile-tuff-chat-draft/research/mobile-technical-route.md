# Mobile 跨设备客户端技术路线调研

## 结论

建议 MVP 新建 `apps/mobile`，采用 Expo managed + TypeScript + React Native；首次仅做文本聊天、图片输入、Provider/模型选择、流式取消与会话本地缓存。接入独立的 Nexus/服务端 BFF，不能直连 CoreApp 的 Electron transport 或复用桌面原生模块。需要未被 Expo 官方模块覆盖的原生能力时，再切 Expo prebuild + development build；不建议当前选 React Native CLI。

## 工作区与约定

`pnpm-workspace.yaml:2-9` 对每个 `apps` 应用逐项列举，新增移动包时须添加 workspace 行；当前无 Expo/RN workspace package。根 `package.json:6,10-18` 锁定 pnpm 10.34.4、Node >=24.15、TypeScript 5.9，并以 `pnpm -r` typecheck；根 `eslint.config.js:1-45` 使用 Antfu ESLint、零 warning、未用变量仅允许 `_` 前缀。移动包应有独立 ESLint/tsconfig，避免 Vue/Electron 规则和依赖扩散。

## 三包复用判断

- `@talex-touch/tuffex` 是 Vue 3 UI（`packages/tuffex/package.json:8-18,55,69-70`）；聊天输入直接使用 `HTMLTextAreaElement`、`ClipboardEvent`、`DragEvent`（`packages/tuffex/packages/components/src/chat/src/TxChatComposer.vue:64,76,112`），不可跨 RN 复用。仅可参考消息模型和视觉 token。
- `@talex-touch/intelligence-uikit` 也依赖 Vue/Vite/vue-tsc（`packages/intelligence-uikit/package.json:23-32`），会使用 `HTMLElement`、`ResizeObserver`、`window`（`packages/intelligence-uikit/src/components/conversation/TxAiConversation.vue:22-99`），不可复用 UI；其 `TxAiMessageModel` 结构可手工映射。
- `@talex-touch/tuff-intelligence` 的 `./light`、`./client`、`./types/intelligence` 均有公开导出（`packages/tuff-intelligence/package.json:14-58`），类型转发自 `@talex-touch/utils`（`packages/tuff-intelligence/src/types/intelligence.ts:20-35`），可复用协议类型。注意其构建目标为 Node 24（同文件:42-47）、含 LangGraph，不能直接打进移动端；只共享类型或抽取无 Node 依赖的协议子包。

## 聊天、Provider 与流式边界

CoreApp 使用 `text.chat`，入参是 `IntelligenceChatPayload`，选择通过 `preferredProviderId`/`modelPreference`（`apps/core-app/src/renderer/src/modules/conversation/useHomeConversation.ts:25-100,203-205`）。流式标准为 `start/delta/usage/part/end`、可取消 `StreamController`（`packages/utils/types/intelligence.ts:400-449,500-580`；`packages/utils/transport/types.ts:118-173`）；移动 BFF 应以 SSE 或 WebSocket 原样映射这些事件及取消。

Tuff transport 本体是 Electron IPC：读取 `electron.ipcRenderer.invoke`（`packages/utils/transport/sdk/renderer-transport.ts:131-142`），并以 `MessagePort` 流式传输（`packages/utils/transport/types.ts:87-148`）。移动端必须实现同形的 `send/stream` adapter 或直接消费 HTTP API；Provider 密钥留在 BFF，不能把 `IntelligenceProviderConfig.apiKey` 下发（`packages/utils/types/intelligence.ts:347-379`）。

## 原生路线与风险

Expo managed 足够覆盖 MVP 的网络、图片选择、SecureStore；迭代和双端发布成本最低。Expo prebuild 适用于推送、原生 SDK 或 config plugin，代价是维护生成的 iOS/Android 工程和 development build。RN CLI 只有在必须长期维护自定义 Kotlin/Swift/C++ 模块时才值得采用。桌面 `@talex-touch/tuff-native` 为 node-gyp/N-API/Rust、含 OCR/截图/音频/Everything（`packages/tuff-native/package.json:50-110`），以及 CoreApp 的 `node-pty`、`uiohook-napi`、`sharp`、`ffmpeg`，均不属于 MVP，不能迁移。
