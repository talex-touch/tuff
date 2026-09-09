# 语音条：转写文本跟随、波形随宽度、卡顿探针

## Goal

修四个问题。前两个是可见的版式缺陷，后两个共用同一个根因。

## 已确认的事实（2026-09-08 排查）

排除掉的（都做了实测，不是推断）：

| 假设 | 结论 |
|---|---|
| `IntelligenceOperationCancelledError` 相关 | **否**。`VoicePanel.vue` 全文不引用 intelligence SDK，语音走 `AssistantEvents.voice.*` + `StreamController`，两套机制无交集。 |
| 每次 partial 的渲染/强制回流开销 | **否**。headless Chrome 复刻同样 DOM/CSS 实测：20→240 字，每次 partial 脚本开销 <1ms，且 160 字后反而更便宜。 |
| 字符 span 残留 `filter: blur(0)` 造成合成层膨胀 | **否**。帧节奏实测：20/80/160/240 字 × filtered/no-filter 共 8 组，p50/p95/worst 全是 16.7–16.8ms，掉帧 0。 |
| ASR 重试缓冲区无界增长 | **否**。`appendRetryBuffer` 是 O(1) 追加，10MB 封顶后直接降级。 |
| `writePcm` 背压阻塞采集 pump | **否**。`socket-session.ts:143` 是 `socket.send()`，不等排空。 |

定位到的根因：

**`deliverText` 里的 `nativeAudio.typeText(trimmed)` 是同步的**，落到 `packages/tuff-native/native-audio/src/lib.rs:1625` 的 `enigo.text(text)`。macOS 上它逐字符 post 合成 `CGEvent`，整串打完才返回，期间**阻塞主进程事件循环**。文本越长阻塞越久 —— 这正是「说话久了会卡一卡」「执行粘贴的时候会卡」。

同一批合成键事件还会撞上 Fn 手势的事件 tap：

- `function_key_monitor.rs:476` 把**所有** `CGEventType::KeyDown` 喂进 reducer，**没有按 `kCGEventSourceStateID` 过滤合成事件**，所以 enigo 打的每个字都被当成真实按键。
- `function_key_monitor.rs:337` 只在 `KeyDown` 时 `held_non_function_keys.insert(key_code)`，只有 `KeyUp` 才移除。任何一个 down 的 up 没被 tap 看到，这个 keycode 就**永久留在集合里**。
- 一旦集合非空，`function_key_monitor.rs:320` 的 `state.contaminated = has_other_keys || !state.held_non_function_keys.is_empty()` 让**之后每一次 Fn 按下都被判定为组合键**，发出 `EVENT_DOWN_WITH_OTHER_KEYS`；JS 侧 `command-gesture.ts:218` 收到 `hasOtherKeys: true` 直接 `cancelCombinedGesture()`，`toggle` 再也发不出来。

这解释了「按了 fn 之后再按不会结束当前语音识别」，且**症状在第一次粘贴之后才出现并持续** —— 与用户描述一致。

## Requirements

### R1 转写文本跟随尾部

- R1.1 监听中文本超出可视宽度时，用 `transform: translateX()` 把文本左移，使**最新的字**始终可见；不用 `scrollLeft`。
- R1.2 未超出时保持现在的居中，且从居中到跟随的切换必须连续、不跳变。
- R1.3 两端留白，并有渐隐遮罩，字符不能硬切在胶囊边缘。
- R1.4 胶囊宽度保持现有「随字数长到上限」的行为（用户 2026-09-08 确认），到上限后由位移接管。

### R2 波形随宽度变长

- R2.1 波形条数由胶囊中间可用宽度推导，不再固定 24。
- R2.2 下限保持 24（基础宽度下视觉不变），上限按最大宽度算满。
- R2.3 条数变化时保留已有的电平历史：变多时左侧补零，变少时丢最旧的。
- R2.4 注意语义变化：一条 = 一帧 10Hz 电平，条数变多等于显示更长的历史，常量注释要跟着改。

### R3 粘贴不再阻塞主进程

- R3.1 投递长文本时主进程事件循环不被独占。先量 `enigo.text()` 对 N 字的实际耗时，再决定策略（异步化 / 分片让出 / 长文本走剪贴板单次粘贴）。
- R3.2 不改变投递语义：目标应用切换后仍然放弃投递，失败仍然回落剪贴板。

### R4 Fn 手势不再被合成键事件污染

- R4.1 事件 tap 按 `kCGEventSourceStateID` 忽略合成事件（我们自己 post 的按键不应被当成用户输入）。
- R4.2 `held_non_function_keys` 不能无限累积：Fn 抬起时清空，作为丢失 KeyUp 的兜底。
- R4.3 修复后，粘贴过一次之后再按 Fn 仍然能结束当前识别。

### R5 卡顿探针

用户 2026-09-08 选择「说不清，先埋探针」。

- R5.1 可开关的探针，记录 level/partial 事件到达间隔与渲染帧间隔，能区分「事件断流（主进程/provider）」与「渲染掉帧（渲染进程）」。
- R5.2 默认关闭，不影响正常构建。

## Acceptance Criteria

- [ ] AC1 长转写下最新的字始终可见，两端有留白与渐隐，居中↔跟随切换无跳变。
- [ ] AC2 胶囊在最大宽度时波形铺满中间区域；基础宽度下仍是 24 条。
- [ ] AC3 投递 200+ 字时主进程无可感知停顿。
- [ ] AC4 粘贴一次后再按 Fn 能结束当前识别（回归用例覆盖 `held_non_function_keys` 不残留）。
- [ ] AC5 `function_key_monitor` 的 Rust 单测覆盖：合成事件被忽略、Fn 抬起清空按键集合。
- [ ] AC6 core-app typecheck / test 通过；`cargo test` 通过。
- [ ] AC7 探针能在真机跑出一份可读的间隔统计。

## Constraints

- core-app 的 lint 配置与根配置相反（尾逗号等），用包内配置，判 delta 不判零，绝不整文件 `--fix`。
- 工作区里已有一份**未提交的语音重构**（`streaming-asr-client.ts` 已删、`voice-service.ts` 等被改，来自 `09-04-unify-voice-session-rust`）。改这些文件前先确认不会和那份工作冲突。
- 改 Rust 要重新构建原生绑定才能在应用里生效。
