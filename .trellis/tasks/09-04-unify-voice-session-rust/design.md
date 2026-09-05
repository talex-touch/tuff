# 技术设计：统一 Voice Session 与 Rust Voice Core

## 1. 目标架构

```text
Global shortcut ─┐
VoicePanel ──────┼─> shared Voice Session SDK ─> VoiceSessionService (main)
阿洛 / plugins ──┘                                  │
                                                     ├─ Rust native-audio
                                                     │  capture / VAD / PCM / type text
                                                     ├─ main-owned Provider routing
                                                     │  audio.stt / text.chat polish
                                                     ├─ active-target snapshot
                                                     │  app/window/selection + owner token
                                                     └─ main-owned delivery
                                                        native injection -> safe autopaste
```

`VoiceSessionService` 是唯一会话 owner。现有 `VoiceService` 的公开域方法不再分别实现业务流程，而是作为同一 owner 上的 `dictate`、`asrStream`、toggle-session 入口。TTS 保留在 Voice domain，但只复用 Rust playback，不进入 dictation 状态机。

## 2. 所有权边界

### Rust `native-audio`

Rust 负责不含业务语义的实时与平台能力：

- 建立/结束/取消 capture session；
- cpal 输入线程与有界 PCM 缓冲；
- speech threshold、trailing silence、max duration；
- snapshot/drain 的增量读取；
- macOS/Windows/Linux 支持探测；
- `enigo` 文本注入与 Accessibility 状态；
- TTS 音频解码/播放。

Rust 不负责 provider URL、API key、AI prompt、插件身份、Electron clipboard、窗口目标策略或持久化。

### Electron main

Main 负责：

- session owner、caller identity、AbortSignal、超时和 destroy drain；
- active application/selection target snapshot；
- Provider routing、STT、polish 与稳定错误码；
- native injection 结果解释；
- clipboard snapshot、autopaste 与恢复；
- plugin permission/capability 与 renderer transport；
- HUD/notification 状态投影。

### Renderer / Plugin

只消费共享 Voice Session SDK：

- renderer 负责 VoicePanel 的编辑、展示和取消；
- plugin 负责 feature item 与用户动作；
- caller 不能传绝对路径、native session 内部状态、原始音频 Buffer 或自定义注入目标；
- 插件的 `voice.dictation` 权限和 verified activation 继续由 host gate 控制。

## 3. 会话契约

共享 Voice domain 增加统一 session DTO，所有事件带 session id，终态单次发布：

```ts
type VoiceSessionPhase =
  | 'recording'
  | 'transcribing'
  | 'polishing'
  | 'injecting'
  | 'completed'
  | 'cancelled'
  | 'failed'

type VoiceSessionEvent =
  | { type: 'started'; sessionId: string }
  | { type: 'partial'; sessionId: string; text: string }
  | { type: 'phase'; sessionId: string; phase: Exclude<VoiceSessionPhase, 'recording'> }
  | { type: 'final'; sessionId: string; text: string; raw: string; language?: string }
  | { type: 'end'; sessionId: string; result?: VoiceDictateResult }
  | { type: 'error'; sessionId: string; code: VoiceSessionErrorCode }
```

公开 transport 仍使用 typed event/domain SDK；流式 handler 只发送结构化控制事件，原始 PCM 和 WAV 不跨 transport。全局快捷键的 start/stop 使用 main-local session handle，renderer/plugin 的自动终止路径使用同一 service 的 stream facade。若实现需要跨 transport 的可控 toggle，则使用 host-issued opaque session id，禁止让 caller 选择 native id。

## 4. 目标与写回

session start 时由 main 采集当前目标的最小不敏感快照：平台、支持级别、目标 token/版本，不向 renderer/plugin 回传窗口标题、路径或 native handle。完成时：

1. 校验 session owner 和目标 token 仍有效；
2. 先尝试 Rust `typeText`；
3. 失败或 Accessibility 不足时调用 main-owned AutoPaste；
4. AutoPaste 前保存 clipboard snapshot，成功后按现有策略恢复；
5. 目标失效或恢复失败时不伪报成功，返回稳定 degraded reason，并把文本留在 main-owned result/用户可控复制动作中。

Selection capture 继续沿用现有 main selection service，不能把剪贴板探针和 voice delivery 混在 Rust addon 里。

## 5. 迁移策略

1. 先把当前 native start/stop/poll/snapshot/drain 包在一个 `VoiceSessionService` 内，建立状态与 owner；不先重写 provider。
2. 把 VoicePanel 的浏览器录音分支改为共享 SDK stream；其 textarea 只保留编辑/提交职责。
3. 把 GlobalDictationController 改为 session start/stop/cancel + target snapshot，不再直接调用 nativeAudio。
4. 把 touch-dictation 的 `dictate`/stream 行为全部路由到 session facade；delivery 由 host service 统一处理，插件只消费稳定结果。
5. 再将可安全下沉的 session/VAD/PCM 控制继续收敛到 Rust；所有 JS wrapper 保持窄、类型明确且 fail-closed。
6. 最后清理浏览器录音旁路、重复注入逻辑和失效注释，并更新 focused tests/manifest/runtime evidence。

## 6. 风险与回滚

- Native addon 是跨平台构建边界；先扩展现有 `native-audio`，不新建第二个 `.node`。
- AI/STT 仍可能超时；session 必须在 main 侧用 AbortSignal 和稳定终态收口，不能让 Rust 等待网络。
- AutoPaste 的系统权限与焦点行为不能仅靠单测证明；macOS 实机矩阵是发布前置条件。
- 若新 stream/session DTO 未能保持现有插件 host resource 生命周期，可先让现有 `voice.invoke`/`voice.stream` 调用共享 service，再扩展跨 transport toggle，不允许恢复第二套录音实现。
