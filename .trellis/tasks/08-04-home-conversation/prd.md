# ④ 首页对话最小闭环

父任务：`.trellis/tasks/08-03-app-shell-ai-redesign`
依赖：子任务 ①（`08-04-shell-fixed-frame`）
设计基准：父任务 `design.md` 第 5 节；画板 `JVvAr`。

## 背景

代码里目前没有任何对话数据层：Drizzle schema 12 张表无 conversation / message，renderer 无对话 store。`/` 已在子任务 ① 改为 redirect `/home`，`HomePage.vue` 落了画板 `JVvAr` 的空态与 composer，但**发送键是死的** —— 输入框只收字符，点发送没有任何行为。

主进程 AI 能力已具备（`main/modules/ai/`），`intelligence:api:stream` / `intelligence:api:invoke` / `intelligence:api:get-provider-model-options` 通道齐全，`text.chat` 以 `IntelligenceCapabilityType.CHAT` 注册，是唯一支持流式的能力类型。

## 目标

打通首页对话的最小闭环：能发出一条消息、收到流式回复、落库、刷新后历史仍在、侧栏按时间分桶列出历史。**不新写模型层**，复用现有 AI 通道。

## 分轮

目标按可独立验证的切片分轮推进，每轮跑完整的 check + commit。

| 轮次 | 范围 | 状态 |
|---|---|---|
| R1 | 首页就地对话：发送 → 内置 AI 通道流式回复 → 增量渲染 → 可停止 → 错误可读。**不落库、不加路由** | 通路已完成，缺可用 provider |
| R1.5 | 本地 `pi` CLI provider + 未配置引导：让首页在零凭据下真能出字 | 进行中 |
| R2 | 数据层与持久化：两张表 + 迁移 + 对话 transport + `/home/c/:id` | 已完成（`fe581a6be` 落地，`903bcf129` 修 PK 作用域） |
| R3 | 侧栏历史分桶 + TopBar ModePill 接真实模型列表 | 侧栏历史已完成（2026-08-06）；ModePill 半项由 08-06-model-menu-sources 承接——设计已把模型选择移进 composer 弹层，TopBar 不再放 ModePill |

R1 的产物必须是可弃的最小面：消息只在内存里，刷新即丢。R2 接手时把内存 store 换成 transport，不重写 UI。

## R1.5 缘起：链路是通的，缺的是 provider

R1 代码落地后实测**每一跳都通**，主进程日志（2026-08-05 00:14:41）证据如下：

```
[Intelligence] Streaming capability: text.chat
[ERROR] [PROVIDER_UNAVAILABLE:text.chat] [Intelligence] No enabled providers for text.chat
[Intelligence] Invoking capability: text.chat        ← 非流式兜底按设计触发了
[ERROR] [PROVIDER_UNAVAILABLE:text.chat] ...
```

即 `HomePage → useHomeConversation → sdk.stream → transport → intelligence:api:stream → TuffIntelligenceSDK` 全程无断点，兜底逻辑与错误渲染都按 R1 设计工作，11 个组合式单测全绿。

真正的阻塞在 provider 侧，三条既有路都不通：

| 路径 | 状态 |
|---|---|
| `aisdk-config` 内 6 个 provider | 全部 `enabled: false`、全部无凭据 |
| `tuff-nexus-default` | 需登录后从 Nexus dashboard 同步才启用；本机 AuthModule 无 token |
| `local-default`（Ollama） | 本机 11434 / 1234 均无监听 |

于是 `resolveAvailableProviders` 抛 `No enabled providers for text.chat`，UI 只能显示错误。

附带缺陷：该错误气泡是**死路**——只有「重试」，重试必然复现同一错误，首页没有任何通往 `/intelligence/channels` 的入口。

## R1.5 范围（本轮）

### 决策：接本机 `pi` CLI 作为零凭据 provider

本机已装 `pi` 0.83.0，实测 `pi -p --mode json` 零配置即可流式出字（走 codex / gpt-5.6-terra），输出为 NDJSON，含 `text_delta` 增量与 `usage`。它自带凭据，不需要用户在应用内填任何 key。

选它而不是新增云 provider 的理由：`hasUsableRuntimeCredential` 对 `IntelligenceProviderType.LOCAL` 直接返回 `true`（`intelligence-sdk.ts:170`），privacy 侧 `destinationFor` 对无 `baseUrl` 的 local 判为 `'local'`，两处都不必开口子。

### 交付物

- 主进程新增 `PiCliProvider`（type `LOCAL`），`chatStream` 拉起 `pi` 子进程并把 NDJSON 增量转成 `IntelligenceStreamChunk`
- `pi` 可执行文件探测不能只查 `process.env.PATH`——Electron 从 Finder 启动时 PATH 极简，需补 mise / homebrew / `~/.local/bin` 等候选根
- LOCAL factory 按 `metadata.origin` 分派 `PiCliProvider` / `LocalProvider`，与 CUSTOM 分派 Nexus / Custom 的既有写法同构
- 默认配置播种 `pi-cli-default`，探测到二进制时默认启用并绑定 `text.chat`
- 首页未配置态从死路改为可操作：给出通往 `/intelligence/channels` 的入口

### 不在 R1.5 范围

- 工具调用：`pi` 一律以 `--no-tools` 拉起，首页对话不授予任何工具权限
- 复用 `pi` 自身 session（`--session-id`）做多轮：本轮采用无状态拼接，历史以应用侧为准，避免与 R2 落库产生两份状态

## R1.5 验收标准

- [ ] 本机未配置任何云 provider 的前提下，首页发一条消息能收到流式增量回复
- [ ] 停止键能真正杀掉 `pi` 子进程，不留孤儿进程
- [ ] 未探测到 `pi` 时不报裸错，给出通往 `/intelligence/channels` 的可操作引导
- [ ] `pi` provider 有单测覆盖：NDJSON 增量解析、usage 归集、异常退出、取消
- [ ] `pnpm lint` 与 `apps/core-app` 的 `npm run typecheck` 通过

## R1 范围（本轮）

### 通路

渲染层经 `useIntelligenceSdk()` 调 `stream('text.chat', { messages }, handlers)`。流式不可用（transport 无 stream 能力、或流式调用抛错且未产出任何增量）时兜底 `text.chat` 一次性返回，兜底对用户不可见，只在控制台留痕。

上下文：当前会话内全部消息按顺序传入 `messages`，**不做裁剪或压缩**。超长由 provider 报错，走统一错误态。

### 界面

- 空态与消息态在同一 `/home` 路由内切换，不加路由、不改 `router.ts`
- 首条消息发出后：logo + 问候语 + 快捷 pill 退场，消息流出现，composer 沉到底部
- 用户消息与助手消息按 `--shell-*` token 渲染；助手消息流式增量追加，等待首个增量时给出可见的等待态
- 发送中发送键变为停止键，点击 `StreamController.cancel()`，已产出的增量保留

### 错误与边界

- 未配置 AI provider / provider 报错：错误落在该轮助手消息位置，可读、可重试，不白屏不静默
- 空输入与流式进行中不可重复发送
- `Enter` 发送、`Shift+Enter` 换行

### 不在 R1 范围

- 落库、路由、侧栏历史、ModePill 接真实模型（→ R2 / R3）
- 多轮上下文管理策略、工具调用、附件上传（`＋` 与 mic 保持占位）
- 对话搜索、归档、重命名
- 快捷 pill 的实际动作（保持填入 composer）
- Markdown 渲染（本轮纯文本按换行分段）

## R1 验收标准

- [ ] 在空态输入一条消息并发送，能收到流式增量回复（逐字可见，不是一次性整段）
- [ ] 发送后空态三件套退场、composer 沉底，同一路由内完成切换
- [ ] 流式进行中发送键为停止键，点击后停止且已产出内容保留
- [ ] 未配置 AI provider 时给出可读错误提示，不白屏、不静默失败
- [ ] 空输入不可发送；流式进行中不可再次发送
- [ ] `Enter` 发送、`Shift+Enter` 换行
- [ ] light / dark 双主题验过
- [ ] 组合式函数有单测覆盖：流式增量累积、取消、错误态、非流式兜底
- [ ] `pnpm lint` 与 `apps/core-app` 的 `npm run typecheck` 通过

## R2 / R3 验收标准（暂存）

- [ ] 该对话出现在侧栏历史「今天」桶下，点击可回到该对话并看到完整消息
- [ ] 重启应用后历史与消息仍在
- [ ] 历史标题超长时单行截断显示省略号，数据层未截字符串
- [ ] 分桶边界正确（跨天 / 跨周 / 跨月各验一次，可用改写 `updated_at` 的方式造数据）
- [ ] 空态实测对齐画板：logo 64、Center gap 30、ComposerGroup gap 18、Composer 宽 720
