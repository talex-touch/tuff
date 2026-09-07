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

## Fn VoiceDock 手势

- macOS 默认使用 Fn，Windows/Linux 保留 Ctrl（硬件 Fn 不保证向系统上报）；继续沿用 `assistant.enabled`、`floatingBall.enabled`、`voiceWake.enabled` 总开关，不默认常驻输入拦截。
- 短按（小于 320ms）在 `start` / `stop` 间切换持续聆听；长按达到 320ms 后进入 push-to-talk，释放时发送 `stop`。
- macOS 使用现有 `native-audio` 内的主动 `CGEventTap`：只消费由单键 Fn 开始的按下/松开，保留组合键事件；Windows/Linux 由 OmniPanel 独占 `uiohook`。VoiceDock 仍通过 typed `assistant:voice-panel:command` 控制，不增加裸 IPC 或第二套录音。
- Fn 打开 VoiceDock 使用 `showInactive`，不抢当前应用焦点；stop 不重置录音，句柄未就绪时排队到达后结束。

## VoiceDock 极简 HUD 收敛

- VoiceDock 的 Electron 窗口保持透明、无阴影；紧凑 HUD 仅保留麦克风状态、语音波形和错误状态，输入框、截图来源选择、截图操作按钮、发送和关闭入口均不属于语音面板。
- 浮球不再启动唤醒词 ASR；Fn/Ctrl 手势和浮球点击调用同一录音入口。最终文本使用 `active-app` delivery，由 main-owned Voice Session 交付。
- 停止或流终态后，renderer 先显示有限时长的 processing ring，再回到浮球；结束事件通过 typed `voice.closePanel` 同步主进程收缩窗口，避免 renderer 与 BrowserWindow 几何状态分叉。
- 出现/消失动画只作用于 VoiceDock renderer 内容，屏幕坐标仍由 main 根据浮球锚点所在显示器计算，避免多屏切换时自行改写全局坐标。

## Fn/Ctrl 单键安全边界

- 只有无其他按键参与的 tap/hold 才产生语音动作；其他键先按、后按或先松开都使本次手势失效。
- 已开始的 hold 遇到组合键或 native reset 只发送一次 stop；注册代次、UI 会话代次与待打开面板均隔离旧回调。

## ASR 现状与落地结论

- 当前主链路仍是 Rust/cpal 采集 → main-owned Provider/`audio.stt` → 可选 `text.chat` polish → active-app delivery。可用 Provider 是豆包、百炼 Paraformer；未配置时退回泛化 Whisper-compatible WebSocket，再退回定时 WAV snapshot 重识别。
- 现有 Provider 契约已经有 `stream`/`upload`、partial/final/end、取消和请求边界，但没有本地 FunASR/Whisper runtime；`TUFF_VOICE_ASR_WS_URL` 仍是外部兼容旁路，不是本地模型产品入口。
- VoiceService canonical sessions now request 16 kHz capture for Provider/one-shot paths; the generic WebSocket path requests its configured 8/16 kHz rate. Native capture failure remains explicit rather than silently sending a mismatched device-rate PCM stream.
- 选型不应把“FunASR”当成一个模型：中文/英文低延迟优先评估 Paraformer streaming；CPU 离线优先评估 SenseVoiceSmall；中文/英文/日文和口音覆盖可评估 Fun-ASR-Nano，但其 GPU/模型体量不适合作为所有桌面默认；Whisper/faster-whisper/whisper.cpp 作为多语言与 Apple Silicon/Windows 可移植 fallback。
- 推荐顺序：先抽象 `local` Provider adapter 和统一 16 kHz mono PCM/VAD contract；macOS 优先 whisper.cpp 或 faster-whisper sidecar 做可复现 baseline，再以独立 FunASR 服务验证中文实时质量；不要把 Python FunASR 直接塞进 Electron 主进程，也不要同时引入两套本地模型下载/生命周期。
- ASR 验收必须按真实短句集比较首字延迟、partial 稳定性、终字延迟、实时率、内存、CPU/GPU 占用、中文/英文混说 CER/WER、专名和数字、断网/取消；“能跑 CPU”不等于适合全局听写。

## Provider 首发决策（2026-09）

- 本地 FunASR、Whisper、whisper.cpp 和 faster-whisper 先归档，不进入本轮实现；保留为后续 `local` Provider 任务，不下载模型、不新增 Python sidecar、不改变当前桌面安装包。
- 首发选择阿里云百炼 `bailian-paraformer`：现有 WebSocket adapter 已覆盖 `run-task`、`task-started`、PCM duplex、`finish-task`、partial/final、`task-finished` 和取消；业务空间专属北京域名与 API Key 边界也已明确。
- 官方价格页当前显示 `paraformer-realtime-v2` 按输入秒计费，原价 `0.00024 元/秒`，北京地域每月自动发放 `36,000 秒（10 小时）`免费额度，有效期 1 个月；实际活动以百炼控制台为准，不在代码中硬编码额度。
- 无显式 `TUFF_VOICE_ASR_PROVIDER` 时，若百炼和豆包同时配置，runtime 优先百炼；仅豆包配置时自动使用豆包；显式选择未配置 Provider 必须 fail-closed。豆包保留为下一阶段的显式/备用 Provider。

## 百炼真实授权 smoke（一次性）

- 使用临时本地凭据对 `paraformer-realtime-v2` 执行了真实北京 WebSocket 连接；`task-started` 握手、PCM duplex、partial、final、结束事件均可收到，中文指定 `zh-CN` 与英文两条样本均完成。
- 真实调用未把 API Key 写入仓库、日志或任务文档；临时凭据和测试音频已清理。当前 smoke 证明 Provider 协议与鉴权可用，不等同于 macOS 麦克风、Accessibility 写回或生产质量矩阵验收。

## 本地音频构建与洞察执行

- C++ 安装/build/rebuild 使用 `node-gyp configure build`，不清空 Cargo addon 所在的 `build/Release`；开发包装器先 build/verify audio，再启动 Electron。
- Cargo addon 在临时路径签名后原子替换唯一 `build/Release/tuff_native_audio.node`；不从 `target/runtime` 回退加载旧版本。
- 洞察由 VoiceService 成功终态记账，SQLite 原子保存/清空；共享 Voice SDK `getInsights`/`clearInsights` 仅允许受信任宿主页面调用。UI `/voice-insights` 从侧栏进入。
- 洞察按本地日历处理连续天数、零时长和最近365天热力图；节省时间按每分钟40字的标注基线计算，不能声称测得用户真实打字速度。
