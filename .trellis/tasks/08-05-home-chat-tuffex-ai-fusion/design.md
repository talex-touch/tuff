# ④ 主界面聊天融合 技术设计

PRD：`./prd.md`。基线实勘（2026-08-05）：08-04 R2 已在工作树落形但**未提交**——`/home/c/:id` + keep-alive 复用、`useHomeConversation` 增 routing/meta/reset/restore、`useConversationHistory`（list/load/persist/remove）、conversation transport（**整会话粒度**，`get` 全量返回消息，无分页）。该基线 29 例测试 + `typecheck:web` 全绿，④ 直接在其上叠加；提交时 08-04 文件与 ④ 文件的归属在提交计划里分列。

## 0. 定案

| 决策 | 结论 | 理由 |
|---|---|---|
| TxAiMessage 是否上首页 | **不上**。TxConversationStream 的 `item` 插槽承载 HomePage 自己的消息版式，助手内容换 TxStreamMarkdown | TxAiMessage 是「卡片+角色头」语言，与 shell v2 的平铺回复（无填充、无卡片）直接冲突；parts 组件（托盘等）不依赖 TxAiMessage，可直挂 |
| 触顶历史加载 | **本轮无 `loadOlder`**（不传 → 无 top zone） | transport 是整会话粒度，打开即全量；「更早消息」由构造保证不存在，虚拟化兜住长会话渲染。PRD 验收「触顶显示无更多历史且无跳动」的意图（无假加载、无跳动）由无 top zone 直接满足——记为偏差：loadOlder 留给 transport 分页化之后 |
| composer 换不换 TxChatComposer | **不换**，保留手写壳 composer | shell 设计语言 + 首发不丢焦点 + IME 守卫全在这份手写实现上；换件重新对齐成本高于收益。paste/drop 逻辑在 HomePage 本地实现，语义对齐 TxChatComposer（计数器防抖、files 抽取） |
| 附件的数据归宿 | `ConversationMessage.attachments?: AiAttachment[]`（类型来自 `@talex-touch/tuffex/ai-elements`），**内存态** | 不进 provider payload（`toProviderMessages` 只映射 content，降级由构造保证）；不持久化（`toSaveRequest` 白名单字段，自动丢弃）——刷新后附件消失，本轮接受并在 PRD 降级提示中体现 |

## 1. 消息流替换（HomePage.vue）

### 1.1 结构

```
HomePage-Stream (v-else 分支)
└── TxConversationStream  ref="streamRef" :items="messages" item-key="id"
                          :streaming="isStreaming" class="HomePage-Stream"
    └── #item="{ item, index }"
        ├── user   → HomePage-UserBubble（原样）
        │            + TxAttachmentTray（只读，item.attachments 存在时）
        │            + 降级提示行（附件存在时，muted 小字）
        └── assistant →
            ├── TxStreamMarkdown（content + streaming=item.status==='streaming'）
            ├── TxTypingIndicator（status streaming 且无 content，原样）
            └── HomePage-Error 块（原样，含 provider 引导 / retry；retry 条件仍是 index === messages.length - 1）
```

- `role="log"` 移到 TxConversationStream 外层容器（aria 不回退）。
- 空态分支（logo + 问候）不动；`v-if="isEmpty"` 切换保证新会话时 TxConversationStream 全新挂载（开底行为来自其 onMounted）。

### 1.2 滚动职责交接

删除手写滚动全套：`streamRef`(HTMLElement)/`handleStreamScroll`/`stickToBottom` 标志/`STICK_TO_BOTTOM_THRESHOLD`/内容长度 watch。交接映射：

| 原手写 | 新归属 |
|---|---|
| stick-to-bottom（阈值 80） | TxConversationStream 内建（同阈值） |
| 流式跟随 | live zone RO 跟随 |
| 回底 | 内建浮钮（HomePage 首次获得该 affordance） |
| composer 测高 → 流底部 padding | 保留 `--home-composer-height`，改喂 `.HomePage .tx-conversation-stream__scroller { padding-bottom: calc(var(--home-composer-height, 112px) + 28px) }` |
| — | 浮钮偏移：`.HomePage .tx-conversation-stream__pill { bottom: calc(var(--home-composer-height, 112px) + 32px) }`，否则被浮动 composer 盖住 |

- **会话切换**（keep-alive 复用实例，`restore()` 整体换 items）：watch 里 restore 成功后经模板 ref（`TxConversationStreamInstance`）调 `scrollToBottom()`——组件的 prepend 锚定对整体替换不触发（旧首 key 不在新列表），落底须显式。
- 720px 列宽：`item` 插槽内容套 `HomePage-StreamInner` 等价列宽样式（列宽约束从滚动容器移到逐项包裹层）。

## 2. token 桥接（HomePage `<style>` 内）

`.HomePage` 作用域一次性映射，级联进全部 tuffex 子组件；不改 tuffex：

```scss
.HomePage {
  --tx-color-primary: var(--shell-primary);
  --tx-color-danger: var(--shell-danger);
  --tx-color-success: var(--shell-primary);        // shell 无 success，工具卡 done 态借 primary
  --tx-text-color-primary: var(--shell-text-primary);
  --tx-text-color-secondary: var(--shell-text-muted);
  --tx-text-color-placeholder: var(--shell-text-muted);
  --tx-border-color: var(--shell-border-strong);
  --tx-border-color-light: var(--shell-border);
  --tx-border-color-lighter: var(--shell-border);
  --tx-fill-color: var(--shell-surface);
  --tx-fill-color-light: var(--shell-surface);
  --tx-fill-color-lighter: var(--shell-surface);
  --tx-fill-color-darker: var(--shell-surface-2);
  --tx-fill-color-blank: var(--shell-bg);
  --tx-bg-color: var(--shell-bg);
}
```

- 深浅主题由 shell token 自身翻转带动，tuffex `theme="auto"`（TxStreamMarkdown/mermaid/shiki 的结构主题）继续走根元素探测——两层各管各的：token 管色板，`auto` 管高亮/图表主题族。

## 3. composer 附件交互（HomePage 本地）

- 状态：`pendingAttachments = ref<AiAttachment[]>([])`；`File → AiAttachment` 转换：image/* 走 `URL.createObjectURL`（卸载/移除时 `revokeObjectURL` 防泄漏），其余 kind 'file'（name/size/mime）。id 用 `crypto.randomUUID()`。
- 入口三个：
  1. textarea `@paste`：clipboardData items 抽 File，命中则 `preventDefault`（阻 Finder 文件名文本）+ 入列；
  2. composer 根 `@dragenter/@dragover/@dragleave/@drop`：计数器防高亮抖动 + `is-dragover` 虚线态（对齐 TxChatComposer 语义）；
  3. 「+」钮：隐藏 `<input type="file" multiple>`，click 代理（从死按钮变文件选择入口，PRD 项）。
- 托盘：composer 内 input 上方 `TxAttachmentTray removable`，remove → 撤列 + revoke。
- 发送：`submit()` 把 `pendingAttachments` 随 `send(text, attachments)` 交给 conversation 后清空（所有权移交消息，revoke 延至消息级清理——本轮消息内存态，卸载时统一 revoke）。
- `canSend` 维持「文本非空」判据（纯附件不可发——payload 只有 string，空文本+附件会发出空 content）。

## 4. useHomeConversation 增量

- `ConversationMessage.attachments?: AiAttachment[]`（type-only import 自 tuffex）。
- `send(rawText: string, attachments?: AiAttachment[])`：附到 user 消息对象；`toProviderMessages()` 不动（只映射 role/content → 降级由构造成立）。
- `restore()`/`reset()`/persist 路径零改动（`toSaveRequest` 显式字段映射，attachments 自然不落库）。
- 测试：既有 29 例全绿 + 新增「附件挂上 user 消息」「provider payload 不含附件」两例。

## 5. i18n（zh-CN / en-US 两份）

- `home.attachmentNotSent`：降级提示行（『附件不会发送给当前模型』/ "Attachments are not sent to the current model"）。
- `home.attachRemove` / `home.attachCancel` / `home.attachPreview`：喂 TxAttachmentTray 的 removeLabel/cancelLabel/previewTitle。
- 既有 `home.attach`（「+」aria）沿用。

## 6. 行为不回退清单核验方式

PRD 的 R1/R1.5/R2 清单逐项：流式兜底、stop/retry、provider 引导、IME、焦点、`/home/c/:id` 恢复、settled-turn 持久化——全部不在本次改动路径上（conversation 管线零逻辑改动，仅 send 签名加参），以既有测试 + 手动清单收口。

## 7. 手动 review 门（合并 ①②③ 遗留）

`pnpm core:dev` 目验：流式逐块淡入/光标/代码高亮/mermaid 出图（①）、触控板惯性滚动/快速甩动无白闪/回底浮钮（②）、附件粘贴拖拽/预览/降级提示（③④）、深浅主题切换、reduced-motion。

## 8. 回滚

HomePage.vue 单文件为主战场 + useHomeConversation 小增量 + i18n 两文件 + 组合式新测试；无主进程改动、无迁移。逐文件 revert 即回滚。
