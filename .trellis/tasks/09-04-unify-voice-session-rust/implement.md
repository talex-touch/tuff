# 执行计划：统一 Voice Session 与 Rust Voice Core

## 顺序

1. 更新 shared Voice domain types，定义 session phase/event/error、caller 和终态语义；先搜索并迁移所有公开调用方。
2. 实现 main-owned `VoiceSessionService`，集中 native capture、STT、polish、partial/final、AbortSignal、owner-bound cleanup；让既有 `VoiceService` 入口调用它。
3. 接入 active-app target snapshot 与统一 delivery，整合 Rust typeText 和现有 clipboard AutoPaste，补稳定失败/恢复结果。
4. 改造 GlobalDictationController：快捷键只控制 Voice Session，不再操作 native session id 或自行注入。
5. 改造 VoicePanel：删除生产级 MediaRecorder/SpeechRecognition 录音旁路，改用共享 Voice SDK stream；保留面板文本编辑、截图与 CoreBox submit。
6. 改造 touch-dictation 与 plugin voice host facade：继续保留权限、caller、stream resource 生命周期，但所有听写结果从 Voice Session owner 产生。
7. 将 capture/VAD/PCM session 控制和注入 API 的可变状态继续收敛到现有 Rust `native-audio`；同步 JS wrapper、声明、release build/verify。
8. 更新 focused tests、plugin isolation tests、manifest/runtime contract 和必要的本地化/隐私投影。

## 重点验证

- `pnpm -C "apps/core-app" exec vitest run src/main/modules/voice/voice-service.test.ts src/main/modules/voice/global-dictation.test.ts`
- 相关 Assistant、plugin host voice tests。
- `pnpm -C "apps/core-app" run typecheck:node`
- `pnpm -C "apps/core-app" run typecheck:web`
- `cargo test --manifest-path "packages/tuff-native/native-audio/Cargo.toml"`
- `pnpm -C "packages/tuff-native" run build:audio`
- `pnpm -C "packages/tuff-native" run verify:audio-production`
- `pnpm plugins:validate`
- `git diff --check`
- macOS packaged/runtime smoke：TextEdit、浏览器、VS Code、Terminal、飞书/Slack；覆盖正常写回、空语音、取消、权限拒绝、目标切换、clipboard 恢复、模块销毁。

## 风险文件

- `apps/core-app/src/main/modules/voice/voice-service.ts`
- `apps/core-app/src/main/modules/voice/global-dictation.ts`
- `apps/core-app/src/main/modules/voice/voice-module.ts`
- `apps/core-app/src/renderer/src/views/assistant/VoicePanel.vue`
- `apps/core-app/src/main/modules/plugin/host/plugin-voice-capabilities.ts`
- `apps/core-app/src/main/modules/plugin/plugin-module.ts`
- `packages/utils/transport/sdk/domains/voice.ts`
- `packages/utils/plugin/sdk/voice.ts`
- `plugins/touch-dictation/index.js`
- `packages/tuff-native/audio.js`
- `packages/tuff-native/audio.d.ts`
- `packages/tuff-native/native-audio/src/lib.rs`

## 回滚点

- shared DTO 与 host capability 迁移后，若插件隔离测试发现生命周期不一致，保留 capability id 不变，回退到共享 service 的单一路由，不恢复 renderer/browser capture。
- native API 扩展若破坏三平台构建，回退新增 Rust export，保留现有 capture/VAD/typeText，VoiceSessionService 继续通过已有窄 wrapper 工作。
- UI 迁移若无法完成 packaged smoke，不开启新的默认入口，维持明确 disabled/degraded 状态并记录阻塞证据。

## 当前验证结果

- Voice/Assistant/plugin/clipboard focused tests：120 tests passed。
- Shared Voice SDK tests：7 tests passed。
- CoreApp Web/Node typecheck passed；Node 严格检查依赖 CoreApp 自有 `@types/plist` 声明与 lockfile importer。
- Rust `native-audio` tests：38 tests passed；release addon build 与 headless load verification passed。
- Plugin manifest validation：29/29 plugins passed；Electron plugin-host isolation smoke passed。

## 仍需发布前手工门禁

- Node `typeText` 实机探针返回 `accessibility-required`；系统级 `osascript` AutoPaste 返回 Automation 错误 `1002`。TextEdit 目标已启动，但当前调用进程/自动化发送方仍未取得对应 macOS 权限，因此真实写回矩阵保持阻塞。
- 尚未在真实 TextEdit、浏览器、VS Code、Terminal、飞书/Slack 中执行一次带真实 Provider 的语音生成→写回矩阵；当前证据覆盖 native addon、模拟 delivery、插件隔离和组件行为，不能替代该手工验收。

## Provider 兼容执行顺序

9. 在 `packages/tuff-voice` 建立 Provider-neutral contract、事件归一化和 fake transport，不触碰 renderer。
10. 根据官方协议实现豆包双向流式与录音文件 adapter，覆盖 API Key/Resource ID、sequence、终态和 upload task。
11. 根据百炼具体模型族实现 stream 与 upload adapter；先接入用户提供或官方可验证的模型，不把 Paraformer、Qwen-ASR、Fun-ASR 混成一个协议。
12. CoreApp main 注册 package adapters，替换 `TUFF_VOICE_ASR_WS_URL` 泛化生产旁路，并新增 main-owned upload handle。
13. 运行 package protocol tests、CoreApp Voice tests、类型检查和双 Provider 的真实授权验收。

## Provider 开发配置

当前 CoreApp 仅在 main 进程读取显式开发环境变量，不持久化或打印凭据：

- 豆包：`TUFF_VOICE_DOUBAO_API_KEY` + `TUFF_VOICE_DOUBAO_RESOURCE_ID`，或旧版 `TUFF_VOICE_DOUBAO_APP_KEY` + `TUFF_VOICE_DOUBAO_ACCESS_KEY`；
- 百炼 Paraformer：`TUFF_VOICE_BAILIAN_API_KEY` + `TUFF_VOICE_BAILIAN_WORKSPACE_ID`；
- 默认流式 Provider 可由 `TUFF_VOICE_ASR_PROVIDER` 指定为 `doubao` 或 `bailian-paraformer`；
- 豆包上传模式可用 `TUFF_VOICE_DOUBAO_UPLOAD_VARIANT=fast|standard|idle` 选择，默认 `fast`。

这些环境变量是开发联调入口，不替代后续 Settings/secure-store 的 Provider credential lifecycle；未配置时保留现有 `audio.stt`/泛化 WebSocket 兼容路径。

## VoiceDock UI 执行顺序

14. 将 Assistant 的浮球入口、底部 HUD 与 VoicePanel 收敛到一个按需创建的 `voice-dock` BrowserWindow；CoreBox、Settings、Screenshot 保持现有窗口 owner。
15. 扩展 renderer window-role/app entrance 映射，保持旧 Assistant transport event 名称兼容但移除第二个 VoicePanel renderer 创建路径。
16. 在 VoiceDock 内保留 VoicePanel 的编辑、截图与提交职责，新增 compact/listening/transcribing/committed/error surface；Canvas confetti 仅响应成功终态并有 TTL、reduced-motion 与清理边界。
17. 运行 Assistant module contract、VoicePanel/VoiceDock focused tests、CoreApp Web/Node typecheck 和真实桌面窗口 smoke；确认隐藏 VoiceDock 没有持续 RAF 或第二个 Assistant renderer。
