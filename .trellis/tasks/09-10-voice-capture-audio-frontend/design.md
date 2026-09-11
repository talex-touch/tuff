# Design：语音采集前端链路

## 1. 边界

改动集中在**一个新结构体**上：`CaptureFrontend`（`native-audio/src/lib.rs`）。
它替换目前散在音频回调里的三行处理，成为「设备样本 → 目标速率单声道 PCM + 语音判定」
的唯一所有者。

回调外的既有契约一律不动：`should_stop_for_silence` 的语义、`StopReason`、
`drainCapture` / `snapshotCapture` / `stopCapture` 的字节格式、`SilenceState` 的原子字段。

## 2. 处理链

```
interleaved device samples (f32, N ch, device_rate)
  │
  ├─ downmix_to_mono                                   [既有，不变]
  │
  ├─ high-pass  4阶 Butterworth @ 80 Hz                [新，常开]
  │
  ├─ [仅当 noise_suppression 开启]
  │     ├─ 若 device_rate != 48000：线性重采样到 48 kHz   （升采样无需抗混叠）
  │     ├─ RNNoise（nnnoiseless）480 样本定长帧           （丢弃首帧淡入）
  │     └─ 此后 src_rate = 48000
  │
  ├─ anti-alias low-pass 8阶 Butterworth @ 0.45×target  [新，仅当 src_rate > target]
  │
  ├─ StreamingLinearResampler → target_rate            [既有，不变]
  │
  ├─ SpeechDetector（10 ms 窗，滑动最小值噪声底）        [新，替换固定 RMS 阈值]
  │     └─ 判为语音 → silence.mark_sound(elapsed)
  │
  └─ samples buffer
```

### 2.1 为什么低通放在重采样前而不是换掉重采样器

`StreamingLinearResampler` 已经通过测试、支持非整数比率、且被
`streaming_chunks_equal_full_resample_for_non_integer_target_rate` 锁定。多相 FIR 重写
要处理任意有理比率，代价远大于收益。**先带限、再线性插值**是等价且更小的改动：
线性插值的误差来自输入信号在 Nyquist 附近的能量，把那部分先滤掉，误差就随之消失。

### 2.2 滤波器设计（已用 Python 原型实测，非解析估算）

RBJ cookbook biquad + Butterworth 级联 Q 值。**系数与状态用 f64**，输入输出 f32——
80 Hz / 48 kHz 的极点非常靠近 z=1，f32 直接型状态在此处条件数不足。

| 环节 | 阶数 | 截止 | 级联 Q |
|---|---|---|---|
| high-pass | 4 | 80 Hz | 0.541196, 1.306563 |
| anti-alias low-pass | 8 | 0.45 × target_rate | 0.509796, 0.601345, 0.899976, 2.562915 |

实测响应（48 kHz→16 kHz 与 44.1 kHz→16 kHz 两档一致）：

| 输入 | 结果 | 实测 |
|---|---|---|
| 30 Hz | 通带外 | −34.1 dB |
| 50 Hz | 通带外 | −16.4 dB |
| 100 Hz | 通带边缘 | −0.67 dB |
| 200 Hz ~ 4 kHz | 通带 | ≤ 0.24 dB |
| 6 kHz | 通带 | −0.16 / −0.68 dB |
| 10 kHz → 折返 6 kHz | 混叠 | −28.5 / −31.2 dB |
| 12 kHz → 折返 4 kHz | 混叠 | −46.9 / −51.8 dB |

对比改动前同一路径：10 kHz 仅 −1.26 dB，12 kHz 仅 −1.82 dB。

`src_rate <= target_rate` 时（设备本身就是 16 kHz，或升采样）不接低通——没有可混叠的
频率，接了只会白削通带。

### 2.3 语音判定：滑动最小值噪声底

固定阈值的根本问题是它假设了一个它无从知道的量。改为从信号本身估计：

```
每 10 ms 窗（目标速率下 160 样本）：
  r     = rms(window)
  floor = 最近 3 秒内所有窗 RMS 的最小值        // 4 子块 × 75 窗的分块最小值
  base  = max(floor, ABS_FLOOR)
  进入语音： !speech && r > base * ENTER
  退出语音：  speech && r < base * EXIT
  speech → silence.mark_sound(elapsed)
```

分块最小值：4 个子块各持有自己的最小值，满 75 窗轮转一次，`floor` = 4 个子块最小值
与当前进行中子块最小值的最小值。固定 5 个 f32，O(1)，无分配。

**为什么是滑动最小值而不是指数平滑**：指数平滑需要「说话时是否冻结上行适应」的判断，
而那个判断本身依赖噪声底——形成反馈环。原型实测该环会死锁：噪声底被冻在低位，
`speech` 永不退出，自停永不触发。滑动最小值没有任何反馈路径，结构上不可能死锁。

常数（原型实测标定，非拍脑袋）：

| 常数 | 值 | 含义 |
|---|---|---|
| `DETECT_WINDOW_MS` | 10 | 判定窗长 |
| `NOISE_FLOOR_SUBS` | 4 | 子块数 |
| `NOISE_FLOOR_SUB_WINDOWS` | 75 | 每子块窗数（合计 3 s 历史） |
| `ABS_NOISE_FLOOR` | 0.0006 | ≈ −64 dBFS 数字静音兜底 |
| `SPEECH_ENTER_RATIO` | 2.5 | +8 dB 进入 |
| `SPEECH_EXIT_RATIO` | 1.6 | +4 dB 退出（滞回） |

实测工作区间（语音 −18 dBFS，5 组随机种子）：

| 底噪 | SNR | 检出 | 自停 |
|---|---|---|---|
| −60 ~ −22 dBFS | 42 ~ 4 dB | 5/5 | 5/5 |
| −18 dBFS | 0 dB | 0/5 | 0/5 |

负控制（必须全 0）：纯噪声 −60/−40/−30/−22/−14 dBFS 均为 0/5；全零数字静音 speech=false。
0 dB SNR 检不出是可接受的——那个信噪比下 ASR 本身也没有可用输出。

阈值选择过程留档：ENTER=4.0/3.0 在 4 dB SNR 场景漏检，2.5/1.6 与 2.0/1.4 全通过；
取 2.5 是在「4 dB SNR 仍可用」与「离高斯噪声误触发留 20+ sigma 余量」之间取的点。

### 2.4 谱降噪

`nnnoiseless` 0.5.2：纯 Rust、模型内置（无外部权重文件、无网络、无 C 工具链），
`DenoiseState::FRAME_SIZE` = 480 @ **48 kHz**，样本取 i16 值域的 f32（非 −1..1）。

- 速率适配：设备非 48 kHz 时先线性升采样到 48 kHz（升采样不需要抗混叠）。之后
  下游低通/重采样的源速率变为 48000。
- 定长帧：`CaptureFrontend` 持有 480 样本的残留缓冲；不足一帧的尾巴留到下次；
  `finish()` 时零填充刷出。
- 首帧淡入伪影按上游文档丢弃。
- 幅度：进 RNNoise 前 ×32768，出来 ÷32768。
- 失败回落：`DenoiseState::new()` 或帧处理 panic/异常时，置位 `denoise_disabled`
  并在本会话余下时间走不降噪路径。**录音不中断，会话不失败**（R5）。

**明确拒绝**：不把 `process_frame` 返回的 VAD 概率接进 `SpeechDetector`。那会让静音
判定的行为取决于一个默认关闭的开关，同一段音频在开关两侧走两条判定路径，难以复现
也难以测试。一个检测器，一种行为。

## 3. 并发与实时性

现状：回调里已有 `lock(&resampler)` + `lock(&samples)` 两把锁和 `Vec::with_capacity`
分配，即本仓的既有姿态是「务实，非硬实时」。

改动**减少**锁数量：`Arc<Mutex<StreamingLinearResampler>>` 并入
`Arc<Mutex<CaptureFrontend>>`，回调从两把锁降到两把（frontend + samples），滤波器、
RNNoise 状态、检测器状态全部在 frontend 内部，不额外加锁。

所有中间缓冲（滤波暂存、RNNoise in/out、检测窗）作为 `CaptureFrontend` 字段预分配，
`push()` 内只做 `clear()` + `extend`，不新增每回调分配。

## 4. 主进程侧

### 4.1 设置

`packages/utils/common/storage/entity/app-settings.ts`：

- `voiceInput.noiseSuppression: false` 加入默认值。
- `ensureVoiceInputSetting` 增加一条与既有字段同形的归一化：布尔取原值，
  非布尔 fail closed 到 `false`。沿用既有 `...source` 展开，不动其他字段。

### 4.2 解析点

严格复刻 `polishStrength` 的既有契约（见 voice-session-contracts「Wrong vs Correct」）：

```
resolveNoiseSuppression(requested)   // 与 resolvePolishStrength 同形
  ↓
VoiceService.startSession()          // 唯一解析点，在首个 await 之前
  ↓
session.noiseSuppression             // 存进 session
  ↓
nativeAudio.startCapture({ ..., noiseSuppression })
```

`startSession` 是 `dictate` / `streamDictation` / `streamViaProvider` 的共同入口，
所以一处接入即全覆盖。stop / retry 路径**不得**重读设置。

### 4.3 DashScope VAD

`qwen-asr-realtime.ts`：`threshold: vad.threshold ?? 0.0` →
`?? DASHSCOPE_DEFAULT_VAD_THRESHOLD`（0.3）。调用方显式传值仍然优先，包括显式传 0。
用 `??` 而非 `||` 保证「显式 0」与「未提供」可区分。

不给 Doubao / Paraformer 造 VAD 参数——它们的协议没有这一面（Non-Goal）。

### 4.4 UI

`SettingSpeechRecognition.vue` 的语音输入抽屉加一个开关行，紧邻润色相关控件。
文案说明默认关闭及原因（云端 ASR 未必受益）。沿用该抽屉既有的自动高度处理
（合约已记录 560px 抽屉内固定 56px 行会与换行描述重叠）。

## 5. 兼容性与回滚

- 采集输出格式、速率、声道、WAV 头一律不变 → `drainCapture` / `stopCapture` 的
  下游（provider 连接、重试缓冲、文件转写）零改动。
- 缺 `noiseSuppression` 字段的历史配置迁移为 `false` = 现状行为。
- 回滚粒度：高通/低通/检测器/降噪是四段独立代码，任一段可单独摘除而不影响其余。
- 前处理**不可**由用户关闭（R1/R2/R3 是缺陷修复，不是偏好）；只有 R5 降噪有开关。

## 6. 风险

| 风险 | 处置 |
|---|---|
| 4 dB SNR 以下检不出语音 → 不自停 | 与现状同级（现状同样不自停），且有 `maxDurationMs` 兜底 |
| 非稳态噪声（关门、敲键）误触发 speech | 只影响自停计时，不影响转写内容；可接受 |
| RNNoise 使云端 ASR 降准 | 默认关闭；AC10 用真实 provider 实测后再决定默认值 |
| 新增 Rust 依赖影响 addon 体积/构建 | 纯 Rust 无外部权重；构建后核对产物体积并记录 |
| 音频回调新增计算导致 xrun | RNNoise ≈ 单核 1–2%；前处理为标量 biquad；用真机录音验证无爆音 |
