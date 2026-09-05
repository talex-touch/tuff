# 统一 Voice Session 与 Rust Voice Core

## 目标

把当前三条语音输入路径收敛为一个主链路：全局听写快捷键、Assistant VoicePanel、`touch-dictation` 插件都必须复用同一个 Voice Session 主控与共享 SDK。后续“阿洛”快捷调用及其他插件不得自行实现录音、浏览器识别、转写轮询或粘贴逻辑。

用户可观察结果是：在任意受支持的当前应用中触发语音，会得到统一的录音/识别/润色/写回行为；失败、取消、权限不足和目标丢失均有稳定状态与可操作恢复路径。

## 已确认事实

- `VoiceService` 已把 native `cpal` 采集、`audio.stt`、可选 `text.chat` polish、`enigo`/clipboard 写回和 batch/WebSocket 流式拼在一起，但全局控制器、VoicePanel、插件仍各自拥有不同的会话入口。
- `global-dictation.ts` 通过 `CommandOrControl+Shift+U` 二按控制 native capture，默认快捷键 disabled，只发送系统通知。
- `VoicePanel.vue` 仍直接使用浏览器 `SpeechRecognition` / `MediaRecorder`，将结果放入自身 textarea，再通过 Assistant 事件提交 CoreBox。
- `touch-dictation` 已经通过权限隔离的 `voice.invoke` / `voice.stream` 访问宿主，但最终仍在插件内做 clipboard 写回。
- `packages/tuff-native/native-audio` 已拥有 Rust/cpal 会话、VAD 静音停止、PCM drain/snapshot、TTS 播放和 Unicode 文本注入能力。
- 插件、renderer 不得接触 native addon、原始音频 Buffer 或宿主私有路径；敏感语音内容只能留在 main-owned pipeline。

## 必须满足的需求

1. 建立唯一的 `VoiceSession` 契约与主进程 owner，统一管理 start、partial、stop、final、cancel、error、teardown 状态。
2. `voice.dictate`、`voice.asrStream` 和全局听写均由 Voice Session 主控实现；不得保留第二套录音/转写流程。
3. VoicePanel 去除生产路径上的 `MediaRecorder` 和 `SpeechRecognition`，改为共享 Voice Session SDK；文本编辑、截图和发送 CoreBox 仍保留为面板职责。
4. `touch-dictation` 只调用共享 Voice Session SDK；插件不得自行决定宿主焦点、绕过权限或复制另一套粘贴实现。
5. 共享 SDK 保留文本听写、流式事件和朗读能力，并为未来阿洛/其他插件提供稳定的 caller、取消、超时和资源释放语义。
6. 听写写回前必须保存目标应用快照；注入优先走 Rust native text injection，失败时通过 main-owned clipboard/autopaste 回退，并保证原剪贴板可恢复、失败原因稳定。
7. Rust 负责低层实时能力：采集会话、VAD、PCM snapshot/drain、平台文本注入和音频播放。Provider 选择、网络 STT、AI polish、权限与 clipboard policy 继续由 main 负责，避免把业务/密钥/网络协议塞进 addon。
8. Rust/native 与 main、main 与 renderer/plugin 的边界只传有界控制数据；原始音频只在 main 内部进入 STT，不能进入 renderer、插件或普通持久化。
9. Voice module、插件 capability、快捷键、Assistant UI 和 destroy 流程必须具备 owner-bound cancellation，不能留下 native session、timer、stream callback 或过期插件资源。

## 验收标准

- [ ] 三个入口的录音、partial、final、polish、写回和错误状态都经过同一 Voice Session owner；代码中不存在生产级浏览器录音旁路。
- [ ] 全局快捷键与 VoicePanel 取消/重复触发/模块销毁不会交叉取消另一个 caller 的 session。
- [ ] plugin SDK、host capability、main service 的请求和事件 DTO 经过共享类型与运行时校验；旧 `dictate`/`asrStream` 消费者行为保持可用。
- [ ] 外部应用目标快照、Rust 注入、clipboard/autopaste 回退和恢复路径有 focused tests；权限不足、目标丢失、空文本、provider 失败均 fail-closed。
- [ ] native-audio Rust 单元测试、JS wrapper contract、CoreApp Node/Web typecheck、voice/plugin focused tests 通过。
- [ ] `native-audio` release addon 可构建并通过 `verify:audio-production`；生产包不依赖 renderer/plugin 直接加载 addon。
- [ ] 至少完成 macOS TextEdit、浏览器、VS Code、Terminal、飞书/Slack 的真实跨应用听写 smoke；未验证的平台不宣称 Typeless 级支持。

## 非目标

- 本轮不实现 local Whisper、本地模型下载、100+ 语言、实时翻译、跨设备同步、复杂个人词典或完整移动端适配。
- TTS 继续由共享 Voice SDK 提供，但不与听写 session 强行合并为同一个 capture 状态机。
- 不通过扩大 preload、裸 IPC、万能插件 capability 或 Rust 内置网络请求解决跨层问题。
