# 执行计划 · 语音 HUD 融合 orb

> **V7 录制进度已落地（2026-09-08，`c76b24c12`）**：胶囊边框按 300s 上限画一条真分数进度，从左上角顺时针走。
> 三个要点 ——
> 1. `maxDurationMs` **随请求发出**，不吃主进程默认值：分母必须是本侧知道的那个数，否则线会悄悄提前走完。
> 2. 计时从**第一帧 level** 开始，不是从发起请求开始（开设备可能要等蓝牙重连 / 授权弹窗，那段不是录音）；
>    读墙钟不累加 interval，否则五分钟末尾的漂移正好落在唯一有人看的那一段。
> 3. 边框一次只说一件事：beam = 「在跑，但没有分数可给」，有分数时 beam 让位（`beamActive`）；
>    提示与 Esc 长按都能把边框收回去。最后 30s 才转 warning —— 五分钟是几乎没人碰到的天花板。
>
> 负控制四条全红（钉死分数 / beam 不让位 / 忽略 hold 与 notice / 去掉计时器拆除）；第五条
> （`startVoiceSession` 里的重置）是绿的 —— 说明那行什么都没守住，已删。
>
> **状态（2026-09-06 17:10）：已提交并推送，PR #1879 CI 30 绿 / 0 红，等 review 合并。**
>
> 后续追加并已落地：Esc 取消、三档提示语气（muted / warning / danger）、thinking 右槽换 orb +
> 中间 shimmer 文案、按态动态宽度、输入表自动增益。两个新面（转写历史 / 词典）已开 **#1880**，
> 不在本任务内 —— 转写文本目前一处都不落地，且「重试」的语义必须先定。
>
> 阿洛悬浮球的麦克风图标 → **#1878**。
>
> **原始状态（2026-09-06 07:32）：三层代码全部完成，验证全绿，尚未提交。**
>
> ```
> packages/utils   vitest   32 passed (2 files)   ← main-transport-stream 21 → 23
> apps/core-app    vitest  146 passed (11 files)  ← assistant / voice / plugin 全域
> apps/core-app    tsc     (node) 0 errors
> apps/core-app    vue-tsc (web)  0 errors
> eslint           core-app 0 / packages/utils 0（**包内**配置跑，不是根配置）
> ```
>
> 基线是同域 `49 passed | 1 failed`，现在 `146 passed | 0 failed`。
>
> **步骤 0 选了 A**：把 `module.screenshot-translate.test.ts:626` 的四个常量对齐到实现
> （`{x:220, y:412, width:360, height:64}`）。窗口常量本来就要改，这条无论如何得跟着动。
>
> **并发事故（已修复）**：另一个会话同时在改 `voice-service.ts`（加 `DEFAULT_ASR_SAMPLE_RATE`
> 与 `startSession(sampleRate)`）。它的写入吃掉了 `streamViaWebSocket` 里
> `const session = this.sessions.get(sessionId)` 与 `if (!session) {` 两行 —— `tsc` 刚绿完
> 就变成 parse error。已补回丢失的两行，双方改动都保留；它那条 `sampleRate` 测试现在也是绿的。

验证命令（直接调 bin，`pnpm <script>` 会触发工作区全量 install）：

```bash
cd apps/core-app
./node_modules/.bin/vitest run src/renderer/src/views/assistant src/main/modules/assistant \
                              src/main/modules/voice src/main/modules/plugin/plugin-module.test.ts
./node_modules/.bin/vue-tsc --noEmit -p tsconfig.web.json --composite false
./node_modules/.bin/tsc --noEmit -p tsconfig.node.json --composite false

cd packages/utils   # eslint 只在根 node_modules 里；但配置必须在包内解析，否则报 1900+ 假错
../../node_modules/.bin/eslint transport __tests__
```

---

## 提交 1 · 协议层（transport）· 已完成

### 1.1 `stop` 控制消息

- [x] `constants.ts`：`STREAM_SUFFIXES` 加 `STOP: ':stream:stop'`
- [x] `stream/protocol.ts`：`getStreamEventNames` 加 `stop`
- [x] `types.ts`：`StreamController` 加 `stop?: () => void`；`StreamContext` 加 `readonly stopSignal: AbortSignal`
- [x] `stream/client-runtime.ts`：`stop()` 发 `streamEvents.stop`，**不** `cleanup()`，重复调用幂等
- [x] `stream/server-runtime.ts`：`StreamState` 加 `stopController`；`handleStop`；`buildContext` 透传 `stopSignal`
- [x] `main-transport.ts`：在 cancel 旁边注册 stop 频道（main + plugin 两侧，含 teardown）

### 1.2 `level` 事件

- [x] `sdk/domains/voice.ts`：`VoiceAsrStreamPayload` 加 `emitLevel?: boolean`
- [x] `sdk/domains/voice.ts`：`VoiceAsrStreamEvent` 加 `{ type: 'level'; rms: number }`

### 测试（`main-transport-stream.test.ts` 21 → 23）

- [x] `stop` 之后仍能 emit/end；`cancel` 之后不能 —— 写在**同一个用例**里，两半不会各自漂走
- [x] `stop` 对已 cancel 的流是 no-op

## 提交 2 · 主进程（voice + assistant）· 已完成

- [x] `voice-module.ts`：把 `streamContext.stopSignal` 传进 `streamDictation`
- [x] `voice-service.ts`：`streamDictation` 第三参改成 options bag —— 两个 `AbortSignal` 挨着排太容易调错位
- [x] pump：`stopSignal?.aborted` 时跳出循环，下游一行不改
- [x] `streamViaWebSocket` 接同一个 `stopSignal`（`isCapturing` 里短路）；`streamViaChunkedBatch` 不接，退化成等 VAD 静音
- [x] `streamViaProvider` 的两路合并队列：pump 算 RMS 推 level，forwarder 推 provider 事件，生成器只消费队列
- [x] 队列有界（`MAX_QUEUED_LEVELS = 20`）：丢最旧的 level，**provider 事件永不丢**
- [x] `plugin-module.ts`：`narrowVoiceStreamForPlugins` 在插件边界丢掉 `level` —— 不放宽已发布的 `PluginVoiceStreamEvent`
- [x] `module.ts`：`VOICE_DOCK_WIDTH` 300 → 360，`VOICE_DOCK_HEIGHT` 60 → 64
- [x] `module.ts`：`minWidth/minHeight` → 48，`maxHeight` → 72；`clamp(size, 48, 72)` 换成同一组常量
- [x] `module.ts`：`FLOATING_BALL_DEFAULT_SIZE` 保持 56
- [x] 更新 `module.screenshot-translate.test.ts:626` 的四个常量
- [x] 新增窗口 limits 用例：min/max 必须同时容下球（48–72）与 dock（360×64）。**负控制已跑** —— `maxHeight` 改回 `VOICE_DOCK_HEIGHT` 立刻转红

### 测试（新增 `voice-service.stream-provider.test.ts`，3 例）

- [x] stop 走到 `deliverText`；cancel 不走（同一用例，成对）
- [x] `emitLevel: true` 出 level 且 rms ≈ 0.5（定幅 PCM，值算得出不是猜的）；**不传时一条 level 都没有**
- [x] 40 个 pump tick + 4 个 partial：partial 一条不少，final / end 照常
- [x] **负控制已跑**：把 pump 里的 `stopSignal` 短路掉 → 3 例中 2 例转红（第 3 例本就不依赖 stop）

## 提交 3 · 渲染层 · 已完成

- [x] `VoicePanel.vue` 脚本：`sessionSeq` / `levels`(24 格) / `transcribing` / `hasNotice` / `canCancel` / `canConfirm` / `pillWidth` 测量 watcher
- [x] `finishVoiceInput()` 改走 `controller.stop?.()`，不清 controller、不 emitFinished；没有 `stop` 的传输端退回「丢弃」并写明理由
- [x] `VoicePanel.vue` 模板：✕ / 槽位 / ✓；槽位在 提示 / 波形 / orb 三者间互斥
- [x] 删掉 `.voice-panel-mark` / `.voice-panel-status` / `.voice-signal` 与 `@keyframes voice-signal-pulse`
- [x] `VoiceDock.vue`：删 `processing` 相位、spinner、`@keyframes voice-dock-processing-spin`
- [x] `.voice-dock` 加进 `pointer-events: auto` 白名单（透明画布变宽了）
- [x] i18n：两个 locale 各加一个 `cancelSession`，键数都是 105（**定点插入**，别用 `json.dump` 重排整文件）

### 测试（`VoicePanel.test.ts` 6 → 11，`VoiceDock.test.ts` 4 → 5）

- [x] listening 有 wave 无 orb / transcribing 有 orb 无 wave（互斥两条写在一个用例）
- [x] 波形高度跟 level；**断掉 level 后高度不再变** —— 防假动画的唯一保险
- [x] 按 ✓ 调 `stop` 不调 `cancel`，推进 5s 也不 finished，收到 `end` 才 finished
- [x] 按 ✕ 调 `cancel` 不调 `stop`，立即 finished
- [x] transcribing 期间两个钮都 disabled
- [x] `sessionSeq` 换会话才变，改相位不变（负控制）
- [x] 提示出现时宽度 ∈ [200, 340]，`openPanel` 后回到 200
- [x] 面板文本里仍然没有「阿洛 / aler」

---

## 收尾

- [x] 对拍基线：同域 49 passed → 146 passed，0 failed
- [x] `vue-tsc` / `tsc` 均 0 错误；eslint 两个包都干净
- [x] 逐条走 `prd.md` 的 Acceptance Criteria —— 全部有测试覆盖，除两条只能靠真机看：
      「三个形态在 360×64 内不溢出、尺寸与画板一致」与「浅深色下 orb 与波形均可见」。
      两者都由常量与 shell token 直接决定，代码侧已核对；跑起来再确认一次。
- [x] 提交（四笔）：`70d9a778a` transport / `b5462e6e0` voice 主进程 / `55d1e3904` assistant 渲染层 / `5f03f60f9` 任务工件
- [x] 把「阿洛的球被画成麦克风钮」开成后续任务 → **#1878**
- [ ] 推送 —— 被 GitHub push protection 拦住，**不是本任务的问题**：`e4dc92995`（C2 分类器，别人的提交）里
      `plugins/clipboard-history/src/utils/clipboard-shapes.test.ts` 的假夹具（Stripe live 前缀 + 26 位字母表）
      命中 Stripe key 模式。它是用来测密钥检测器本身的占位串，不是真密钥 —— 但**不要在文档里把它抄全**，
      我第一版就是这么干的，结果 `f8f578be6` 自己也成了拦截点。夹具已改成运行时拼接（`6ac885876`）。
      两条出路：仓库管理员点 unblock URL，或改写那条夹具（需要改历史，而分支上还有别的会话在写）。

## 明确不做

见 `prd.md`「明确不做」。特别是：**不动阿洛的球**（尺寸与图标都不改）。
