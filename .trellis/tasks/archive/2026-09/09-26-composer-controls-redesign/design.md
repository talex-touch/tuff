# 设计：输入框工具栏重做与「灵动岛」发送键

设计的依据是 `research/proposal.md`（13:50 修订版，已按「托起」重对时序）。本文件只写**最终采用**的内容和它与调研的差异，细节按章节号去 proposal 里查，不在这里重抄。

## 边界

- 新代码全部放在 `apps/core-app/src/renderer/src/views/base/home/composer/`（proposal §5 的文件表）。`HomePage.vue` 只做接线：一段 `<ComposerToolbar>` 标签、`sendState` / 听写 / 推理强度的几行调用，再删掉旧工具栏样式、`fileInputRef` / `onFilePick` 和写死的 `t('home.effortHigh')`（proposal §5 末尾）。
- 推理强度的非视图部分已由 `09-26-reasoning-effort` 完成（utils、主进程、Nexus 服务端、`HomeModelMenu.vue` 的档位行、回合信息行）。本任务只接 `HomePage.vue` 的三处（见 `09-26-reasoning-effort/prd.md`「HomePage hand-off」），并让模型胶囊的后缀读 `reasoningPillLevel`。
- 听写走现有语音 SDK（`asrStream`，`research/dictation.md` §4），不另造通道，不改主进程。

## 已定的决策（全部）

| # | 采用 |
|---|---|
| D1 | 回复进行中，发送键向左长成约 72px 的墨色「■ 停止」胶囊，盖住麦克风位置；行里只有固定 32×32 的 `SendSlot` / `MicSlot`，变宽的是绝对定位的按钮，邻居一像素都不动（§2.6） |
| D2 | 发送 / 停止是同一个常驻按钮（`data-state`） |
| D3 | WAAPI + 弹簧编译的 `linear()`，不逐帧驱动（不和托起的驱动器抢主线程） |
| D4 | tuffex `liquid/index.ts` 导出 `resolveTransition`（一行导出 + 文档一句）；构建 dist 要拿 `/tmp/tuffex-build.lock` |
| D5 | 分层 blur-replace（iconify 箭头 + CSS 方块与文字） |
| D6 | 控件 32px，外缘距输入框 8px，与 24px 圆角同心 |
| D7 | core-app 自己的 `ComposerChip`，照搬 `TxModeChip` 时序，复用 `TxTextTransformer` |
| D8 | 组件放 core-app，不进 tuffex |
| D9 | 渐变光环自绘，复用 Home 色标（提成 `--home-live-stops`）与 `--home-glow-on` 门控 |
| D10 | 接听写：`asrStream({ delivery: 'none', emitLevel: true, cleanup: true, deliveryTiming: 'live' })`；D10-a 不受「语音输入」总开关管（规范补一句范围）；D10-b 只做点按切换；D10-c 不做 AI 整理；D10-d 听写中点发送 = 结束并发送；D10-e 静音自动停用主进程默认 1.5s；D10-f 听写中麦克风向左长成「听写胶囊」（波形 + 计时），与停止胶囊同一套语言，临时盖住模型胶囊（同样是绝对定位形变，邻居不动） |
| D11 | 模型胶囊的档位是真实推理强度（已由子任务实现），胶囊后缀按 `pillLevel` 规则 |
| D12 | 流式期间 `+` 可用（已放开） |
| D13 | 发送键悬停去掉放大，只立即加深 |
| D14 | 首 token 轻跳（1.06、240ms） |

## 与 proposal 的差异

- **D10-f 听写胶囊**是 proposal 之后才拍板的：麦克风在听写中向左长成胶囊（波形 + 计时），盖住模型胶囊。实现与停止胶囊同构：`MicSlot` 固定 32×32，胶囊是绝对定位的按钮 `right: 0` 向左长；宽度按「波形 + 计时」内容定（约 96–120px，以盖住模型胶囊的实际宽度为准，不挤动任何控件）；reduced-motion 下瞬变。`dictation.md` §4 里「电平条放在 32px 圆键里」的写法以本条为准改成胶囊。
- **D10-d**：听写中发送键不再是「不可发送」的 `empty`——点发送 = `dictation.stop()`，等 final 落进草稿后自动走 `submit()`；`deriveSendState` 的 `dictating` 分支据此调整（有字或正在听写时可按，按下的语义是「结束并发送」，可访问名跟着变）。
- 时序以 proposal §2.4 为准（托起的 `onClear` / `impact` / 占位揭开），不要再用已废弃的融合分裂钩子。

## 数据流

```
HomePage
  ├─ useModelOptions() ──────────────▶ modelPill { label, icon }
  ├─ useReasoningEffort() ───────────▶ setting（发送时读）、pillLevel（胶囊后缀）
  ├─ useComposerDictation({ draft, input, onTextChange, onNotice }) ─▶ state / levels / elapsed / active / toggle / stop
  ├─ deriveSendState({ hasText, streaming, awaitingFirstToken, blocked, dictating }) ─▶ sendState
  └─ <ComposerToolbar v-model:permission-mode :model :send-state :mic-state :mic-levels …
        @files=addFiles @send=submit @stop=conversation.stop() @mic=dictation.toggle() @reset-approvals />
submit(): canSend 守卫之后第一行 toolbarRef.launch()（起跳与托起同一刻）
watch(isStreaming): 开始流式时听写优雅结束（stop，final 仍进草稿）
```

## 风险与回退

- 胶囊宽度用 `width` 动画每帧布局一个脱离文档流的小盒子；若实机与托起驱动器争帧，换 proposal §2.6 的 `clip-path` 备选。
- 等待态同时有思考球、输入框活光、停止胶囊光环三处动态；实机过满时先去掉光环与方块的呼吸。
- 听写与全局 Fn HUD 可能同时采集（`dictation.md` Caveats）；本任务只保证输入框麦克风自身的会话正确结束。
- 回退：组件都是新文件，`HomePage.vue` 的接线是一处模板 + 几行脚本，整体可按文件回退。
