# Research: 输入框麦克风接上听写（D10）——现有语音 API、状态，以及交互与最小接线

- **Query**: 渲染层今天能调用的语音 / ASR 接口（`packages/utils/transport/sdk/domains/voice.ts` 的 `VoiceSdk.asrStream` 等、主进程 `voice-module` / `voice-service` / `speech-model-service`）及其状态（权限、模型下载、电平、partial / final、错误、取消）；哪些文件正被另一个会话改动、组件只该依赖哪一层；给出麦克风交互（点按还是按住、partial 怎么预览、final 怎么落进草稿、电平怎么画、回复流式时怎么办、错误与权限、减少动态效果）和最小接线。
- **Scope**: internal（只读；语音相关文件有另一会话在改，按当前工作区读，并对照 HEAD 标出变动）
- **Date**: 2026-09-26

## 0. 结论

1. 组件只需要三个方法，**三者在 HEAD 就在、形状在工作区里没有变**：`createVoiceSdk(useTuffTransport())` 的 `asrStream(payload, { onData, onError, onEnd })`（返回带 `stop()` / `cancel()` 的 `StreamController`）、`getRecognitionStatus()`、`openMicrophoneSettings()`。`VoicePanel.vue`（VoiceDock HUD）是现成的完整用法。
2. 请求取值：`{ delivery: 'none', emitLevel: true, cleanup: true, deliveryTiming: 'live', language: voiceInput.language }`——文字只回到本窗口、带电平帧；服务端去口水词（`enableDdc`）照开，**不跑 AI 整理**（`live` 时主进程跳过 polish），停止后不会再有一次「整理中」的改写。
3. 交互：**点按切换**（再点结束）；听写期间输入框 `readonly`，partial 直接写在光标处（整段替换上一版 partial），final 固化；Esc 取消并还原草稿；电平是麦克风圆里的 4 根竖条（`transform: scaleY`，不引起布局）；听写期间发送键不可用；回复一开始流式就**优雅结束**听写、文字留在草稿、麦克风把位置让给「■ 停止」胶囊（D1）。
4. 错误全部落成 toast（带动作按钮）：没授权 → 「打开麦克风设置」；没配识别 → 「去设置」；2 秒内既无 `ready` 也无电平帧 → 「麦克风没有响应」；识别为空 → 还原草稿。**不提供重试 / 撤销**（主进程的恢复槽是全局单槽、不认会话，会动到 HUD 的录音）。
5. 需要老板定的主要一点：麦克风受不受「语音输入」总开关 `voiceInput.enabled`（默认关）管。推荐**不受**（它管的是全局 Fn 手势与 HUD；输入框里的按钮本身就是明确的同意），见 §5。

## 1. Files Found

| File Path | Description |
|---|---|
| `packages/utils/transport/sdk/domains/voice.ts` | Voice SDK：`VoiceAsrStreamPayload`（`:236-257`）、`VoiceAsrStreamEvent`（`:349-378`）、`VoiceRecognitionStatus`（`:328-340`）、事件定义（`:448-555`）、`createVoiceSdk()`（`:608-701`；`asrStream` `:694-699`） |
| `packages/utils/transport/types.ts` | `StreamController`：`cancel()`（`:177`）、可选 `stop()`（`:179-189`，「停止采集但正常收尾」）；`StreamOptions`（`:129-150`） |
| `apps/core-app/src/main/modules/voice/voice-module.ts` | `voice:api:asr-stream` 处理器（`:407-431`）：`withPermission({ permissionId: 'voice.dictation' })` → `voiceService.streamDictation(payload, signal, { stopSignal })`；`getRecognitionStatus`（`:162-177`，插件不可调） |
| `apps/core-app/src/main/modules/voice/voice-service.ts` | `streamDictation()`（`:1411-1432`）→ `streamViaProvider()`：默认 `maxDurationMs` 300 000、`silenceStopMs` 1 500（`:214-215`、`:1472-1473`）；`cleanup` / `enableDdc` 的判定（`:1474`、`:1505`）；先 `ready` 后握手（`:1539`）；`level` / `partial` / `final` / `end` 的产出（`:1731-1815`） |
| `apps/core-app/src/main/modules/voice/voice-provider-runtime.ts` | `getRecognitionStatus()`（`:394-414`）与原因码（`capabilityStatus` `:185-211`、`recognitionFailure` `:348-356`）；`getConfiguredAsrProvider()`（`:417-`） |
| `apps/core-app/src/main/modules/voice/speech-model-service.ts` | 端侧模型目录 / 安装 / 进度（设置页用；输入框不碰） |
| `apps/core-app/src/main/modules/voice/global-dictation.ts` | 全局 ⌘⇧U 听写与 Quick Edit 共用一个控制器以保证「一次一个会话」（`:31-37` 注释）——只管这两个手势 |
| `packages/tuff-native/native-audio/src/lib.rs` | 静音自动停：`has_speech && elapsed - last_sound >= silence_stop_ms`（`:1262-1264`）；会话表是 `HashMap`（`:907-910`），原生层不限制并发采集 |
| `packages/tuff-voice/src/contracts.ts` / `providers/bailian-paraformer.ts` / `protocol/doubao.ts` | `enableDdc` = 服务端去口水词（`disfluency_removal_enabled` / `enable_ddc`） |
| `apps/core-app/src/renderer/src/views/assistant/VoicePanel.vue` | 现成用法：发起（`startVoiceSession` `:1190-1273`）、事件处理（`:1128-1168`）、停止（`finishVoiceInput` `:1075-1097`，只 `stop()`）、取消（`:1050-1066`）、错误分类（`classifyFailure` `:893-955`）、电平归一（`normalizeLevel` `:796-805`，常量 `:214-223`）、partial 合并（`appendTranscriptText` `:957-975`，`updateLiveTranscript` / `commitLiveTranscript` `:977-989`）、2 秒无电平看门狗（`CAPTURE_START_TIMEOUT_MS` `:58`、`:1219-1240`） |
| `apps/core-app/src/renderer/src/views/base/settings/VoiceRecognitionStatus.vue` | `getRecognitionStatus()` 的原因码 → 文案映射与「去设置」路由 `/setting/intelligence/capabilities`（`:40-94`） |
| `apps/core-app/src/renderer/src/views/base/settings/SettingSpeechRecognition.vue` | 「语音输入」总开关 `voiceInput.enabled`（`:42-48`）等偏好 |
| `packages/utils/common/storage/entity/app-settings.ts` | `voiceInput: { enabled: false, language: 'zh', polishEnabled, polishStrength, noiseSuppression, source }`（`:241-262`） |
| `apps/core-app/src/renderer/src/views/base/home/HomePage.vue` | 今天的麦克风：`<button class="HomePage-RoundBtn borderless" :aria-label="t('home.voice')">`，**没有 `@click`**（WT 13:3x `:1555-1561`） |
| `apps/core-app/src/renderer/src/composables/store/usePluginUpdates.ts` | 带动作按钮的 toast 先例（`toast.info(msg, { action: { label, onClick } })`，`:35-46`） |
| `.trellis/spec/main-process/voice-session-contracts.md` | 会话所有权、停止 vs 取消、`voiceInput.enabled` 的管辖范围、设备提示非终态（工作区有改动） |

## 2. 渲染层能调用的语音接口（只列输入框需要的）

### 2.1 入口

```ts
import { useTuffTransport } from '@talex-touch/utils/transport'
import { createVoiceSdk } from '@talex-touch/utils/transport/sdk/domains/voice'
const voice = createVoiceSdk(useTuffTransport())   // VoicePanel.vue:430、VoiceRecognitionStatus.vue:26 同样写法
```

主窗口的 transport 支持流（Home 的对话就是 `sdk.stream`）；宿主渲染进程调 `asr-stream` 走 `voice.dictation` 权限门，VoiceDock 已经在用。

### 2.2 `asrStream` 请求字段与输入框的取值

| 字段（`voice.ts:236-257`） | 含义 | 输入框取值 | 理由 |
|---|---|---|---|
| `delivery` | `'none'` 只回文字；`'active-app'` 由主进程敲进前台应用 | `'none'` | 文字进自己的草稿，不走主进程的注入 / 自动粘贴 |
| `emitLevel` | 开启 `level` 帧（rms 0..1，约 10Hz） | `true` | 电平反馈 + 看门狗 |
| `cleanup` | 默认 `true`；同时决定服务端去口水词 `enableDdc = cleanup ?? true`（`voice-service.ts:1505`） | `true` | 保留服务端去「嗯 / 啊」 |
| `deliveryTiming` | `'live'` 时主进程**跳过 AI 整理**：`cleanup = payload.cleanup !== false && deliveryTiming !== 'live'`（`:1474`）；实时投递器只在 `delivery === 'active-app'` 时存在（`:1640-1642` 一带） | `'live'` | 不再多一次 `text.chat` 调用、停止后没有改写；草稿本来就要发给模型 |
| `language` | BCP-47 提示 | `appSetting.voiceInput.language` | 与其它听写入口一致 |
| `maxDurationMs` / `silenceStopMs` | 默认 300 000 / 1 500 | 不传（见 §5 D10-e） | 与 HUD 一致；静音自动停只在**说过话之后**计时（`lib.rs:1262-1264`） |
| `polishStrength` / `noiseSuppression` / `providerId` | 覆盖偏好 / 指定提供方 | 不传 | 走用户设置与「智能」页绑定 |

### 2.3 事件与语义（`VoiceAsrStreamEvent`，`voice.ts:349-378`；产出顺序见 `voice-service.ts:1539-1815`）

| 事件 | 何时 | 输入框怎么用 |
|---|---|---|
| `ready` | 原生采集已打开（**在**提供方握手完成之前） | `starting → listening`；停掉「准备中」的呼吸 |
| `device { name }` | 本次用的输入设备与上次不同（仅一次） | 可选：`aria-live` 念一句「正在使用 …」；**不是**终态 |
| `level { rms }` | 约 10Hz（需 `emitLevel`） | 归一后推进电平条；首帧喂看门狗 |
| `partial { text }` | 识别中间结果（已 `trim`，空的不发，`:1745-1755`） | 预览：替换上一版 partial |
| `final { text, language? }` | 一句 / 一段定稿；**一个会话里可以有多次**（循环不因 final 退出，`:1756-1774`）；只有 partial 没有 final 时主进程会用最后一版 partial 补一个 final（`:1779-1788`）；什么都没识别到时发 `final { text: '' }`（`:1814`） | 固化；空文本 → 还原草稿并提示 |
| `end` | 会话结束 | `finishing → idle` |
| `onError(error)` | 任何失败；`error.code` 可能带稳定码 | 分类后提示（§4.6） |

`getRecognitionStatus().asr.mode === 'buffered'`（Nexus 缓冲转写，`voice-provider-runtime.ts:397-405`）时**没有 partial**，只有停止后的一次 final——界面在收尾阶段会等得久一些。

### 2.4 停止与取消（契约）

- `controller.stop()`：停止采集、正常收尾——`final` / `end` 照常到达（`types.ts:179-189`；主进程读 `stopSignal`，`voice-module.ts:414-418`）。
- `controller.cancel()`：中止整个会话，之后**不再有任何回调**（`types.ts:173-177`），不出 final。
- 规范写死的顺序陷阱：句柄还没回来时用户就要停，**记下「要停」、句柄到了立刻 `stop()`，不能改成 `cancel()`**（`voice-session-contracts.md`「Wrong: `cancel()` because the stream handle has not resolved」；VoicePanel `:1266`）。
- 每个会话一个代号（generation），过期回调一律丢弃（VoicePanel `isCurrentVoiceSession` / `retireVoiceSession`，`:1019-1029`）。

### 2.5 就绪、权限、模型下载

- **就绪**：`getRecognitionStatus()` → `{ asr: { ready, reason?, mode? }, stt }`。原因码：`VOICE_ASR_NOT_CONFIGURED`、`VOICE_ASR_PROVIDER_UNAVAILABLE`、`VOICE_ASR_CREDENTIAL_UNAVAILABLE`、`VOICE_ASR_PACK_*`（`voice-provider-runtime.ts:185-211`、`:348-356`）；文案与去处照 `VoiceRecognitionStatus.vue:40-94`（大多去 `/setting/intelligence/capabilities`）。
- **麦克风权限**：没有单独的「先问权限」接口给渲染层；首次采集由系统弹 TCC，拒绝后 `asrStream` 以含 `PERMISSION` / `DENIED` / `NOT_AUTHORIZED` 的错误失败。补救是 `openMicrophoneSettings()`（只 macOS / Windows 有，`voice-module.ts:48-50`；VoicePanel 用 `MIC_SETTINGS_PLATFORMS`，`:116`、`:1310`）。
- **模型下载**：端侧模型的目录 / 安装 / 进度（`getSpeechModelCatalog` / `installSpeechModel` / `getSpeechModelProgress`）是设置页的事，且都是宿主专用；输入框**不触发下载**。「混合 / 本地」来源下没有可跑的端侧模型时，就绪状态会给出上面的原因码，按「未就绪」处理即可。

### 2.6 错误分类（照 `VoicePanel.classifyFailure`，`:893-955`）

对 `${error.code} ${error.name} ${error.message}` 做正则：

| 匹配 | 文案键（已有，`assistant.voicePanel.*`） | 动作 |
|---|---|---|
| `PERMISSION\|DENIED\|NOT_?AUTHORIZ\|UNAUTHORIZED` | `microphoneDenied`「麦克风权限未授权」 | 「打开麦克风设置」（macOS / Windows） |
| 找不到设备（`CANNOT_?FIND\|NO_?(INPUT_?)?DEVICE\|…`） | `microphoneMissing` | 同上 |
| `VOICE_ASR_NOT_CONFIGURED` | `voiceRecognitionNotConfigured` | 「去设置」→ `/setting/intelligence/capabilities` |
| `VOICE_ASR_(PROVIDER\|CREDENTIAL)_UNAVAILABLE` | `voiceRecognitionUnavailable` | 同上 |
| `QUOTA\|CREDIT\|INSUFFICIENT_BALANCE` | `quotaExhausted` | — |
| 限流 / 过载（`RATE_?LIMIT\|…\|\b429\b\|\b503\b`） | `serviceBusy` | — |
| `VOICE_OPERATION_CANCELLED` | 不提示 | — |
| 其它 | `voiceTranscribeFailed` | — |

分类只看码与消息文本，**不依赖** `VoiceApiError` 类（它是工作区新加的，见 §3）。

### 2.7 主进程侧约束（影响输入框的几条）

- **会话所有者只有一个**（`VoiceService`），但它**不限制并发会话**；原生层会话表也是 `HashMap`。只有全局 ⌘⇧U 与 Quick Edit 靠同一个控制器互斥（`global-dictation.ts:31-37`）。输入框与 Fn HUD 同时开是可能的（两路采集同一支麦）。
- **恢复槽是全局单槽**：新会话开始即清掉上一会话的重试缓冲（`voice-service.ts:1417-1420`）；`retryLastFailure` / `recoveryStatus` / `discardRecovery` 不带会话标识。所以输入框**不能**提供「重试 / 撤销」——那可能是 HUD 的录音。
- **记录与统计**：流式会话照常写识别记录（`historyEnabled` 时）与聚合统计（`voice-service.ts:1790-1810` 一带），输入框的听写会出现在「语音输入」的记录里，与其它入口一致。
- **`voiceInput.enabled`**（默认 `false`）按规范只管「平台听写手势、HUD 入口、Assistant 语音运行时投影」（`voice-session-contracts.md`「Voice input enablement」）；主进程 `streamDictation` 本身不查它。

## 3. 正在被另一会话改动的部分（按现状读，输入框不依赖）

| 文件 | 工作区相对 HEAD 的变化 | 对输入框 |
|---|---|---|
| `packages/utils/transport/sdk/domains/voice.ts` | 新增 `VoiceApiError`（带 `code` / `retryable`）、`VOICE_SPEECH_CATALOG_ERROR_CODES`、投递结果 `'clipboard'`、`VoiceRecognitionLocation`、`recognitionRecordsChanged` 事件；`assertVoiceApiResponse` 改抛 `VoiceApiError` | `asrStream` / `getRecognitionStatus` / `openMicrophoneSettings` 的签名与事件**未变**；错误分类只读 `code` + 文本，两种错误对象都能处理 |
| `apps/core-app/src/main/modules/voice/voice-service.ts`（+108） | 投递失败时回退到剪贴板、识别位置 / 提供方回执 | 只影响 `delivery: 'active-app'`；`'none'` 路径的事件序列不变 |
| `voice-module.ts`（+27） | 识别记录变更广播、目录错误投影 | `asr-stream` 处理器未动 |
| `voice-provider-runtime.ts`（+30）、`voice-recognition-store.ts`（+57） | 识别位置、记录存储 | 无 |
| `speech-model-service.ts`（+139）、`SpeechModelSettings.vue`（+44）、`SettingSpeechRecognition.vue`（1 行） | 端侧模型目录的错误码与界面 | 无（输入框不碰模型下载） |
| `global-dictation.ts`（+9）、`VoicePanel.vue`（+37） | 剪贴板回退的提示文案 | 无；VoicePanel 里的 `normalizeLevel` / `appendTranscriptText` 等不要从组件里 import（见 §4.10） |
| `.trellis/spec/main-process/voice-session-contracts.md`（+20） | 规范同步 | 落地后需补一句「输入框听写」的范围（主代理走 `update-spec`） |

## 4. 方案：麦克风怎么用

### 4.1 手势：点按切换

- 点一下开始，再点一下结束（`stop()`，等 final）；Esc 取消。
- 不做「按住说话」：鼠标长按说长句很累，且按住期间指针移出按钮就会误停；全局 Fn HUD 已经覆盖「按住」的习惯。可作为后续选项（§5 D10-b）。
- 键盘：麦克风按钮上 Space / Enter 切换；**听写期间在输入框按 Enter = 结束听写**（不是发送）；Esc = 取消并还原。

### 4.2 状态机（纯函数派生展示态，逻辑在 composable 里）

```
idle ──点按──▶ starting ──ready──▶ listening ──点按 / Enter / 静音自动停──▶ finishing ──end──▶ idle
  ▲               │  2s 内无 ready / 电平 → cancel + 提示   │ Esc → cancel + 还原          │ Esc → cancel + 还原
  └── error ◀─────┴──────────── onError ─────────────────┴──────────────────────────────┘
```

| 状态 | 麦克风外观（32px 圆，沿用 proposal 的「无底」材质） | aria |
|---|---|---|
| `idle` | 无底，`i-ri-mic-line` | `aria-pressed="false"`，「语音输入」 |
| `starting` | 底 `--shell-primary-soft`；4 根电平条停在最低、透明度呼吸（与 VoicePanel「准备中不画假电平」同理） | `aria-pressed="true"`，「结束听写」，`aria-busy` |
| `listening` | 同底色；4 根条随电平跳动（主色墨） | 同上 |
| `finishing` | 条回落成静止的三点，透明度呼吸；按钮 `aria-disabled` | `aria-busy`；`aria-live` 念「正在识别」 |
| 流式中 | **让位**：淡出、`inert`，被「■ 停止」胶囊盖住（D1） | 不可聚焦 |

### 4.3 文字怎么进草稿

- **开始时**：快照 `draft` 与光标 / 选区（`selectionStart` / `selectionEnd`）；`before = draft.slice(0, start)`、`after = draft.slice(end)`（选中的文字被听写替换，与打字一致）。输入框设 `readonly`（保留焦点与光标，挡住键入和输入法，避免范围被打乱）。
- **每个 partial**：`spoken = merge(committed, partial)`，`draft = before + sep + spoken + sep + after`，然后 `autoGrow()`。`merge` 用 VoicePanel 的 `appendTranscriptText` 规则（前缀即替换、重叠即拼接、CJK 不加空格、拉丁文补一个空格，`VoicePanel.vue:957-975`）。
- **每个 final**：`committed = merge(committed, final.text)`，清空 partial，同样重写 `draft`。
- **结束（`end`）**：光标放到插入段末尾；若当时焦点仍在输入框区域，把焦点交回输入框，用户可以接着改或直接发送。
- **空结果**（全程只有 `final ''`）：还原开始时的快照，toast `voiceTranscribeEmpty`「未识别到语音内容」。
- **取消（Esc / 换会话 / 卸载）**：`cancel()` 并还原快照（换会话、卸载时不回写）。
- **出错**：保留已经显示的文字（committed + 最后一版 partial），只提示——用户看到过的字不应该凭空消失。
- 为什么 partial 直接写进草稿而不是另画一层浮字：`textarea` 不能给子串上色，浮字要对齐光标位置、跟随换行，代价高；而只读期间草稿就是「正在说的这段」，停下来就能改。

### 4.4 电平

- 归一：照搬 VoicePanel 的 `normalizeLevel`（噪声门 0.012、参考值下限 0.05、上冲 0.6 / 回落 0.15、开平方，`VoicePanel.vue:214-223`、`:796-805`）——耳语也能填满、喊叫不削顶，房间底噪读成 0。
- 画法：麦克风圆内 4 根竖条（宽 2.5px、间距 2px、高度 4–14px），取最近 4 帧，写 CSS 变量 `--l0..--l3`，条用 `transform: scaleY(var(--lN))`、`transform-origin: center`，`transition: transform 100ms linear` 在 10Hz 帧之间插值——只动合成层，不触发布局，不需要 rAF 循环。
- 不加外圈光晕：流式胶囊已有渐变光环，听写再放一圈会和它争同一种语汇；两者不会同时出现，但语汇要分开（听写 = 条，流式 = 环）。

### 4.5 与发送、流式的关系

- **听写期间发送不可用**：`canSend` 加 `&& !dictation.active`；发送键显示 `empty` 外观（`aria-disabled`），⌘Enter 命令随之禁用（命令的 `enabled` 读 `canSend`，HomePage WT `:1150`）。先结束听写，再发送——两步都在同一只手下，且不会把半截 partial 发出去。
- **回复开始流式**（从表单卡、重试等其它入口触发）：对进行中的听写调 `stop()`（优雅收尾，final 照样落进草稿——流式期间草稿本来就可编辑）；麦克风让位给「■ 停止」胶囊。
- **流式期间不能开始听写**：麦克风被胶囊盖住（D1）。
- **附件**：不受影响（D12 已放开，`addFiles` 流式期间可用，HomePage WT `:776-780`）。

### 4.6 错误与权限

- **点按前的就绪检查**：进入页面与窗口重新获得焦点时读一次 `getRecognitionStatus()` 并缓存；`asr.ready === false` 时点麦克风**不开录**，直接 toast 原因 + 「去设置」（映射同 `VoiceRecognitionStatus.vue`）。读状态失败不拦截——照常尝试，失败再按 §2.6 分类。
- **流中错误**：按 §2.6 分类，`toast.warning / error(msg, { action: { label, onClick } })`（先例 `usePluginUpdates.ts:35-46`）。
- **看门狗**：开始后 2 秒内既没有 `ready` 也没有 `level` → `cancel()` + 「麦克风没有响应」+ 设置动作（VoicePanel 同值 `CAPTURE_START_TIMEOUT_MS = 2000`）。
- **不做重试 / 撤销**（§2.7 恢复槽的原因）。

### 4.7 生命周期

| 事件 | 处理 |
|---|---|
| 句柄未到就要停 | 记 `stopRequested`，句柄一到就 `stop()`（不是 `cancel()`） |
| 离开 Home 路由（页面被保活） | `stop()`，文字留在草稿 |
| 切换会话 / 新会话 | `cancel()`，不回写 |
| 组件卸载 | `cancel()` |
| 窗口失焦 / 隐藏 | 继续（与 VoiceDock「失焦不取消」同一规则） |
| 旧会话的迟到回调 | 按 generation 丢弃 |

### 4.8 减少动态效果（`prefers-reduced-motion: reduce`）

- 电平条不动：`listening` 显示静态 `i-ri-mic-fill`（主色）+ 主色浅底；状态靠颜色与 `aria-pressed` 表达。
- `starting` / `finishing` 不呼吸，只换图标（`finishing` 用静态三点）。
- 麦克风让位 / 回来：瞬时显隐，无缩放。

### 4.9 无障碍

- 一个常驻 `<button>`：`aria-pressed` 表示是否在听；名称「语音输入」/「结束听写」。
- 一个 `aria-live="polite"` 的隐藏区域念状态变化（开始听写 / 正在识别 / 已插入）；partial 文本不逐字播报（输入框本身可读）。
- 听写期间输入框 `aria-readonly`（`readonly` 自带）；焦点不被抢走，结束后才交回输入框。

### 4.10 最小接线

新文件（都在 `views/base/home/composer/`，与 proposal §5 同目录）：

| 文件 | 职责 |
|---|---|
| `dictation-text.ts` | 纯函数：`spliceDictation({ before, after, committed, partial })`、`mergeTranscript(base, incoming)`（从 VoicePanel 的规则抄出并加测试，不从正在改的 `.vue` 里 import） |
| `voice-level.ts` | 纯函数：`createLevelNormalizer()`（同 VoicePanel 常量），返回 `(rms) => 0..1`；将来 VoicePanel 可改用它 |
| `useComposerDictation.ts` | 会话逻辑：可注入 `sdk`（测试替身）；暴露 `state`、`levels`（长度 4）、`active`、`toggle()`、`stop()`、`cancel()`；内部管 generation、`stopRequested`、看门狗、快照与还原；错误回调交给页面弹 toast |
| `ComposerMic.vue` | 外观与无障碍：props `state`、`levels`、`yielded`（流式让位）；emits `toggle` |

`HomePage.vue` 只做接线（示意）：

```ts
const dictation = useComposerDictation({
  draft,                                  // Ref<string>
  input: () => inputRef.value,
  language: () => appSetting.voiceInput?.language,
  onTextChange: autoGrow,
  onNotice: showDictationNotice           // toast + 动作
})
const canSend = computed(
  () => draft.value.trim().length > 0 && !isStreaming.value && !dictation.active.value
)
watch(isStreaming, (on) => { if (on) dictation.stop() })
watch(isHomeRoute, (on) => { if (!on) dictation.stop() })
// handleKeydown：dictation.active 时 Enter → dictation.stop()，Esc → dictation.cancel()
```

模板：`<textarea … :readonly="dictation.active.value">`；工具栏里的麦克风换成 `ComposerMic`（在 `ComposerToolbar` 里时，由它把 `micState` / `micLevels` 往下传、把 `mic` 事件往上抛）。主进程**不需要改**。

### 4.11 测试

| 文件 | 断言 |
|---|---|
| `dictation-text.test.ts` | 光标处插入、选区替换、CJK / 拉丁分隔、partial 被下一版替换、多次 final 累加、空结果还原 |
| `voice-level.test.ts` | 噪声门以下为 0；耳语能到 1；大声后回落速度；非有限值为 0 |
| `useComposerDictation.test.ts`（假 SDK + 假计时器） | `ready → level → partial → final → end` 的草稿变化；句柄未到先停 → 到达后 `stop()` 一次、从不 `cancel()`；取消后迟到事件被丢弃且草稿还原；2 秒无电平 → 取消 + 提示；`isStreaming` 变真 → `stop()`；各类错误 → 对应提示与动作；未就绪时点按不调用 `asrStream` |
| `ComposerMic.test.ts` | 各状态的 `aria-pressed` / 名称 / `aria-busy`；`yielded` 时 `inert`；减少动态效果下没有 `transition` |
| `HomePage` 相关现有测试 | `canSend` 在听写期间为假；Enter 在听写期间不发送 |

实机（按父任务约定、老板允许时）：一次说话 → 草稿里出现、停止后光标在末尾；拒绝麦克风权限 → toast 与「打开麦克风设置」；没有配识别 → 「去设置」；说话时收到流式 → 听写收尾、胶囊出现；开「减少动态效果」再走一遍。

## 5. 需要老板拍板

| # | 推荐 | 备选 |
|---|---|---|
| D10-a 是否受「语音输入」总开关（默认关）管 | **不受**：总开关管全局 Fn 手势与 HUD；输入框按钮本身就是明确同意，也不往别的应用里敲字。需在规范里补一句范围 | 受管：开关关着时点麦克风提示「语音输入已关闭，可在设置中开启」（`voiceInputDisabled`，现成文案） |
| D10-b 手势 | 只做点按切换 | 点按切换 + 长按（≥350ms）变按住说话、松开即停 |
| D10-c AI 整理 | 不整理（`deliveryTiming: 'live'`，只保留服务端去口水词） | 跟随「语音输入」的整理偏好：停止后进入「整理中」，final 会改写 partial（最多 8s 超时） |
| D10-d 听写时点发送 | 发送不可用，先结束听写 | 「结束并发送」：点发送 = `stop()`，final 落定后自动发送 |
| D10-e 静音自动停 | 用主进程默认 1.5s（与 HUD 一致） | 输入框传更长的 `silenceStopMs`（3–5s），留出想下一句的停顿 |
| D10-f 电平样式 | 圆内 4 根条 | 麦克风也像停止键那样向左长成「听写胶囊」（波形 + 计时），会盖住模型胶囊 |

## Related Specs

- `.trellis/spec/main-process/voice-session-contracts.md` — 会话所有者、停止 vs 取消的陷阱（「Stop before asrStream handle → finalize once on arrival」）、`voiceInput.enabled` 的管辖范围、设备提示非终态、失焦不取消。
- `.trellis/spec/frontend/tuffex-design-rules.md` — 悬停立即、状态色只在变化期过渡、减少动态效果。

## Caveats / Not Found

- `deliveryTiming: 'live'` + `delivery: 'none'` 的组合是按 `voice-service.ts:1474`、`:1505`、`:1640-1642` 读出来的效果（不整理、保留去口水词、不投递），类型注释（`voice.ts:220-233`）描述的是投递语义；这组取值没有现成调用方，落地时要加一条主进程测试钉住。
- 不同提供方的 partial 是「本句完整假设」还是「增量片段」不一，合并规则沿用 VoicePanel 的容错写法；没有逐个提供方实测。
- 输入框与 Fn HUD / 全局 ⌘⇧U 可能同时采集（主进程不互斥）；本次不处理，只记录。
- 首次使用时系统权限弹窗的实际表现（弹出时机、拒绝后的错误码文本）没有在本机实测（约束：不驱动正在使用的应用）。
- 规范文件与多份语音代码正被另一会话修改；本文件的行号以 2026-09-26 13:40 左右的工作区为准。
