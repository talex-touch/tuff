# Research: 旧 pilot 的输入框与发送按钮（结构、状态、动效实现）

- **Query**: 旧 pilot（`apps/pilot`，`dab519726` 移除）的聊天输入框 / 发送按钮：结构、状态（空 / 可发送 / 发送中 / 可停止）、动效到底怎么实现的（CSS、关键帧、弹簧、渐变）。
- **Scope**: internal（git 历史，`git show dab519726^:<path>`）
- **Date**: 2026-09-26

读法：下文所有 `文件:行号` 都是 `git show dab519726^:apps/pilot/app/<文件>` 输出里的行号。

## Findings

### Files Found

| File Path（`apps/pilot/app/…`） | Description |
|---|---|
| `components/input/ThInput.vue`（1250 行） | 首页生产用的输入框：textarea、左侧 `+`、右下发送按钮、「等待受理中」态、全部动效 CSS |
| `components/input/ThInputPlus.vue` | `+` 按钮与悬停展开的能力菜单（分析文件 / 联网 / 思考 / 凝视 / 随机性） |
| `components/icon/AnimateIcon.vue` | 发送箭头外壳：点击时重放 SVG `<animate>` |
| `components/icon/svg/ArrowUpSvg.vue` | 发送箭头：SMIL 描边绘制动画 |
| `components/chat/ThChat.vue` | 消息区；「停止生成」是这里的**独立浮动胶囊**，不在输入框里 |
| `pages/index.vue` | `sendState` / `status` 的来源与切换点 |
| `composables/api/base/v1/aigc/completion-types.ts` | `IChatItemStatus` 枚举、`ISendState = 'idle' \| 'sending_until_accepted'`（:124） |
| `components/input/addon/InputHeaderFiles.vue` | 附件缩略图（上传中呼吸模糊） |
| `components/model/ModelSelector.vue` | 模型胶囊（悬停展开面板、箭头翻转） |
| `components/chat/EmptyGuide.vue` | 空态问候语与快捷提示胶囊（`fade-join` 入场） |
| `app.vue` | 全局工具类 `.transition-cubic`（:222）、`.fake-background`（:630） |
| `components/pilot/PilotChatWorkspace.vue` | 实验工作台，直接用 tuffex `TxChatComposer`（`:submitting="props.running"`），注释写明「生产首页仍用旧输入面」 |
| `components/button/*.vue` | 通用按钮（Arrow/Icon/Premium/Rhythm/Shining/Waving），与输入框无直接关系，但有可借鉴的渐变 / 流光写法 |

### 结构

`ThInput.vue:580-666`：一个绝对定位的毛玻璃卡片 `.ThInput`，子元素顺序为：

```
.ThInput  (:class center / hide / disabled(!canSend) / collapse / showSend / generating)
  .ThInput-Float        ← 字数将满提示（模糊浮现）
  ThInputAt / ThInputModel ← 「@模板」「/模型」浮层
  ThInputPlus           ← 左侧 32×32 的 +（悬停出菜单）
  .ThInput-Input        ← 附件头 + textarea（#main-input）+ 自绘 placeholder
  .ThInput-Send         ← 右下 32×32 发送按钮（绝对定位 bottom 8px / right .75rem）
      IconAnimateIcon > IconSvgArrowUpSvg
      <span v-if="sendState === 'sending_until_accepted'">等待受理中</span>   (:646)
```

发送按钮不是 `<button>`，是 `div.ThInput-Send @click="handleSend"`（:641）。

### 状态与来源

| 状态 | 条件（代码） | 发送按钮外观 |
|---|---|---|
| 空 | `showSend = text.trim() \|\| 已同步附件`（:60）为 false | `transform: scale(0)`——**按钮完全缩没**（:1219）；居中空态 `.center &` 例外，常显（:1152-1155） |
| 可发送 | `canSend = !上传中 && showSend && sendState !== 'sending_until_accepted'`（:61） | `scale(1)`，填充 `--el-color-primary-light-3`，外圈 `box-shadow: 0 0 2px 4px var(--el-color-primary-light-7)` 光环（:1221-1222） |
| 不可发送（有内容但上传中等） | `.disabled` = `!canSend`（:584） | 灰底 `--el-text-color-disabled`，光环收成 0，悬停 `not-allowed`（:1140-1150） |
| 发送中（等待受理） | `pages/index.vue` 在 `completion.send()` 前后置 `sendState = 'sending_until_accepted'`（:505、:551、:614）；收到 `onAccepted` / 状态离开 `WAITING` / `onReqCompleted` / `onError` 回 `'idle'`（:395-452） | **整个输入框收缩成一枚发光小胶囊**，按钮铺满它并显示「等待受理中」（见下节） |
| 可停止（生成中） | `ThChat.vue:106-108`：`status` 为 GENERATING / WAITING / TOOL_CALLING / TOOL_RESULT | 停止**不在输入框里**：`ThChat` 的 `.ThChat-StopGenerating` 胶囊在输入框上方弹出（:361-395），点击 `emits('cancel')` → `handleCancelReq()` `abort()`（`pages/index.vue:631-637`） |
| 失败 | `.error &`（模板里被注释掉，:578） | 按钮铺满输入框、变 `--el-color-danger` 并带同色外发光（:1083-1101） |

### 动效实现（逐条，含原文）

**1. 发送按钮的出现 / 按压 / 悬停**（`ThInput.vue:1184-1223`）——纯 CSS transition，按属性分别给时长：

```scss
.ThInput-Send {
  &:hover  { background-color: var(--el-color-primary); box-shadow: 0 0 2px 4px var(--el-color-primary-light-5); }
  &:active { transform: scale(0.95); }
  width: 32px; height: 32px; border-radius: 16px;
  transition:
    background-color 0.25s,
    box-shadow 0.5s,
    transform 0.5s,
    border-radius 0.25s,
    left 0.25s,
    width 0.25s;
  transform: scale(0);                       // 空时缩没；.showSend / .center 时 scale(1)
  background-color: var(--el-color-primary-light-3);
  box-shadow: 0 0 2px 4px var(--el-color-primary-light-7);
}
```

- 出现：`scale(0) → scale(1)`，0.5s，**默认 `ease`**（没写曲线），无弹簧、无回弹。
- 按压：`scale(0.95)`，同样走 0.5s ease——按下与松开都是 0.5s，按压反馈偏慢。
- 光环用 `box-shadow` 的 spread 做「外圈」，悬停时 spread 不变、颜色加深。

**2. 发送箭头：SMIL 描边重绘**（`ArrowUpSvg.vue:11-16`、`AnimateIcon.vue:9-29`）

```html
<path stroke-dasharray="14" stroke-dashoffset="14" d="M19 12H5.5">
  <animate fill="freeze" attributeName="stroke-dashoffset" dur="0.3s" values="14;0" />
</path>
<path stroke-dasharray="8" stroke-dashoffset="8" d="M5 12L10 17M5 12L10 7">
  <animate fill="freeze" attributeName="stroke-dashoffset" begin="0.3s" dur="0.2s" values="8;0" />
</path>
```

`AnimateIcon.handleClick()` 对容器内每个 `<animate>` 调 `beginElement()`：每次点击箭头先画杆（0.3s）再画头（0.2s）。它只在**鼠标点击**时重放；回车发送走 `handleInputKeydown → handleSend`，不重放。

**3. 「等待受理中」：整个输入框收缩 + 彩虹流光**（这就是老板说的「整体会收缩、渐变」）

输入框本体（`ThInput.vue:925-946`）：

```scss
.ThInput {
  &.generating {
    width: 20%;
    height: 50px;
    transition: 0.5s cubic-bezier(0.785, 0.135, 0.15, 0.86);   // easeInOutCirc
  }
  transition: 0.75s cubic-bezier(0.785, 0.135, 0.15, 0.86);     // 回到常态时
}
.ThInput-Input { .generating & { opacity: 0; pointer-events: none; } }   // :965-971
```

发送按钮在 `.generating` 下铺满整个（已收缩的）输入框并变透明（`ThInput.vue:1157-1182`），两层伪元素给出彩虹光：

```scss
.ThInput-Send {
  &::before { z-index: -1; opacity: 0; border-radius: 16px;
    animation: animate 1.5s linear infinite;
    transition: 0.25s cubic-bezier(0.785, 0.135, 0.15, 0.86);
    background: linear-gradient(135deg, #14ffe9, #ffeb3b, #ff00e0); }
  &::after  { z-index: -2; opacity: 0; border-radius: 16px; transform: scale(1.025);
    animation: animate 1.5s linear infinite; /* 同上渐变 */ }
  .generating & {
    &::before { opacity: 0.75; }
    &::after  { opacity: 0.5; }
    div, :deep(.PopoverComp) { opacity: 0; }        // 箭头隐藏
    top: 0; left: 0; width: 100%; height: 100%;      // 铺满输入框
    border-radius: 16px; background: transparent; pointer-events: none;
  }
}
@keyframes animate {                                   // :1225-1237
  0%   { filter: blur(10px) hue-rotate(0deg); }
  50%  { filter: blur(20px) hue-rotate(180deg); }
  100% { filter: blur(10px) hue-rotate(360deg); }
}
```

要点：

- 形变靠 **`width` / `height` 的 CSS transition**（布局属性，每帧重排），曲线 easeInOutCirc，**无回弹**；按钮从 32×32 角落「长」成整块用的是 `top/left/width/height` 的 transition（`left 0.25s, width 0.25s` 已列在按钮 transition 里，`top/height` 没列，所以这两项是瞬变）。
- 渐变是**固定三色线性渐变 + `hue-rotate` 转色 + `blur` 呼吸**，两层错位（`::after` 放大 1.025、透明度 0.5）做出光晕；颜色是写死的 hex，不随主题。
- 文案「等待受理中」是按钮里的一个 span，黑字 `op-75`，随状态 `v-if` 出现，没有入场动画。
- 发送中 `+` 按钮被隐藏：`.ThInput.generating .ThInput-Plus { display: none }`（:848-852）与 `ThInputPlus.vue:447-449` `opacity: 0`。

**4. 首次发送：输入框从中间落到底部**（`ThInput.vue:945-963`）

```scss
animation: cubic-bezier(0.075, 0.82, 0.165, 1) 1s inputBottomJoin;   // easeOutCirc
@keyframes inputBottomJoin { from { transform: translateY(-50vh) translateY(50%); } to { transform: translateY(0) translateY(0); } }
@keyframes inputJoin { to { opacity: 1; filter: blur(0); } }          // 居中态从 blur(10px)+透明 浮现，0.25s
```

**5. 「停止生成」浮动胶囊**（`ThChat.vue:341-395`）

```scss
.ThChat-StopGenerating {
  position: absolute; left: 50%; bottom: 8rem;
  transition: 0.5s cubic-bezier(0.785, 0.135, 0.15, 0.86);
  transform: translate(-50%, -50%) translateX(100px) scale(0);        // 隐藏：偏右 100px 且缩没
  border-radius: 18px; backdrop-filter: blur(18px) saturate(180%);
  &:hover { color: var(--el-color-danger); }
}
.ThChat-Container.stop .ThChat-StopGenerating { transform: translate(-50%, -50%) translateX(0) scale(1); }
.ThChat-Container.backToBottom.stop .ThChat-BackToBottom   { transform: … translateX(-35px) scale(1); }
.ThChat-Container.backToBottom.stop .ThChat-StopGenerating { transform: … translateX(35px)  scale(1); }
```

「回到底部」与「停止生成」两颗胶囊各自从左右 100px 外缩放飞入；两者同时出现时各让 35px 并排——一个简单的「一分为二」编排。

**6. `+` 按钮与能力菜单**（`ThInputPlus.vue:195-450`）

- 悬停 200ms 防抖（`debouncedRef(hover, 200)`）后菜单出现：`transform: translateY(8px) scale(0.98) → translateY(0) scale(1)`，`transition: cubic-bezier(0.175, 0.885, 0.32, 1.275) 0.35s`（easeOutBack，约 10% 过冲，:403-404）。
- 按压：`.ThInput-Plus .button:active { transform: scale(0.75); transition: 0.25s; }`（:421-424）——比发送按钮压得深得多，两者手感不统一。
- 菜单项 `v-wave` 水波纹（`plugins/v-wave.client.ts`）。

**7. 模型胶囊**（`ModelSelector.vue:56-231`）：悬停防抖 200ms 展开面板；面板 `scale(0.9) translateY(-10%) → 1`，同一条 easeOutBack 0.35s（:115-116）；胶囊里的 `i-carbon-chevron-up` 悬停 `rotate(180deg)`，0.25s（:143-147、:209-211）。

**8. 其它可借鉴的小写法**

- `.fake-background::after`（`app.vue:630-644`）：用伪元素铺一层可调透明度的底色（`--fake-opacity`），实现「毛玻璃上叠半透明底」。tuffex 至今仍沿用同名类（`TxButton` 模板有 `fake-background … transition-cubic`）。
- 快捷提示胶囊入场 `fade-join`（`EmptyGuide.vue:79`、`:102-112`）：0.25s，60% 处 `translateY(-2px)` 小过冲再回 0，按 `--d` 错峰 0.05s。
- 附件上传中：图片 `upload_shining` 2s 呼吸 `blur(5px) ↔ blur(2px)`（`InputHeaderFiles.vue:56-72`）。
- `ShiningButton.vue`：`background-size: 1000%` 的四色 45° 渐变做 `background-position` 流动（5s ease infinite）；`IconButton.vue.shining`：七色 `box-shadow` 环绕 + `rotate` 1s 线性旋转。

### 与当前 Home 的对照（仅事实）

| 维度 | pilot | 现 Home（`HomePage.vue`） |
|---|---|---|
| 空态发送键 | 缩没（`scale(0)`），居中空态常显 | 常显，灰色中性键（artboard `AHQQk` 的约定） |
| 发送→等待 | 整个输入框 width/height 收缩成 20% 宽发光胶囊 + 文案 | 输入框不收缩；发送键被 `v-if` 直接换成另一个停止键 |
| 渐变 | 三色线性渐变 + hue-rotate + blur 呼吸 | 流式时输入框自身的 conic 渐变光（oklch，四色），按钮无渐变 |
| 停止 | 输入框上方独立浮动胶囊 | 发送键原位换成停止键 |
| 曲线 | easeInOutCirc / easeOutBack / 默认 ease，均为 CSS 贝塞尔，无弹簧积分 | 发送键 `cubic-bezier(0.34,1.56,0.64,1)` 0.18s；分裂动画用 JS 弹簧 |

## Caveats / Not Found

- pilot 里**没有**弹簧积分、WAAPI 或 `linear()`：所有动效都是 CSS transition / keyframes / SMIL。
- 发送按钮不是语义化 `<button>`，没有焦点样式、没有 `aria-label`；「等待受理中」只在 `sending_until_accepted` 期间出现，受理后立刻恢复原尺寸，与「生成中 / 可停止」是两个独立阶段、两个位置。
- `.error` 状态类在模板里被注释（`ThInput.vue:578`），样式存在但实际不会触发。
- `PilotChatWorkspace.vue` 是实验页（首行注释：`Experimental workspace-only UI. The production homepage keeps the current chat surface.`），它的 `TxChatComposer` 不是 pilot 首页的输入框。
- 没有找到 pilot 的设计稿或动效规格文档；以上全部来自源码。
