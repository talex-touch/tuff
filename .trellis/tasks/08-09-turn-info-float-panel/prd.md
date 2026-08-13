# 本轮信息移入顶栏 ⋯ 浮层

父任务：`08-09-home-panel-layering-v2`

## Goal

把「本轮信息」（消息数 / 提供方 / 模型 / Token / 耗时 / 上下文压缩）从右侧常驻面板搬到顶栏右上角 ⋯ 打开的浮层里，用 ⋯ 来切换它的显隐。右侧面板腾出来给 ③ 的预览 tabs。

## 现状

- 「本轮信息」现在是 `HomeSidePanel.vue` 的第一段（`:60-69`），数据来自 `lastTurn`（`ConversationTurnMeta`）与 `messages.length`。
- 顶栏 ⋯ 按钮**当前完全是死的**：`HomeTopBar.vue:72` emit 了 `open-menu`，但 `HomePage.vue:1086-1091` 只绑了 `title` / `model-name` / `panel-open` / `toggle-panel`，没有任何地方监听 `open-menu`。
- 旁边的 `panel-right` 按钮是另一个开关，控制右侧面板，本任务不碰。

## Requirements

1. ⋯ 按钮点击后在其正下方（右对齐）打开一个浮层，内容是当前的「本轮信息」行集合。再点一次 / 点外部 / Esc 关闭。
2. 行集合与数据规则**原样搬迁**，不做增删改：
   - 消息数恒显示
   - 提供方 / 模型 有值才显示
   - Token 仅在 `totalTokens > 0` 时显示，且保留 `总数 (输入 + 输出)` 的拆分写法
   - 耗时按秒保留一位小数
   - 上下文压缩仅在非零时显示（零行会让每轮看起来都降级了）
   - 还没有回复时显示既有的 `home.panel.noTurn` 空状态
3. `HomeSidePanel.vue` 里的「本轮信息」段删除。**「工作过程」段先原样留着**，由 ③ 接手改成 tabs；本任务不要动它。
4. 复用应用已有的锚定原语，不自造定位/外点关闭/Esc 逻辑（`HomeModelMenu.vue` / `HomePermissionMenu.vue` 已经用 `TxDropdownMenu` 做过同样的事）。
5. 可访问性：⋯ 按钮带 `aria-expanded` 与 `aria-haspopup`，浮层可键盘关闭并把焦点还给按钮。
6. 文案键迁移后 zh-CN 与 en-US 两份必须键集合一致，不留孤儿键。

## Acceptance Criteria

- [x] ⋯ 按钮不再是死按钮：接进 `HomeTurnInfoMenu` 的 trigger 插槽；`open-menu` emit 已删，`rg -n "open-menu" apps/core-app/src` 只剩 `HomeModelMenu.vue` 里一句无关历史注释
- [x] 浮层内容与改前右侧面板的「本轮信息」段逐行一致 —— 逻辑整段搬进 `buildTurnInfoRows`，条件一字未改
- [x] 右侧面板里不再有「本轮信息」段；「工作过程」段仍在
- [x] 焦点归还逻辑与 `HomeModelMenu` 同构（仅键盘关闭时归还；外点关闭不抢焦点）
- [x] `panel-right` 开关行为完全没变（`toggle-panel` 与 `panelOpen` 未动）
- [x] zh-CN / en-US 的 `home.panel.*` 键集合一致，11 个键全部仍被引用，无孤儿
- [x] eslint（包内配置）退出码 0、`vue-tsc -p tsconfig.web.json` 退出码 0
- [x] 单测 10 条，`src/renderer/src/modules/conversation/` 全套 96 条全绿
- [ ] 人工走查：点 ⋯ 开浮层、点外部/Esc 关闭、无回复时显示 `noTurn` 空状态

### 实现记录

`buildTurnInfoRows` 的测试做过正控：把 `if (turn?.compactions)` 临时改成 `typeof … === 'number'`，「shows compactions only when the provider actually compacted」立刻失败，改回后重新全绿。这条断言不是套套逻辑。

一个原本没预料到的收获：`home.panel.title`（会话信息）仍然是右侧面板 `<aside>` 的 `aria-label`，所以它不是孤儿键，③ 继续沿用即可。

排查孤儿键时踩过一次自己的坑 —— 第一版用 `rg -c … | paste | bc` 拼计数，全部报 0 refs，是脚本坏了而不是真没引用。直接 `rg -n` 才看到 11 个键全部有引用。**统计脚本要先证明它能数出已知存在的东西。**

## 非目标

- 不往 ⋯ 里加别的操作（重命名 / 删除 / 导出等）；本轮只搬「本轮信息」
- 不改 `ConversationTurnMeta` 的字段或采集方式
- 不动右侧面板的开关按钮与开合动画

## 顺序约束

**必须先于 ③ `08-09-home-preview-tabs` 完成并合入。** 两个任务都改 `HomeSidePanel.vue`；③ 是把这个文件的剩余壳体换成 tab 容器，如果 ③ 先动手，本任务落地时会面对一个已经不存在的段落。
