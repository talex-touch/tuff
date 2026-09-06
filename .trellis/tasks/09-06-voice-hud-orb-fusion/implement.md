# 执行计划 · 语音 HUD 融合 orb

> **状态（2026-09-06 07:32）：三层代码全部完成，验证全绿，尚未提交。**
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
- [ ] 提交（三笔，按上面的分层）
- [ ] 把「阿洛的球被画成麦克风钮」开成后续任务。**先建 issue 再引用编号**，不要凭空写号

## 明确不做

见 `prd.md`「明确不做」。特别是：**不动阿洛的球**（尺寸与图标都不改）。
