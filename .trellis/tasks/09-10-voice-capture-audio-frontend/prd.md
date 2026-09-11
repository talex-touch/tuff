# 语音采集前端链路：抗混叠、自适应静音判定与 VAD 修正

## Goal

麦克风到 ASR 之间目前没有任何音频前处理。除了「缺降噪」，采集链路本身还在主动
劣化信号：48 kHz→16 kHz 用裸线性插值抽取，8 kHz 以上能量几乎无衰减地折返进语音带。

本任务修掉三个既有缺陷，并新增一个默认关闭的谱降噪开关。

## Background：现状与缺陷

音频回调（`packages/tuff-native/native-audio/src/lib.rs:1163-1176`）只有三步：
多声道平均 → 全带 RMS 判静音 → 线性插值重采样。无高通、无抗混叠、无噪声门、无 AGC。

补充背景：语音链路改用 Rust cpal 原生采集后，Chromium `getUserMedia` 默认自带的
AEC/NS/AGC 一并消失（全仓已无 `getUserMedia` 调用），没有任何东西补上这层。

### D1 重采样无抗混叠低通（`lib.rs:1391-1439`）

16 kHz 输出的 Nyquist 是 8 kHz，8 kHz 以上未被滤除，直接折返。线性插值的三角核
衰减量（已计算，非估计）：

| 源频率 | 折返到 | 三角核衰减 |
|---|---|---|
| 10 kHz | 6 kHz | −1.26 dB |
| 12 kHz | 4 kHz | −1.82 dB |
| 14 kHz | 2 kHz | −2.50 dB |
| 20 kHz | 4 kHz | −5.28 dB |

键盘敲击、纸张摩擦、风扇高频、开关电源啸叫的能量集中在 10 kHz 以上，被镜像成
2–6 kHz 的伪音，正压在辅音辨识频段。此缺陷在安静环境同样成立。

### D2 静音判定是硬编码绝对阈值（`lib.rs:19` `SILENCE_RMS_THRESHOLD = 0.01`）

即 −40 dBFS 绝对门限，不估计噪声底、不自适应、无滞回。两个方向都会坏：

- 底噪偏高（空调、风扇）：`last_sound_ms` 被底噪持续刷新，尾静音自停永不触发，
  录音跑满 `maxDurationMs`。
- 远讲/轻声：整段低于阈值，`has_speech` 恒为 false，同样不自停。

限制：以上为代码推导，**尚无实测录音佐证**具体在哪些设备上翻车。验收要求补测。

> **2026-09-10 更新：已实测，结论比推导更强。** 本机安静房间无人说话时，底噪中位数
> −43.7 dBFS，仅比旧阈值（−40.0 dBFS）低 3.7 dB，4 s 内 **18.2% 的 10 ms 窗超阈**；
> 超阈窗之间**最大安静间隔只有 500 ms**，永远达不到 1500 ms。也就是说尾静音自停
> 在本机**从未触发过**，每次听写都跑满 15 s 上限。详见 `evidence.md` 第 1 节。

### D3 云端 VAD 被默认参数关闭

`packages/tuff-voice/src/protocol/qwen-asr-realtime.ts:119`
`threshold: vad.threshold ?? 0.0`。DashScope `server_vad` 阈值为 0 等于任何噪声都算
语音——链路上唯一的真 VAD 被默认值废掉。Doubao / Paraformer 协议未暴露 VAD 参数
（本任务不为它们发明参数）。

### F1 谱降噪（新增能力）

用户明确要求纳入范围，并接受「默认关闭 + A/B 证据」的形态。

技术判断保留：现代云端 ASR 声学模型在带噪数据上训练，激进谱降噪引入的频谱失真
可能**降低**识别率。因此默认关闭，由实测数据决定是否改默认。

## Requirements

### R1 抗混叠（对应 D1）

- 下采样前必须带限。仅在 `output_rate < input_rate` 时接入。
- 支持非整数比率（44.1 kHz→16 kHz 必须正确），不得只处理 48k→16k。
- 通带 0–6 kHz 衰减 ≤ 1 dB；折返到 2–6 kHz 的镜像分量衰减 ≥ 20 dB。

### R2 高通（对应 D2 的一半）

- 约 80 Hz 二阶高通，常开，去除电源嗡声与桌面震动。
- 不得削弱正常语音：≥ 200 Hz 衰减 ≤ 1 dB。

### R3 自适应静音判定（对应 D2）

- 以噪声底估计 + 相对阈值 + 滞回替换固定绝对阈值。
- 噪声底快降慢升，使「开口即说」的会话能在首个词间停顿收敛到真实底噪。
- 保留一个绝对下限，避免数字静音把阈值压到 0。
- `should_stop_for_silence` 的 `has_speech` / 静音窗口语义不变（既有合约与测试不动）。

### R4 VAD 阈值修正（对应 D3）

- DashScope `server_vad` 默认阈值改为可用值，且保持可被调用方覆盖。
- 不新建 Voice 专属 provider 目录，不为其他 provider 发明 VAD 参数。

### R5 谱降噪开关（对应 F1）

- `voiceInput.noiseSuppression`，**默认 false**。
- 单一解析点：`VoiceService.startSession`，与 `polishStrength` 同样的「一次解析、
  存进 session」契约；不得在 stop/retry 时重读设置。
- 一次性 payload 覆盖，用于 A/B 对照。
- 设备速率非 48 kHz 时仍须可用（RNNoise 仅支持 48 kHz，需内部适配）。
- 原生 addon 不可用或降噪初始化失败时，回落为不降噪并继续录音，不得让会话失败。

### R6 证据

- DSP 层客观指标由自动化测试证明（合成信号测混叠抑制、通带平坦度、噪声底收敛）。
- 识别率 A/B **必须**用真实 provider + 真实带噪录音手工跑，结果落到本任务目录。
  自动化测试不得冒充识别率证据。

## Non-Goals

- 不做 AEC（回声消除）：本场景是近讲听写，无外放回采路径。
- 不做 AGC：云端 ASR 自带归一化，额外增益会把底噪一起抬起来。
- 不改 `should_stop_for_silence` 的窗口语义与 `DEFAULT_SILENCE_STOP_MS`。
- 不把 RNNoise 的 VAD 概率接进静音判定（见 design 的取舍记录）。
- 不改 Doubao / Paraformer 协议的参数面。

## Acceptance Criteria

- [x] AC1 12 kHz 正弦经采集链路降到 16 kHz 后，4 kHz 处镜像分量 ≥ 20 dB 衰减；
      1 kHz 正弦通带衰减 ≤ 1 dB。（自动化，Rust 测试）
- [x] AC2 50 Hz 分量衰减 ≥ 15 dB，300 Hz 分量衰减 ≤ 1 dB。（自动化，Rust 测试）
- [x] AC3 −30 dBFS 稳态底噪 + 间歇语音的合成流：语音段判为 speech，纯噪声段在
      收敛后判为非 speech，尾静音自停在 `silenceStopMs` 内触发。（自动化）
- [x] AC4 「开口即说」场景：首帧即语音的合成流，噪声底在首个停顿后收敛，自停仍触发。（自动化）
- [x] AC5 44.1 kHz 设备速率下 R1/R3 同样成立，且降噪开启时链路不报错。（自动化）
- [x] AC6 DashScope `session.update` 默认阈值非 0，显式传入仍然生效。（自动化）
- [x] AC7 `noiseSuppression` 默认 false；缺字段迁移不覆盖 `enabled` / `language` /
      `polishEnabled` / `polishStrength` / `historyEnabled`；非法值 fail closed。（自动化）
- [x] AC8 `startSession` 只解析一次偏好；stop / retry 复用 session 快照。（自动化）
- [x] AC9 降噪初始化失败时会话继续、录音不中断、不上报会话失败。（自动化）
- [ ] AC10 **未完成** — 真机录一段带底噪音频，denoise on/off 各跑一次真实 ASR，识别文本与
      字错率对比写入 `evidence.md`。需要真实 provider 凭据与付费请求，本次未调用；
      `noiseSuppression` 因此保持默认关闭，该默认值目前只由技术判断支撑，无本机数据支撑。
- [x] AC11 `voice-session-contracts.md` 补上采集前处理与降噪偏好的契约条款。
- [x] AC12 Required checks 全绿：Rust 测试、release addon 构建、headless 加载、
      VoiceService/VoicePanel focused Vitest、CoreApp Web + Node typecheck。

## Constraints

- 音频回调是准实时路径：新增处理不得引入无界分配或阻塞；标量预分配缓冲。
- 改 native-audio 必须走 `build-audio.js` 重建并签名，禁止破坏性 rebuild（会抹掉
  其他 Rust addon）。
- 新依赖只允许纯 Rust、模型内置、无网络下载、无 C 工具链要求。
- 参考记忆：`tuff-native` 相关构建链路与 addon 加载顺序见 voice-session-contracts。
