# ④ 首页对话最小闭环

父任务：`.trellis/tasks/08-03-app-shell-ai-redesign`
依赖：子任务 ①（`08-04-shell-fixed-frame`）
设计基准：父任务 `design.md` 第 5 节；画板 `JVvAr`。

## 背景

代码里目前没有任何对话数据层：Drizzle schema 12 张表无 conversation / message，renderer 无对话 store，`/` redirect 到 `/setting`。`views/assistant/` 只有 FloatingBall 与 VoicePanel，`/intelligence/*` 是 AI 配置页而非对话。

主进程 AI 能力已具备（`main/modules/ai/`，53k 行），已有 `intelligence:api:stream` / `intelligence:api:invoke` / `intelligence:api:get-provider-model-options` 等通道。

## 目标

打通首页对话的最小闭环：能发出一条消息、收到流式回复、落库、刷新后历史仍在、侧栏按时间分桶列出历史。**不新写模型层**，复用现有 AI 通道。

## 范围

### 数据层

新增两张表 `conversations` / `conversation_messages`（父 design.md 5.1），走 `npm run db:generate` + `db:migrate`。标题由首条用户消息生成，**存全量，渲染层截断**。

### 通路

新增一组对话 transport（CRUD + 消息追加），与 `packages/utils/transport/sdk/domains` 下既有域 SDK 同构。回复走 `intelligence:api:stream`，失败兜底 `intelligence:api:invoke`。

### 路由

- `/` redirect `/setting` → **redirect `/home`**
- 新增 `/home`（空态）与 `/home/c/:id`（具体对话）

### 界面

- 空态：64px logo + `今天想做点什么？` + 720 宽 composer + 一行快捷 pill，竖向居中偏上（`padding-bottom 52`）
- Composer：`radius-2xl`、`$bg` + 1px `$border` + `0 2px 14px $shadow-color`、padding [16,16,12,16]、占位符 `塔芙来帮你做任何事`、ToolRow 左 `＋`/工具、右 mic/主色发送键
- 侧栏对话历史：按 `updated_at` 分桶 `今天 / 昨天 / 上周 / 上个月 / 近 3 月`，桶名作组头，**行内不渲染时间戳**
- TopBar ModePill 显示当前模型，接 `intelligence:api:get-provider-model-options`

### 不在本子任务范围

- 多轮上下文管理策略、工具调用、附件上传（`＋` 与 mic 本轮可为占位）
- 对话搜索、归档、重命名
- 快捷 pill 的实际动作（本轮为静态展示，点击填入 composer 即可）

## 验收标准

- [ ] 在空态输入一条消息并发送，能收到流式增量回复
- [ ] 该对话出现在侧栏历史「今天」桶下，点击可回到该对话并看到完整消息
- [ ] 重启应用后历史与消息仍在
- [ ] 历史标题超长时单行截断显示省略号，数据层未截字符串
- [ ] 分桶边界正确（跨天 / 跨周 / 跨月各验一次，可用改写 `updated_at` 的方式造数据）
- [ ] 未配置 AI provider 时给出可读的错误提示，不白屏、不静默失败
- [ ] 空态实测对齐画板：logo 64、Center gap 30、ComposerGroup gap 18、Composer 宽 720
- [ ] light / dark 双主题验过
- [ ] `pnpm lint` 与 `apps/core-app` 的 `npm run typecheck` 通过；迁移可在干净库上重放
