# Implement — 语音条

设计折进本文件；根因分析见 `prd.md`「已确认的事实」。

## 顺序

R4 → R2 → R1 → R3 → R5。先做小而确定的（Fn 手势），再做版式，最后动原生投递。

## 阶段 1 · R4 Fn 手势污染（`packages/tuff-native/native-audio/src/function_key_monitor.rs`）

- [ ] 1.1 在 tap 回调（~444 行）读 `CGEventField::EventSourceStateID`，非 HID 系统状态（即我们自己 post 的合成事件）直接 `return event.as_ptr()`，不进 reducer。这是原则性修复：合成键不是用户输入。
- [ ] 1.2 `reduce_gesture` 的 `FunctionFlagsChanged` 分支里，`function_down == false` 时同时 `state.held_non_function_keys.clear()`。这是兜底：任何丢失的 KeyUp 都会在下一次 Fn 抬起时被冲掉，集合不再单调增长。
- [ ] 1.3 `function_key_monitor_tests.rs` 补两条：① 合成事件不污染 ② 一个 down 没有配对 up 时，Fn 抬起后下一次按下仍然是 `EVENT_DOWN` 而不是 `EVENT_DOWN_WITH_OTHER_KEYS`。
- [ ] 1.4 `cargo test -p <crate>` 通过；负控制：注释掉 1.2 的 clear，确认新测试变红。

## 阶段 2 · R2 波形随宽度（`VoicePanel.vue`）

- [ ] 2.1 常量：`WAVE_BAR_WIDTH = 2`、`WAVE_BAR_GAP = 2`、`WAVE_MIN_BARS = 24`、`WAVE_MAX_BARS`（按 `PILL_MAX_WIDTH - PILL_CHROME_WIDTH` 算满）。
- [ ] 2.2 `waveBarCount` computed：`clamp(floor((centre + GAP) / (WIDTH + GAP)), MIN, MAX)`，`centre = pillWidth - PILL_CHROME_WIDTH`。
- [ ] 2.3 `levels` 随 `waveBarCount` 变化时重采样：变长左侧补 0，变短丢最旧。写成一个纯函数，单测它。
- [ ] 2.4 改 `WAVE_BAR_COUNT` 那条注释——「24 ≈ 2.4s」不再成立，条数即秒数 × 10。

## 阶段 3 · R1 文本跟随尾部（`VoicePanel.vue`）

- [ ] 3.1 监听分支的文本换成 viewport + track 两层：viewport `overflow: hidden` + 遮罩 + 两侧留白，track `white-space: nowrap; display: inline-block`。
- [ ] 3.2 位移用一个连续公式，避免居中↔跟随切换时跳变：

      offset = textW <= viewW ? (viewW - textW) / 2 : -(textW - viewW)

      两分支在 `textW == viewW` 处都等于 0，所以连续。
- [ ] 3.3 每次 partial 后 `nextTick` 量 `track.scrollWidth` 与 viewport 内容宽，写进 `--voice-stream-offset`。（每次 partial 的测量开销已实测 <1ms，可以放心留在这条路径上。）
- [ ] 3.4 位移过渡要短：partial 以 5–10Hz 到达，260ms 会永远处在半路。用 ~140ms ease-out。
- [ ] 3.5 遮罩用 `mask-image` 而不是 `background-clip`——这个文件已经踩过一次「子元素带 filter 会让 `background-clip: text` 失效」，字符 span 到今天仍然带 filter。
- [ ] 3.6 非监听态（通知/提示）保持原样：仍是两行 + 省略号，不套 viewport。

## 阶段 4 · R3 粘贴阻塞

- [ ] 4.1 **先量**：写一个 node 脚本直接调已构建的 `typeText`，测 50/100/200/400 字的耗时。没有这个数就不知道该异步化还是该换策略。
- [ ] 4.2 按测量结果选：
      - 若单次调用就是几百 ms → 把 `type_text` 改成 napi 异步任务（注意 macOS 上 `CGEventPost` 与 `Enigo::new` 的线程要求，必要时在 Rust 侧起专用线程），TS 侧 `await`。
      - 若耗时随字数线性且很大 → 长文本改走剪贴板单次粘贴（一个合成事件而不是 N 个），短文本仍走 `typeText`。
- [ ] 4.3 不动投递语义：目标应用变了仍放弃，失败仍回落剪贴板。`voice-service.stream-provider.test.ts` 现有断言必须继续过。

## 阶段 5 · R5 探针

- [ ] 5.1 渲染侧：可开关的采集器，记录 `level`/`partial` 事件到达间隔 + rAF 帧间隔，输出 p50/p95/max 与 >100ms 的空档。
- [ ] 5.2 默认关闭（环境变量或设置开关），关闭时零开销。
- [ ] 5.3 输出格式要能一眼分辨「事件断流」还是「渲染掉帧」——两列并排。

## 验证

- [ ] `cargo test`（原生）
- [ ] core-app `npm run typecheck` + 相关 vitest
- [ ] eslint 只跑改动文件，判 delta
- [ ] 真机：长句 → 看尾字是否始终可见、波形是否铺满、粘贴时是否卡、粘贴后 Fn 能否停

## 回滚点

- 阶段 1 独立，可单独回滚（Rust + 测试）。
- 阶段 2、3 都在 `VoicePanel.vue`，共享该文件但互不依赖。
- 阶段 4 动原生签名，影响面最大，最后做。
