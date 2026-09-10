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

- macOS 默认使用 Fn，Windows/Linux 保留 Ctrl（硬件 Fn 不保证向系统上报）；仅由独立 `voiceInput.enabled` 开关控制，不依赖 Assistant、浮球或旧唤醒词开关，默认关闭。
- 短按（小于 320ms）发送 `toggle` 意图，由录音状态决定开始/停止，不再把胶囊可见当作正在录音；错误/取消提示期间再次触发开始新录音，不重试旧音频。长按达到 320ms 开始 push-to-talk，释放发送 `stop`。
- macOS 使用现有 `native-audio` 内 HID 层主动 `CGEventTap`：只消费由单键 Fn 开始的按下/松开，保留组合键和 Esc 透传；HID 创建失败明确 unavailable，不静默退回 Session tap 或修改用户系统 Fn 偏好。Windows/Linux 由 OmniPanel 独占 `uiohook`。
- Fn 打开 VoiceDock 使用 `showInactive`，不抢当前应用焦点；stop 不重置录音，句柄未就绪时排队到达后结束。

## VoiceDock 极简 HUD 收敛

- VoiceDock 的 Electron 窗口保持透明、无阴影；紧凑 HUD 仅保留麦克风状态、语音波形和错误状态，输入框、截图来源选择、截图操作按钮、发送和关闭入口均不属于语音面板。
- 浮球不再启动唤醒词 ASR；Fn/Ctrl 手势和浮球点击调用同一录音入口。最终文本使用 `active-app` delivery，由 main-owned Voice Session 交付。
- 停止或流终态后，renderer 先显示有限时长的 processing ring，再结束临时 HUD；浮球原本关闭时继续隐藏。结束事件通过 typed `voice.closePanel` 同步主进程收缩窗口，避免 renderer 与 BrowserWindow 几何状态分叉。
- 出现/消失动画只作用于 VoiceDock renderer 内容，屏幕坐标仍由 main 根据浮球锚点所在显示器计算，避免多屏切换时自行改写全局坐标。
- 胶囊不因 blur、切换应用或失去焦点关闭。Esc 全局长按 600ms 由 main 计时，通过 typed `cancelHold` 发送蓄力/重置/取消；短按不取消。待挂载/等待配置时收到取消也不得延迟启动录音。

## Fn/Ctrl 单键安全边界

- 只有无其他按键参与的 tap/hold 才产生语音动作；其他键先按、后按或先松开都使本次手势失效。
- 已开始的 hold 遇到组合键或 native reset 只发送一次 stop；注册代次、UI 会话代次与待打开面板均隔离旧回调。

## 独立语音输入设置

- `voiceInput: { enabled, language }` 在主进程配置 hydration 时归一化。仅旧配置缺失整个字段时，从 `assistant.enabled && voiceWake.enabled` 和旧 language 一次迁移；显式 false 永不被旧值覆盖。
- 设置 → 智能提供独立“语音输入”和“显示语音输入浮球”；唤醒词只显示暂不可用说明，不提供伪可用开关。
- VoicePanel 等待 runtime config 后才启动，关闭语音输入阻断后续启动并收口当前 HUD。
- 本轮 5 个 focused 文件共 107 tests 通过，Node/Web typecheck 通过。隔离 Electron 设置页已检查中英文说明并操作开关，确认 Assistant/浮球关闭时独立语音输入可开启并持久化；不等同实体 Fn、麦克风与 Provider 端到端通过。

## 全局取消与重触发验证

- 更新后 5 个 focused 文件 154 tests 通过；Rust native-audio 46 tests 通过；Node/Web typecheck 与 CoreApp 修改范围 ESLint 通过；原生 release addon 构建与加载通过。
- 隔离真实 Electron + 合成 HID 输入：native 收到 Fn down/up 和 Esc down/up；独立 Session 下游观察到 Fn 0 条、Esc down/up 各 1 条。
- Finder 前台时，隔离胶囊保留；短 Esc 收到 start/reset 不取消，长 Esc 约 600ms 收到 start/commit 并显示“已取消”。错误胶囊再次注入 Fn 收到 toggle，进入新录音，无旧错误提示。
- 旧“丢弃事件”方案实体验收失败：4 组 Fn HID down/up、Session 下游 0 条，用户仍确认表情面板弹出。该结果说明仅靠下游事件观察不能证明 macOS 默认动作已停止。
- 当前修复：先向 Voice controller 投影 standalone Fn down/up，再把同一个事件清掉 `MaskSecondaryFn` 后原样放行；其余 flags 与组合键事件保持不变，任何 standalone Fn 分支都不得 `return null`。
- 09-09 `753f75df0` 曾把上面这条改回“从 OS event stream 移除事件”，实机随即恢复弹表情——这与第 119 行记录的失败结论是同一个方案，只是换了措辞。Rust 单测当时同步改成断言“丢弃”，所以全绿也没拦住。恢复 flag 中和后，单测改回断言转发 flags 不含 `MaskSecondaryFn`，并跑过负控制。
- native release build/load 与 Rust focused tests 必须绑定同一份 addon；ABI marker 继续阻止旧实现被误加载。

## ASR 现状与落地结论

- 实时识别由既有 Intelligence `audio.asr` 能力绑定选择渠道与模型，再使用 Rust/cpal → 百炼或豆包流式适配器 → 可选润色 → active-app delivery；不再用环境变量或泛化 snapshot ASR 作为隐式备用路由。
- 文件转写消费既有 `audio.stt` 能力绑定，由主进程原生文件选择、限额校验、读取与上传，结果只回显 UI，不写回其他应用。`audio.transcribe` 保留原语义，不冒充实时流。
- 两种能力共用已有渠道凭据库；ASR 公开协议参数位于该渠道的 `metadata.voiceAsr`，不再维护 `AppSetting.voiceRecognition` 或第二套路由编辑器。
- 选型不应把“FunASR”当成一个模型：中文/英文低延迟优先评估 Paraformer streaming；CPU 离线优先评估 SenseVoiceSmall；中文/英文/日文和口音覆盖可评估 Fun-ASR-Nano，但其 GPU/模型体量不适合作为所有桌面默认；Whisper/faster-whisper/whisper.cpp 作为多语言与 Apple Silicon/Windows 可移植 fallback。
- 推荐顺序：先抽象 `local` Provider adapter 和统一 16 kHz mono PCM/VAD contract；macOS 优先 whisper.cpp 或 faster-whisper sidecar 做可复现 baseline，再以独立 FunASR 服务验证中文实时质量；不要把 Python FunASR 直接塞进 Electron 主进程，也不要同时引入两套本地模型下载/生命周期。
- ASR 验收必须按真实短句集比较首字延迟、partial 稳定性、终字延迟、实时率、内存、CPU/GPU 占用、中文/英文混说 CER/WER、专名和数字、断网/取消；“能跑 CPU”不等于适合全局听写。

## 渠道与能力收敛（代码待联调）

- `audio.asr` 纳入现有能力注册、配置、模型选项和测试框架；复用 `resolveFirstIntelligenceProviderRoute`，不在 Voice 中重新实现模型和优先级算法。
- 语音设置仅提供 ASR/STT 只读状态、跳转现有渠道/能力页面和文件转写消费入口；渠道协议参数使用既有 saveProviderConfig 且保留原凭据。
- ASR 测试只测保存后的绑定，拒绝临时 provider/model override；generic invoke 拒绝实时 ASR，不误走文件 multipart。
- ASR 恢复固定原 adapter/model/language 重放 PCM，文件 STT 取消传到实际网络请求并拒绝迟到结果。
- 用户要求测试前联系、不得自行启动应用或服务。本次收敛之后仅做源码与契约静态检查，测试文件已同步，尚未运行测试、类型检查或构建，也未提交。

## Provider 首发决策（2026-09）

- 本地 FunASR、Whisper、whisper.cpp 和 faster-whisper 先归档，不进入本轮实现；保留为后续 `local` Provider 任务，不下载模型、不新增 Python sidecar、不改变当前桌面安装包。
- 首发选择阿里云百炼 `bailian-paraformer`：现有 WebSocket adapter 已覆盖 `run-task`、`task-started`、PCM duplex、`finish-task`、partial/final、`task-finished` 和取消；业务空间专属北京域名与 API Key 边界也已明确。
- 官方价格页当前显示 `paraformer-realtime-v2` 按输入秒计费，原价 `0.00024 元/秒`，北京地域每月自动发放 `36,000 秒（10 小时）`免费额度，有效期 1 个月；实际活动以百炼控制台为准，不在代码中硬编码额度。
- 当前 Provider 与模型以用户保存的能力绑定为准；不再以 `TUFF_VOICE_ASR_PROVIDER` 或百炼/豆包环境变量自动选路。历史开发联调方式不构成当前配置事实源。

## 百炼真实授权 smoke（一次性）

- 使用临时本地凭据对 `paraformer-realtime-v2` 执行了真实北京 WebSocket 连接；`task-started` 握手、PCM duplex、partial、final、结束事件均可收到，中文指定 `zh-CN` 与英文两条样本均完成。
- 真实调用未把 API Key 写入仓库、日志或任务文档；临时凭据和测试音频已清理。当前 smoke 证明 Provider 协议与鉴权可用，不等同于 macOS 麦克风、Accessibility 写回或生产质量矩阵验收。

## 本地音频构建与洞察执行

- C++ 安装/build/rebuild 使用 `node-gyp configure build`，不清空 Cargo addon 所在的 `build/Release`；开发包装器先 build/verify audio，再启动 Electron。
- Cargo addon 在临时路径签名后原子替换唯一 `build/Release/tuff_native_audio.node`；不从 `target/runtime` 回退加载旧版本。
- 洞察由 VoiceService 成功终态记账，SQLite 原子保存/清空；共享 Voice SDK `getInsights`/`clearInsights` 仅允许受信任宿主页面调用。UI `/voice-insights` 从侧栏进入。
- 洞察按本地日历处理连续天数、零时长和最近365天热力图；节省时间按每分钟40字的标注基线计算，不能声称测得用户真实打字速度。

## 最终回归证据（2026-09-07）

- CoreApp voice/assistant regression：10 个文件、199 tests passed；覆盖 Fn/Ctrl 手势、VoiceDock 开关与 stale close、VoiceService stop/cancel、pending partial、WebSocket/Provider 错误、空 final、VoicePanel 终态、Assistant deferred-open STOP；无 unhandled rejection。
- CoreApp Node/Web typecheck passed；`git diff --check` passed；sensitive-data inventory verification passed（15 entries，50 structural evidence references）。
- Rust `native-audio`：45 tests passed；release addon build、production verification 与 Electron headless load passed。
- macOS 原生 Fn probe：standalone Fn down/up 回调已收到；Fn+J 产生 `other-key-down`，J 的 keyDown/keyUp 仍到达下游，证明不吞组合键；单独 Fn 事件由 active CGEventTap 消费。Electron microphone probe 采集约 501ms、16kHz、mono、约16KB PCM。
- 真实百炼 `paraformer-realtime-v2` standalone stream：收到 4 个 partial、1 个 final、1 个 end；受控中文短句匹配成功。随后在隔离 Electron 预览中播放同一句，VoiceDock 录音→百炼→polish→TextEdit 写回成功；Accessibility readback 为 10 字且短语匹配，Voice insights SQLite 记录 1 个成功会话、9 个聚合字符、3627ms。
- 真实 VoiceDock 失败路径也已验证：未配置 Provider 时停止后显示“语音转写失败”并恢复浮球，不伪报成功；配置 Provider 后成功终态恢复浮球。
- 语音洞察真实 UI：刷新、分享摘要复制、报告展开、365 日热力图、取消清空、确认清空及清空后刷新均通过；数据库清空后 `session_count=0,total_characters=0`。系统输出音量经用户授权临时设为 10% 播放测试，完成后恢复原值 0。

## 仍未宣称的能力

- 尚未完成真实 TextEdit 以外的浏览器、VS Code、Terminal、飞书/Slack 矩阵；未验证的平台和应用不宣称 Typeless 级跨应用可靠性。
- 当前 real-App 结果证明受控 macOS + TextEdit + 百炼路径，不证明硬件 Fn、所有应用焦点语义、AutoPaste 权限或其他 Provider 的端到端质量。
