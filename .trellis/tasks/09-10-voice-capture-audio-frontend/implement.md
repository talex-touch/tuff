# Implement：语音采集前端链路

## 提交边界

> **2026-09-10 执行结果**：M1 与 M2 合并成一个边界——两者在音频回调同一处交汇
> （`build_typed_stream` 需要 `observe_speech`），拆开会留下一个编译不过的中间态。
> M3/M4/M5 按原计划。**未提交**：本次没有拿到 Commit 授权，改动全部留在工作区。

四个可独立验证的里程碑，每个跑完自己的验证再进下一个。

---

## M1+M2 抗混叠、高通与自适应静音判定 — 已完成

**范围**：`packages/tuff-native/native-audio/src/lib.rs`

- [ ] 新增 `Biquad`（f64 系数与状态，f32 in/out）与 `BiquadCascade`
- [ ] `butterworth_lowpass_cascade(fs, fc, order)` / `butterworth_highpass_cascade(...)`
      使用 RBJ cookbook 公式 + Butterworth Q 表（design §2.2）
- [ ] 新增 `CaptureFrontend`，吸收现有 `StreamingLinearResampler`；
      `new(input_rate, output_rate, noise_suppression)` / `push(&[f32]) -> &[f32]` / `finish()`
- [ ] `build_typed_stream` 回调改为 downmix → `frontend.push()` → 写 samples；
      `capture_thread_main` 用 `Arc<Mutex<CaptureFrontend>>` 取代 `Arc<Mutex<StreamingLinearResampler>>`
- [ ] 低通仅在 `src_rate > target_rate` 时接入；高通常开

**测试**（新增，全部为合成信号的客观测量）：

- [ ] `passband_is_flat_from_200hz_to_6khz`：≤ 1 dB
- [ ] `aliasing_is_suppressed_below_the_speech_band`：12 kHz 折返 4 kHz ≥ 20 dB，
      10 kHz 折返 6 kHz ≥ 20 dB（AC1）
- [ ] `rumble_below_60hz_is_attenuated`：50 Hz ≥ 15 dB，300 Hz ≤ 1 dB（AC2）
- [ ] `non_integer_device_rate_meets_the_same_bounds`：44.1 kHz→16 kHz（AC5 一半）
- [ ] `frontend_without_downsampling_does_not_lowpass`：16 kHz→16 kHz 通带不被削
- [ ] 负控制：把低通级联去掉后上述混叠断言必须失败（防止断言恒真）

**验证**：`cargo test -p tuff-native-audio`

**回滚点**：本里程碑只加处理、不改任何对外结构，摘掉 `CaptureFrontend` 里的
cascade 构造即回到原行为。

---

## M2（已并入 M1）自适应静音判定（D2）

**范围**：`lib.rs`

- [ ] 新增 `SpeechDetector`：10 ms 窗 + 4×75 分块滑动最小值 + ENTER/EXIT 滞回
      （常数见 design §2.3）
- [ ] 接进 `CaptureFrontend.push()`，判为语音时 `silence.mark_sound(elapsed)`
- [ ] 删除 `SILENCE_RMS_THRESHOLD` 与回调里的 `rms(&mono) > ...` 分支
- [ ] `rms()`、`should_stop_for_silence()`、`SilenceState` 保持原样不动

**测试**：

- [ ] `speech_is_detected_from_4db_snr_upward`：−60…−22 dBFS 底噪全检出（AC3）
- [ ] `steady_noise_alone_is_never_speech`：−60/−40/−30/−22/−14 dBFS 纯噪声全部不检出
- [ ] `digital_silence_is_never_speech`：全零
- [ ] `noise_floor_converges_when_speech_starts_immediately`：首帧即语音仍能自停（AC4）
- [ ] `noise_floor_tracks_a_mid_session_rise`
- [ ] `a_continuous_monologue_stays_detected`：14 s 无长停顿
- [ ] 负控制：把 ENTER 调成 1.0，纯噪声用例必须失败

**验证**：`cargo test -p tuff-native-audio`；确认既有
`silence_requires_prior_speech` / `silence_waits_for_full_quiet_window` /
`resample_linear_*` / `streaming_resampler_*` 全部仍绿。

---

## M3 DashScope VAD 阈值（D3）— 已完成

**范围**：`packages/tuff-voice/src/protocol/qwen-asr-realtime.ts`

- [ ] 导出 `DASHSCOPE_DEFAULT_VAD_THRESHOLD = 0.3`，替换 `?? 0.0`
- [ ] 保持 `??` 语义：显式传 0 仍为 0

**测试**：`packages/tuff-voice/test/voice-protocols.test.ts`

- [ ] 默认 `session.update` 的 `turn_detection.threshold` 非 0 且等于常数（AC6）
- [ ] 显式 `vad.threshold = 0` 仍产出 0（区分「显式 0」与「未提供」）

**验证**：`pnpm --filter @talex-touch/tuff-voice test`（按仓库实际脚本名调整）

---

## M4 谱降噪开关（F1）— 已完成

**范围**：Rust + 主进程 + 设置 + UI

- [ ] `native-audio/Cargo.toml` 加 `nnnoiseless = "0.5.2"`；确认无 C 工具链要求
- [ ] `CaptureFrontend` 接入 RNNoise 段：480 定长帧、残留缓冲、首帧丢弃、
      ×32768 幅度换算、非 48 kHz 时前置升采样
- [ ] 失败回落：初始化或处理异常 → 本会话余下时间禁用降噪，录音不中断
- [ ] `AudioCaptureOptions.noise_suppression: Option<bool>`（Rust）+ `audio.d.ts` 同步
- [ ] `app-settings.ts`：默认值 `noiseSuppression: false` + `ensureVoiceInputSetting` 归一化
- [ ] `voice-service.ts`：`resolveNoiseSuppression`，在 `startSession` 首个 await 前解析，
      存进 session，传给 `startCapture`；payload 可一次性覆盖
- [ ] `SettingSpeechRecognition.vue`：抽屉内开关行 + 中英文案

**测试**：

- [ ] Rust：`denoise_frames_are_blocked_at_480_samples`（样本数守恒 + 尾巴刷出）
- [ ] Rust：`denoise_failure_falls_back_to_passthrough`（AC9）
- [ ] Rust：`denoise_works_at_a_non_48k_device_rate`（AC5 另一半）
- [ ] `app-settings` 迁移：默认 false；非法值 fail closed；不覆盖既有字段（AC7）
- [ ] `voice-service`：只解析一次，stop/retry 复用快照（AC8）
- [ ] `SettingSpeechRecognition.test.ts`：开关读写与真实 SFC 冒烟

**验证**：`cargo test -p tuff-native-audio`；VoiceService / VoicePanel / 设置页 focused Vitest；
CoreApp Web + Node typecheck。

---

## M5 集成验证与证据（AC10–AC12）— AC10 未完成，其余完成

- [ ] `node packages/tuff-native/scripts/build-audio.js` 重建并签名 release addon
      （**禁止**破坏性 rebuild，会抹掉其他 Rust addon）
- [ ] headless addon 加载检查 / `verify-audio-production.js`
- [ ] 真机录音冒烟：确认无爆音、无 xrun、听感正常
- [ ] **AC10 手工 A/B**：同一段真实带底噪录音，`noiseSuppression` on/off 各跑一次
      真实 provider，识别文本 + 字错率写入 `evidence/`
- [ ] 依据 AC10 结果决定默认值；不支持默认开启则保持 false 并把结论写进 evidence
- [ ] 记录 addon 体积前后差
- [ ] `voice-session-contracts.md` 补采集前处理与降噪偏好条款（AC11）

**AC10 的诚实边界**：自动化测试只证明 DSP 的客观指标，**不构成识别率证据**。
识别率结论必须来自这一步的真实 provider 运行；跑不成就如实报告未验证，不用
自动化结果顶替。

---

## 全局验证清单（最后一轮，AC12）

- [ ] `cargo test -p tuff-native-audio`
- [ ] tuff-voice 协议测试
- [ ] VoiceService / GlobalDictation focused Vitest
- [ ] VoicePanel / VoiceDock / SettingSpeechRecognition focused Vitest
- [ ] CoreApp `npm run typecheck`（node + web）
- [ ] release addon 构建 + headless 加载
- [ ] 真机录音 smoke
- [ ] lint：**用包内配置，判 delta 不判零，绝不整文件 `--fix`**（core-app lint 配置与根配置规则相反）

## 注意事项

- 并发写入：本仓可能有其他 agent 同时写文件。验证某文件的 HEAD 版本用
  `git show HEAD:path > path`，**不要** stash / checkout / restore。
- 提交前只暂存本里程碑拥有的文件（暂存区是共享状态）。
- `rg` 的 `-r` 是 `--replace`，永远不要写成 `-rn` / `-rl`。

---

## 执行后记：与计划的偏差

- **M1/M2 合并**：见顶部说明。
- **新增未列入计划的守卫**：非有限样本（NaN/Inf）在进入滤波器前归零。这不是扩大范围——
  IIR 级联是本次引入的，一个 NaN 进入递归状态会让整个会话余下部分静音，
  是本次改动自己创造的失效模式，必须由本次改动兜住。
- **降噪失败路径的诚实修正**：`DenoiseState::new()` 在 nnnoiseless 里不可失败（无 Result），
  所以 AC9 的「初始化失败」在 Rust 层没有真实触发点。实际实现的守卫是
  「模型输出非有限值 → 本会话降级为纯速率转换」，这是真实存在的失效模式，
  并由 `a_failed_suppressor_keeps_recording` 覆盖。
- **测试常数由实测标定**：ENTER/EXIT 与降噪断言阈值都不是估的，扫参与分噪声类型的
  测量记录在 `evidence.md`。
- **旁路发现（未修，不在范围内）**：`native-audio/src/function_key_monitor.rs` 有会话前
  就存在的 rustfmt 漂移（第 16、439 行）与两条 clippy 错误（第 75、530 行）。
  `native-protocol.yml` 的 fmt/clippy 门禁因此当前是红的，与本次改动无关。
  本次只格式化了自己的代码，该文件按原样从 HEAD 恢复。
