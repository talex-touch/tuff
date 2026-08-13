# 发送动画层级：输入框恒在消息之上

父任务：`08-09-home-panel-layering-v2`

## Goal

Home 会话界面里，输入框永远是最上面一层，消息永远在它下面一层 —— **发送飞行动画期间也不例外**。

## 现状与根因

`animateSendFlight` 会把刚发出的气泡 `cloneNode` 一份，以 `position: fixed` 挂到 `.HomePage` 上，然后从输入框位置向上飞到落点。这个克隆节点写死了 `zIndex: '30'`（`apps/core-app/src/renderer/src/views/base/home/HomePage.vue:701`），而输入框那组 `.HomePage-ComposerGroup` 只有 `z-index: 1`（同文件 `:1914`）。

两者都不在任何祖先创建的层叠上下文里被隔开：`.HomePage-Center` 是 `position: relative` 但 `z-index: auto`，`.HomePage-Body` 只有 `overflow-y`，都不生成层叠上下文。所以 30 直接压过 1 —— 飞行中的气泡盖在输入框上面。

静止状态其实是对的（输入框是 `z-index: 1` 的定位元素，压得住流内的消息行），坏的只有动画这一段。

## 现有层级清单（改前）

| 元素 | 值 | 位置 |
|---|---|---|
| 离场的 stream（`.home-stream-leave-active`） | 0 | `HomePage.vue:1622` |
| 离场的问候语（内联 `headEl.style.zIndex`） | 0 | `HomePage.vue:608` |
| 输入框组（`.HomePage-ComposerGroup`） | 1 | `HomePage.vue:1914` |
| 待确认工具卡（`.HomePage-ConfirmSlot`） | 2 | `HomePage.vue:1732` |
| **发送飞行克隆（内联）** | **30** | `HomePage.vue:701` |

`TxConversationStream` 内部没有任何 z-index，不参与竞争。

## Requirements

1. 发送飞行克隆必须画在输入框**下面**：起飞瞬间气泡从输入框背后钻出来，而不是盖在它上面。
2. 静止态维持现状：输入框在滚动的消息之上。
3. Home 表面的层级不再散落成裸数字 + 内联字符串。定义一份成文的刻度（CSS 自定义属性），四个参与者全部改读这份刻度，包括那个内联赋值。
4. 待确认工具卡与输入框的相对关系不变（卡在输入框之上）—— 它不是消息，不受第 1 条约束。
5. 降级路径不变：`prefersReducedMotion()` 时本来就不产生克隆，这条路径不受影响。

## Acceptance Criteria

- [x] 代码里不再有 `zIndex: '30'` 这类与刻度脱节的魔数；克隆的层级来自同一份刻度
      —— `rg -n "z-index|zIndex" HomePage.vue` 现在只剩 `var(--home-z-*)` 与注释
- [x] 刻度里飞行克隆 < 输入框组，且有注释说明为什么（`HomePage.vue:1507-1521`）
- [x] 离场 stream / 离场问候语仍在最底（都取 `--home-z-leaving: 0`）
- [x] 待确认工具卡仍在输入框之上（`--home-z-confirm: 3` > `--home-z-composer: 2`，与改前 2 > 1 的相对关系一致）
- [x] eslint（包内配置）退出码 0、`vue-tsc -p tsconfig.web.json` 退出码 0、prettier `--check` 通过
- [ ] 人工走查：空会话发第一条 → 气泡从输入框背后升起，全程没有任何一帧盖住输入框；已有会话再发一条同样
- [ ] 人工走查：开启「减少动态效果」后发送仍正常落位

### 实现记录

克隆的层级从内联 `zIndex: '30'` 改成 `clone.classList.add('HomePage-FlightClone')` + 作用域样式。这样做除了消除魔数，还让「飞行克隆」和「输入框」的层级并排写在同一个 `.HomePage` 刻度里，改一个能立刻看到另一个。

作用域选择器能命中克隆节点：克隆源 `.HomePage-Message` 是 HomePage 模板里的元素，带 HomePage 的 `data-v-*`，`cloneNode(true)` 会复制属性。这条依赖有现成的正控 —— `.HomePage-Message.user { align-items: flex-end }` 是同一批作用域规则里的一条，用户截图里的用户气泡确实是右对齐的，说明这类规则在运行时命中。

即便该规则未命中，回退行为仍满足需求：克隆是 `position: fixed` 的定位元素，`z-index: auto` 落在绘制顺序第 6 层，而输入框是显式正 `z-index`（第 7 层），仍然压在克隆之上。

同理把 `headEl.style.zIndex = '0'` 换成 `is-leaving` 类，内联样式只保留必须动态测量的 `top` / `left`。

## 非目标

- 不动飞行动画的曲线、时长、回弹（`FLIGHT` / `FLIGHT_MS` / recoil / knock 这些一律不碰）
- 不动 `.HomePage-ConfirmSlot` 的定位方式
- 不重构 `animateSendFlight` 的克隆-替身机制本身

## Notes

- 这是本组四个子任务里唯一一个纯 CSS/层级的小改动，PRD-only 即可，不需要 `design.md` / `implement.md`。
- 与 ③ `08-09-home-preview-tabs`、④ `08-09-turn-info-float-panel` 无文件冲突（那两个动 `HomeSidePanel.vue` / `HomeTopBar.vue`，本任务只动 `HomePage.vue` 的层级）。
