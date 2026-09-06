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

## Command VoiceDock 手势

- 在 macOS 使用 Command，在 Windows/Linux 使用 Ctrl 作为 primary modifier；继续沿用 `assistant.enabled`、`floatingBall.enabled`、`voiceWake.enabled` 作为全局手势总开关，避免默认常驻输入钩子。
- 短按（小于 320ms）在 `start` / `stop` 间切换持续聆听；长按达到 320ms 后进入 push-to-talk，释放时发送 `stop`。
- OmniPanel 继续独占 `uiohook` 生命周期，Voice 只注册 typed primary-modifier listener；VoiceDock 通过 typed `assistant:voice-panel:command` 事件控制 `VoicePanel`，不新增裸 IPC 或第二个录音实现。
- Command 打开 VoiceDock 时使用 `showInactive`，不抢当前应用焦点；Command stop 不重置已显示的 VoicePanel 文本。

## VoiceDock 极简 HUD 收敛

- VoiceDock 的 Electron 窗口保持透明、无阴影；紧凑 HUD 仅保留麦克风状态、语音波形和错误状态，输入框、截图来源选择、截图操作按钮、发送和关闭入口均不属于语音面板。
- 浮球不再启动唤醒词 ASR，也不显示唤醒词/等待语音文案；Command/Ctrl 手势是唯一语音输入控制。最终文本请求使用 `active-app` delivery，交付由 main-owned Voice Session 负责。
- 停止或流终态后，renderer 先显示有限时长的 processing ring，再回到浮球；结束事件通过 typed `voice.closePanel` 同步主进程收缩窗口，避免 renderer 与 BrowserWindow 几何状态分叉。
- 出现/消失动画只作用于 VoiceDock renderer 内容，屏幕坐标仍由 main 根据浮球锚点所在显示器计算，避免多屏切换时自行改写全局坐标。

## Command/Ctrl 单键安全边界

- 只有没有其他按键参与的 primary modifier tap/hold 才产生语音动作；Command/Ctrl 与 Shift、字母、数字或其他按键组合时不触发 toggle，也不保留 hold。
- OmniPanel 在 main 内跟踪按键参与状态：primary 按住期间收到其他键会通过 typed `onOtherKeyDown` 使待启动手势失效；若 hold 已启动则只发送一次 `stop` 收口。组合状态会贯穿到 primary `keyup`，避免其他键先释放后误判为单键。

## ASR 现状与落地结论

- 当前主链路仍是 Rust/cpal 采集 → main-owned Provider/`audio.stt` → 可选 `text.chat` polish → active-app delivery。可用 Provider 是豆包、百炼 Paraformer；未配置时退回泛化 Whisper-compatible WebSocket，再退回定时 WAV snapshot 重识别。
- 现有 Provider 契约已经有 `stream`/`upload`、partial/final/end、取消和请求边界，但没有本地 FunASR/Whisper runtime；`TUFF_VOICE_ASR_WS_URL` 仍是外部兼容旁路，不是本地模型产品入口。
- Rust capture 默认使用设备采样率，而 Provider stream request 固定声明 16 kHz；`drainCapture` 返回的实际 sample rate 当前没有在发送前重采样，部署本地或云端 ASR 前必须先补采样率归一化，否则 48 kHz 设备可能按 16 kHz 解释 PCM，导致速度、音高与识别率异常。
- 选型不应把“FunASR”当成一个模型：中文/英文低延迟优先评估 Paraformer streaming；CPU 离线优先评估 SenseVoiceSmall；中文/英文/日文和口音覆盖可评估 Fun-ASR-Nano，但其 GPU/模型体量不适合作为所有桌面默认；Whisper/faster-whisper/whisper.cpp 作为多语言与 Apple Silicon/Windows 可移植 fallback。
- 推荐顺序：先抽象 `local` Provider adapter 和统一 16 kHz mono PCM/VAD contract；macOS 优先 whisper.cpp 或 faster-whisper sidecar 做可复现 baseline，再以独立 FunASR 服务验证中文实时质量；不要把 Python FunASR 直接塞进 Electron 主进程，也不要同时引入两套本地模型下载/生命周期。
- ASR 验收必须按真实短句集比较首字延迟、partial 稳定性、终字延迟、实时率、内存、CPU/GPU 占用、中文/英文混说 CER/WER、专名和数字、断网/取消；“能跑 CPU”不等于适合全局听写。
