# 设计：本轮信息移入顶栏 ⋯ 浮层

父任务：`08-09-home-panel-layering-v2` ｜ PRD：`./prd.md`

## 边界

改动全部落在渲染进程的 Home 视图层，不涉及主进程、不涉及 IPC、不涉及数据采集。`ConversationTurnMeta` 的字段与产生方式一个字都不动 —— 本任务只是把同一份数据换个地方显示。

## 组件划分

新增 `apps/core-app/src/renderer/src/views/base/home/HomeTurnInfoMenu.vue`，与 `HomeModelMenu.vue` / `HomePermissionMenu.vue` 同级同形：

- 对外形态与 `HomeModelMenu` 一致 —— 用 `#trigger` 具名插槽把触发按钮交给调用方，组件本身只负责浮层内容。这样 ⋯ 按钮仍然长在 `HomeTopBar` 里、仍然享受顶栏的 `-webkit-app-region: no-drag`，不用把按钮样式搬家。
- props：`turn?: ConversationTurnMeta`、`messageCount: number` —— 与现在 `HomeSidePanel` 的 props 完全相同，因为行构造逻辑是整段搬迁。
- 锚定 / 外点关闭 / Esc / 焦点归还全部交给 `TxDropdownMenu`（`@talex-touch/tuffex/dropdown-menu`），`placement="bottom-end"`（⋯ 在右上角，浮层右对齐展开）。

## 行构造逻辑的去向

`HomeSidePanel.vue:18-55` 的 `rows` computed 是本任务唯一有分支的逻辑，也是唯一值得测的东西。把它抽成纯函数放进 `apps/core-app/src/renderer/src/modules/conversation/turn-info-rows.ts`：

```ts
export interface TurnInfoRow { key: string; label: string; value: string }

export function buildTurnInfoRows(input: {
  turn: ConversationTurnMeta | undefined
  messageCount: number
  t: (key: string) => string
}): TurnInfoRow[]
```

抽出来的理由是可测：`vue-i18n` 的 `t` 以参数注入，测试传一个 `key => key` 的替身即可，不用挂载组件、不用起 i18n 实例。行为与现状**逐条等价**，不是重写：

| 行 | 出现条件 | 值 |
|---|---|---|
| `messages` | 恒定 | `String(messageCount)` |
| `provider` | `turn.provider` 真值 | 原样 |
| `model` | `turn.model` 真值 | 原样 |
| `tokens` | `typeof totalTokens === 'number' && > 0` | `总数 (prompt + completion)`，两侧缺省为 0 |
| `latency` | `typeof latencyMs === 'number'` | `(ms / 1000).toFixed(1)s` |
| `compactions` | `turn.compactions` 真值（0 不出行） | `×n` |

空状态 `home.panel.noTurn` 的条件同样保持 `!turn`。

## 数据流

```
HomePage.vue
  ├─ lastTurn (ConversationTurnMeta | undefined)   ← useHomeConversation
  ├─ messages.length
  └─ <HomeTopBar :turn="lastTurn" :message-count="messages.length">
         └─ <HomeTurnInfoMenu :turn :message-count>   ← 浮层内容
                └─ buildTurnInfoRows()
```

`HomeTopBar` 目前不接收会话数据，本任务给它加两个透传 prop。相较于让 `HomePage` 直接把浮层挂在顶栏外面，透传更简单：⋯ 按钮的位置、drag region、hover 态都已经在 `HomeTopBar` 里定义好了。

`HomeTopBar` 的 `open-menu` emit 随之删除 —— 它从来没有被监听过，现在触发职责归 `HomeTurnInfoMenu` 的 trigger 插槽，留着就是第二个死信号。

## 与 ③ 的交接

本任务只删 `HomeSidePanel.vue` 的第一段（`本轮信息`）与它的 `rows` computed、以及只服务于该段的样式类（`-Rows` / `-Row` / `-Key` / `-Value`）。第二段「工作过程」及其 `-Heading` / `-Empty` / `-Section` 样式**原样保留**，`HomeSidePanel` 仍然接收 `turn` / `messageCount`（③ 会重新定义它的 props）。

文案键：`home.panel.turnInfo` / `messages` / `provider` / `model` / `tokens` / `latency` / `compactions` / `noTurn` 全部跟着搬到浮层继续使用，键名不改 —— 改键名会让 zh/en 两份和潜在的第三方语言包同时失配，收益为零。`home.panel.title`（会话信息）留给 ③ 决定。

## 取舍

- **为什么不做成常驻的右上角浮动卡**：用户原话是「融合到三个点里 去切换」，切换动作的归属是 ⋯。常驻卡会和 ③ 的预览区抢右上角的视觉重量。
- **为什么不复用 `FlipDialog`**：那是模态对话框，会锁 body 滚动、上遮罩。本轮信息是随手一瞥的元数据，模态代价过重；`TxDropdownMenu` 才是同类交互（模型选择、权限选择都用它）。
- **为什么把 `rows` 抽成纯函数而不是留在组件里**：留在组件里就只能靠挂载测试来覆盖六条分支规则，而这六条规则正是本任务唯一会退化的地方（PRD 明确要求逐条等价搬迁）。

## 兼容性与回滚

- 无持久化、无 schema、无 IPC 契约变更，回滚就是 `git revert` 单个提交。
- 用户可见的行为变化只有一处：本轮信息不再常驻右侧，改为 ⋯ 点开。这是需求本身。
