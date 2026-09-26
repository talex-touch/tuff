# Research: 现状——Home 输入框工具栏的模板、样式、状态来源与不一致清单

- **Query**: `HomePage.vue` 工具栏里 `+`（附件）、「权限 · 完全允许」胶囊、「Tuff 智能 高 ▾」模型胶囊、麦克风、发送 / 停止键（`.HomePage-SendBtn`）的模板与样式；各状态从哪来（`canSend`、`isStreaming`、语音、附件、权限、模型）；肉眼可见的样式不一致；可复用的 tuffex 零件。
- **Scope**: internal（只读；`HomePage.vue` 正被其他任务编辑）
- **Date**: 2026-09-26

行号约定：`HomePage.vue` 引用 **HEAD**（`git show HEAD:…`，2441 行，稳定）。工作区版本在 09:14 时为 2781 行，`09-25-send-split-fusion` / `09-25-home-assistant-push` 正在改；逐段比对过：工具栏模板只多了分裂用的 `.HomePage-DraftGhost`，工具栏 CSS（`.HomePage-ToolRow` 到 `.HomePage-SendBtn`）与 HEAD 完全一致，工作区行号整体后移约 160–340 行。

## Findings

### Files Found

| File Path | Description |
|---|---|
| `apps/core-app/src/renderer/src/views/base/home/HomePage.vue` | 工具栏模板 HEAD `:1372-1448`；样式 `:2108-2226`；状态计算 `:147-171`、`:223-293`、`:532`（`submit`）、`:648-735`（附件） |
| `apps/core-app/src/renderer/src/views/base/home/HomePermissionMenu.vue` | 权限胶囊与菜单（胶囊样式 `:215-257`，窄容器折叠 `:262-271`） |
| `apps/core-app/src/renderer/src/views/base/home/HomeModelMenu.vue` | 模型菜单；胶囊由调用方经 `#trigger` 插槽传入（`:401-406`），包一层 `display: contents` |
| `apps/core-app/src/renderer/src/views/base/home/HomeTopBar.vue` | 顶栏的另一颗模型胶囊与图标键（`:184-219`、`:251-275`），同页另一套控件语汇 |
| `apps/core-app/src/renderer/src/components/shell/MetaHintBadge.vue` | 按住 ⌘ 时显示的快捷键徽标；`placement="above"` 画在按钮**外部上方**（`:64-69`） |
| `apps/core-app/src/renderer/src/modules/conversation/useHomeConversation.ts` | `isStreaming` / `stop()` 语义（`:608-647`、`:663-665`、`:577-590`） |
| `apps/core-app/src/renderer/src/modules/conversation/useModelOptions.ts` | 模型胶囊文案来源 `resolvedChoice`（`:156`） |
| `apps/core-app/src/renderer/src/styles/shell-tokens.scss` | `--shell-*` 取值（亮 `:15-96`，暗 `:134-173`） |
| `apps/core-app/src/renderer/src/styles/accessibility.scss` | 全局焦点环 `*:focus-visible`（`:39-46`） |

### 模板结构（HEAD `HomePage.vue:1372-1448`）

```
.HomePage-ToolRow            (container: home-composer-tools / inline-size)
  .HomePage-ToolLeft
    input.HomePage-FileInput (display:none)
    button.HomePage-RoundBtn            ← + ；@click="fileInputRef?.click()"；图标 i-ri-add-line
    <HomePermissionMenu v-model:mode="agentToolsMode" @reset="resetRememberedApprovals" />
  .HomePage-ToolRight
    .HomePage-ModelSlot > <HomeModelMenu placement="top-end"> #trigger
        button.HomePage-ModelPill       ← TxIcon(:size=13) + ModelName + ModelEffort("高") + i-ri-arrow-down-s-line
    button.HomePage-RoundBtn.borderless ← 麦克风 i-ri-mic-line；**没有 @click**
    button.HomePage-SendBtn v-if="isStreaming"  ← i-ri-stop-fill；@click="conversation.stop()"；MetaHintBadge(stop)
    button.HomePage-SendBtn v-else :disabled="!canSend" ← i-ri-arrow-up-line；@click="submit"；MetaHintBadge(send)
```

### 各控件样式（逐项）

| 控件 | 尺寸 | 圆角 | 边框 | 填充 | 墨色 | 悬停 | 按压 | 过渡 | 出处 |
|---|---|---|---|---|---|---|---|---|---|
| `+` | 30×30 | full | 1px `--shell-border-strong` | 透明 | `--shell-text-regular` | 底 `--shell-surface` | 无 | `background-color/border-color .15s` | `:2122-2152` |
| 权限胶囊 | 高 30，`padding 0 12px`，gap 6 | full | 1px `--shell-border-strong`（review：`--shell-primary-border`；full：`--shell-danger-border`） | 透明（review：`--shell-primary-soft`；full：`--shell-danger-soft`） | regular（review：primary；full：danger，均 500） | 底 `--shell-surface` | 无 | `background-color/border-color .15s` | `HomePermissionMenu.vue:215-257` |
| 模型胶囊 | 高 **28**，`padding 0 11px`，gap 6 | full | 1px **透明** | `--shell-surface-2` | 名称 secondary/500，「高」muted，箭头 muted | **只变边框**为 border-strong | 无 | `border-color .15s` | `:2163-2198` |
| 麦克风 | 30×30 | full | 透明（`.borderless`） | 透明 | regular | 底 `--shell-surface` | 无 | 同 `+` | `:2142-2152` |
| 发送 | 30×30 | full | 透明 | `--shell-primary`；禁用 `--shell-surface-2` | `--shell-on-primary`；禁用 muted | `opacity .92` + `scale(1.06)` | `scale(.94)` | `transform .18s cubic-bezier(0.34,1.56,0.64,1)`、`opacity/background-color .15s` | `:2200-2226` |
| 停止 | 同发送（同一个类） | | | primary | on-primary | 同发送 | 同发送 | 同发送 | 同上 |

字号：`+` / 麦克风 / 发送 / 停止没有写 `font-size`，UnoCSS 图标是 `1em`（`uno.config.ts:147` 的 `presetIcons` 未设 `scale`），图标大小跟随按钮的计算字号；权限胶囊 12.5px（图标同）、模型胶囊 12px（箭头同）、模型图标 `TxIcon :size="13"`。

### 状态来源

| 状态 | 来源 | 说明 |
|---|---|---|
| `canSend` | `computed(() => draft.value.trim().length > 0 && !isStreaming.value)`（HEAD `:159`） | **附件不参与**：只有附件、没有文字时不能发送 |
| `isStreaming` | `useHomeConversation().isStreaming`，即内部 `streaming`（`useHomeConversation.ts:171`） | `send()` 在推入用户消息与占位的**同一次同步流程里**置 true（`:637`），所以按下发送后下一次渲染发送键就被换成停止键；`conclude()` 置 false（`:474`） |
| 停止 | `conversation.stop()` → `activeTurn.cancel()`（`:577-590`） | **同步**：取消控制器、无内容时删掉占位行、`conclude()`，`isStreaming` 立刻变 false，停止键当帧换回发送键 |
| 等首个 token | 无独立状态；消息行的思考球条件是 `message.status === 'streaming' && !message.content && !segmentsOf(message).length`（HEAD 模板 `TxThinkingOrb`） | 按钮可以用同一个条件派生「等待中」 |
| 分裂进行中 | 工作区新增 `splitting` ref（`submit()` 置 true，分裂的 `onRelease` 置 false） | 仅工作区（`09-25-send-split-fusion` 未提交） |
| 语音 | **无**：麦克风没有 `@click`，页面里没有任何语音状态 | 渲染层已有完整语音 SDK：`createVoiceSdk(transport).asrStream(payload, { onData })`，事件 `ready / partial / level(rms 0..1, ~10Hz, 需 emitLevel) / final / end`（`packages/utils/transport/sdk/domains/voice.ts:236-386`），`views/assistant/VoicePanel.vue` 是现成用法 |
| 附件 | `pendingAttachments`（HEAD `:648`）；`addFiles` 在流式期间直接 `return`（`:673-674`），拖放在流式期间不进入 dragover（`:716-717`） | `+` 在流式期间**仍可点**，选中的文件被静默丢弃；有附件的发送走旧的克隆飞行而不是分裂（工作区 `submit()`） |
| 权限 | `agentToolsMode` 读写 `appSetting.tools.agentToolsMode`（HEAD `:244-255`），经 `createRollbackSync` 同步主进程，失败回滚并 toast（`:271-283`） | 胶囊可能在一次失败同步后**自己跳回**上一档 |
| 模型 | `modelPill`：`resolvedModel` 有值时显示模型名 + 家族 / 提供方图标，否则「Tuff 智能」无图标（HEAD `:147-157`）；列表在挂载时加载（`ensureModelOptionsLoaded`） | 加载完成后文案从「Tuff 智能」变成具体模型名，宽度直接跳变 |
| 推理强度「高」 | `t('home.effortHigh')` 常量（HEAD `:1413`） | 没有任何状态；`HomeModelMenu.vue` 里也没有推理强度选项 |
| 快捷键 | `registerMainWindowCommandHandlers`：`send` 在 `canSend` 时可用、`stop` 在 `isStreaming` 时可用（HEAD `:1017-1024`） | 快捷键发送同样走 `submit()` |

### 不一致清单（可见的 + 可测的）

1. **高度三种**：`+` / 麦克风 / 发送 / 权限 30px，模型胶囊 28px；同页顶栏图标键 28px（`HomeTopBar.vue:257`）。tuffex 的对应物是 32px（`TxChatComposer` 发送 `:688-693`，`TxIconButton sm`，`TxButton md`）。
2. **材质三种**：`+` 与权限胶囊是「描边 + 透明」，麦克风是「无边 + 透明」，模型胶囊是「无边 + 灰底」，发送是「实心」。同一行出现描边与填充两套语言；输入框自己也有描边，于是描边按钮是「卡片里套描边」。
3. **悬停反馈三种**：`+`/麦克风/权限是底色，模型胶囊只变边框，发送是透明度 + 放大 1.06。
4. **悬停变色带过渡**：四个控件都给 `background-color` / `border-color` 写了 `.15s` transition，违反 `.trellis/spec/frontend/tuffex-design-rules.md:139-145`「Hover colour changes are immediate」。
5. **只有发送 / 停止有按压反馈**（`scale(.94)`），其余控件按下无反应；发送的按压与悬停放大共用一条 0.18s back-out 曲线，悬停放大后再按下是从 1.06 往 0.94 走。
6. **没有 reduced-motion 出口**：工具栏这几条 transition（含发送的 `transform`）不在 HEAD 的两个 `prefers-reduced-motion` 块里（`:1577-1582`、`:2382-2412`）。
7. **发送 ↔ 停止是两个元素 `v-if` 互换**：没有任何过渡；快捷键徽标也跟着销毁重建。
8. **焦点**：工具栏控件都没有自己的 `:focus-visible`，吃全局 `outline: 2px solid var(--focus-ring); outline-offset: 0`（`accessibility.scss:39-46`）。`--focus-ring` 是 `--tx-color-primary`，在 `.HomePage` 里被桥接成 `--shell-primary`（HEAD `:1518`）——发送键本身就是这个颜色，零偏移的焦点环贴在同色填充上看不见；该文件注释也写明「an accent-filled control now needs to state its own focus style」。发送键从可发送变成禁用时，原生 `disabled` 会让已聚焦的按钮失焦。
9. **图标尺寸不统一**：圆键图标跟随按钮计算字号，权限图标 12.5px，模型图标 13px，下拉箭头 12px。
10. **文字字号**：权限 12.5px，模型 12px；按规范 13–14px 才是可读控件文字（`tuffex-design-rules.md:11-19`）。
11. **对比度**（按 `shell-tokens.scss` 取值计算，底色按不透明 `--shell-bg` 近似；脚本 `/tmp/composer-controls-probe/contrast.mjs`）：

| 组合 | 亮 | 暗 | 12–13px 文字需 4.5 |
|---|---|---|---|
| 权限 review：primary 墨 on primary-soft | **3.61** | 5.05 | 亮色不达标 |
| 权限 full：danger 墨 on danger-soft | 4.82 | 4.53 | 勉强 |
| 模型名：secondary on surface-2 | **4.42** | 6.30 | 亮色差一点 |
| 「高」：muted on surface-2 | **2.99** | 4.05 | 不达标 |
| 发送图标：on-primary on primary | 4.09 | 5.24 | 图形 3:1 达标 |

   按 `tuffex-design-rules.md:117-123` 的配方（色相向主墨色混合）换算到 shell 令牌：`color-mix(in srgb, var(--shell-primary) 75%, var(--shell-text-primary))` 在亮 / 暗、静止 / 加深底上为 5.17 / 4.55 / 6.60 / 5.01；danger 75% 为 6.66 / 5.90 / 6.04 / 4.73（「加深底」按 soft 透明度 ×2 估算）。
12. **阴影无方向**：输入框 `box-shadow: 0 1px 2px …, 0 8px 24px …`（HEAD `:1975-1977`）x 为 0；tuffex 规则是左上光源 x:y = 1:2（`variables.scss:270-282`）。工具栏控件本身没有阴影。
13. **与顶栏语汇不一致**：顶栏控件是圆角矩形（`--shell-radius-sm/md`）、无边、悬停底 `--shell-surface-2`、静止墨 muted、图标 16px（`HomeTopBar.vue:184-219`、`:251-275`）；工具栏是全圆角 + 描边。
14. **与即将替换快捷胶囊的 `TxChoiceCard` 语汇不一致**：卡片用 ring 而非 border、填充 `--tx-fill-color-light`（在 `.HomePage` 里桥接为 `--shell-surface`）、悬停立即加深、选中态 `-light-9` 底 + 内描边（`choice-card/src/TxChoiceCard.vue:446-605`）。
15. **状态行为的不一致**：`+` 在流式期间可点但文件被丢弃；麦克风可点但无事发生；「高」看起来像可选状态但是常量；模型名加载后宽度跳变；权限同步失败时胶囊无过渡地跳回。

### 可复用的 tuffex 零件

| 零件 | 导入 | 能用在哪 | 限制 |
|---|---|---|---|
| `springSteps(p, v, target, preset\|spring, dt)` | `@talex-touch/tuffex/fusion-surface`（`fusion-surface/index.ts` 转出 `liquid/src/spring`） | 需要保留速度的逐帧形变（分裂已在用） | 逐帧 JS |
| `presets`（snappy / smooth / bouncy） | `@talex-touch/tuffex/liquid` 的 `liquidTransitionPresets` | 统一弹簧常量 | — |
| `resolveTransition()` / `easingFunction()` | **未导出**（只在 `liquid/src/spring.ts`，库内 `TxSortableList`、`text-morph` 内部用） | 把弹簧编译成 CSS `linear()` 字符串，交给 WAAPI / CSS | 要用得先在 `liquid/index.ts` 导出，或在 core-app 预编译字符串 |
| `useFlip`、`JELLY` / `jellyScale`、`vibrate` | `@talex-touch/tuffex/utils`（`utils/index.ts:1-13`） | 宽度 FLIP、挤压拉伸的量级、触感 | — |
| `TxModeChip` | `@talex-touch/tuffex/mode-chip` | 权限胶囊的「图标先换、文字模糊交叉、宽度跟随、色调仅在变化期过渡」编排（`TxModeChip.vue:23-143`） | 高 28px、圆角 8px 写死（`:206`、`:214`）；色调读 `--tx-color-*-light-9`，`.HomePage` 没桥接这些令牌 |
| `TxTextTransformer`（`fade`） | `@talex-touch/tuffex/text-transformer` | 模型名 / 权限文案的模糊交叉 | 默认 `morph` 模式要显式改 `fade` |
| `TxIconMorph` | `@talex-touch/tuffex/icon-morph` | 描边图标路径形变（`arrow-up`、`plus`、`x`…） | 只画描边；停止方块是填充图形 |
| `TxIconButton` | `@talex-touch/tuffex/button` | 图标键（xs 24 / sm 32 / md 40 / lg 48，`shape: circle`，按压 `scale(.96)`） | 悬停 / 颜色有 160ms transition（`icon-button.vue:105-109`），与「悬停立即」规则冲突 |
| `TxChatComposer` 的发送 / 附件样式 | 参考，不直接复用 | 「+ 无底、悬停只换墨；发送 32px 墨色实心，禁用 fill + placeholder 墨；按压 scale(.96) 120ms」（`chat/src/TxChatComposer.vue:629-700`） | 组件自带整套输入框 |
| `TxBorderBeam size="sm"` | `@talex-touch/tuffex/border-beam` | 停止键外圈流光的现成方案（圆角 32、线宽 1、1.96s，`border-beam/src/styles.ts:13-16`） | 自带调色板，与 Home 的 TuffIntelligence 渐变不同 |
| `TxThinkingOrb`（20px 预设，`listening` 等状态） | `@talex-touch/tuffex/thinking-orb` | 语音「听」态 / 等待态的小球 | 消息行已在用思考球，重复出现要谨慎 |
| `TxFusionSurface` / `fusionSurfacePath` | `@talex-touch/tuffex/fusion-surface` | 从某条边「长出」附属形状（凹圆角颈部） | 工具栏控件的形变用不上；分裂动画在用 |
| `TxChoiceCard` | `@talex-touch/tuffex/choice-card` | 快捷胶囊的替代者，定义了本页新的卡片语汇 | 由 `09-25-home-assistant-push` 第 6 步接入 |
| `--tx-elevation-1..5`、`--tx-ease-out-strong`、`--tx-ease-spring` | tuffex `style/variables.scss:278-304` | 阴影方向、强缓出 | — |

### Related Specs

- `.trellis/spec/frontend/tuffex-design-rules.md` — 字号（:11-19）、ring 而非 border（:73-85）、同心圆角（:87-91）、同色相墨色配方与实测要求（:113-123）、悬停立即（:139-145）、状态变化用 `.is-morphing` 门控颜色过渡（:147-166）、reduced-motion（:168-178）、不叠卡片（:219-221）。
- `.trellis/tasks/08-09-send-flight-layering/prd.md` — 层级刻度：飞行中的消息永远在输入框下面。
- `.trellis/tasks/archive/2026-09/09-23-composer-motion-reference/` — `TxModeChip` 与 `TxChatComposer` 新外观的来由与实测时序。

## Caveats / Not Found

- 设计稿 artboard `AHQQk`（空输入框的中性发送键）、`JVvAr`（Home 空态）只在代码注释里被引用；`.pen` 文件需要 pencil MCP 读取，本次没有读到。
- 图标实际像素（`1em`）取决于按钮的计算字号，本次没有在真实窗口里测（约束：不对正在使用的应用做 CDP）。
- 对比度按令牌取值计算，底色按不透明 `--shell-bg` 近似；会话态输入框是 72% 的半透明玻璃，真实对比度要在实现阶段对计算样式复测。
