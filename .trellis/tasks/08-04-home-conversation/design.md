# 技术设计 · 首页对话 R1（就地对话 + 内置 AI 通道）

范围见 `prd.md` 的 R1。设计基准：父任务 `design.md` 第 5 节；画板 `JVvAr`（空态实测值已在 `HomePage.vue` 落地，本轮不动空态尺寸）。

## 1. 通路选型

### 1.1 为什么是 `text.chat` + `stream`

| 事实 | 出处 |
|---|---|
| `text.chat` 注册为 `IntelligenceCapabilityType.CHAT` | `main/modules/ai/intelligence-module.ts:818` |
| 流式只对 `chat` 类型放行，其余类型 `resolveCapabilityMethod(type, true)` 返回 `null` | `main/modules/ai/intelligence-sdk.ts:382` |
| 流式通道是 `registerProtectedStream(intelligenceApiEvents.stream, …, 'intelligence.basic')` | `main/modules/ai/intelligence-module.ts:1254` |
| 渲染层 transport 实现了 `stream()` 并返回 `StreamController`（`cancel()` / `cancelled`） | `packages/utils/transport/sdk/renderer-transport.ts:988`、`transport/types.ts:158` |

因此渲染层唯一正确的调用形态是：

```ts
const sdk = useIntelligenceSdk()
const controller = await sdk.stream<string>('text.chat', { messages }, {
  onDelta: (delta) => { /* 追加 */ },
  onEnd: () => { /* 收尾 */ },
  onError: (error) => { /* 错误态 */ }
})
```

`sdk.stream` 内部会补 `options.stream = true` 并转发到 `intelligence:api:stream`，渲染层不需要自己拼通道名。

### 1.2 兜底

`sdk.stream` 在 transport 不支持流式时直接 `throw new TypeError`（`transport/sdk/domains/intelligence.ts:1524`）。这类失败与 provider 侧失败不同 —— 前者换成非流式仍能出结果，后者换了也白搭。

兜底条件：**流式路径抛错且尚未产出任何增量**。此时调 `sdk.text.chat({ messages })` 取一次性结果，整段写入同一条助手消息。已经产出增量后再失败，不兜底（会重复内容），直接把已产出的内容留下并标错。

### 1.3 错误可读性

主进程已有 `normalizeCapabilityInvokeError`（`intelligence-error-normalizer.ts`）负责把 provider 异常规范化。渲染层不重复归一，只做两件事：

- 取 `error.message`，为空时落 i18n 兜底文案
- 未配置 provider 属于最常见首启场景，文案要指向「设置 · AI」，而不是抛裸错误串

## 2. 状态模型

组合式函数 `useHomeConversation()`，放在 `renderer/src/modules/conversation/`（与 `modules/layout/useSecondaryNavigation.ts` 同构）。

```
messages: ConversationMessage[]   // { id, role, content, status, error? }
status: 'idle' | 'streaming'
```

`ConversationMessage.status`：`complete` | `streaming` | `failed`。助手消息在发送瞬间以 `streaming` + 空 content 入列，`onDelta` 追加，`onEnd` 转 `complete`，`onError` 转 `failed` 并挂 `error`。

状态机的三个不变量：

1. `status === 'streaming'` 时不接受新的 `send()` —— 由 UI 与组合式函数双重拦截，UI 的拦截是体验，组合式函数的拦截是正确性
2. 每次 `send()` 只持有一个 `StreamController`；`stop()` 取消它并把当前助手消息转 `complete`（保留已产出内容，不当作失败）
3. 传给 provider 的 `messages` 只含 `complete` 的历史 + 本轮 user 消息，不含正在流式的占位消息与失败消息

## 3. 视图切换

空态与消息态在 `/home` 内切换，判据是 `messages.length > 0`，不引入路由。

- 空态：现状不变（`HomePage-Center` 居中偏上、logo 64、gap 30）
- 消息态：`HomePage-Center` 让位给 `Stream + Composer` 的上下结构；composer 从「居中组的一员」变成「贴底的固定条」，宽度仍是 720 上限，与空态同一套 `.HomePage-Composer` 样式，不复制第二份

composer 在两个形态下必须是**同一个 DOM 节点**，否则输入焦点在首次发送时会丢失。实现上把 composer 提到 `HomePage` 直接子级，用外层容器类切换定位，而不是在两个分支里各写一遍。

## 4. 消息版式（画板实测）

画板已出，均在 `docs/design/corebox/v2.5.0.pen`：

| 画板 id | 名称 | 用途 |
|---|---|---|
| `lbZ9a` | Shell · 首页 · 对话中 · 浅色 v2 | 两轮对话 + 流式进行中 + 停止键 |
| `Jqm2L` | Shell · 首页 · 对话异常 · 浅色 v2 | 未配置 provider 的失败态在真实上下文里的样子 |
| `cJ3N6` | 对话态 · 状态与兜底 v2 | 等待 / 空回复 / 未配置 / 通用失败 / 用户停止 / 发送键三态 |

以下为实测值，不是估算：

| 元素 | 实测 |
|---|---|
| `Center`（对话态） | `gap 0`、`justifyContent start`、`padding [0,0,20,0]`；空态的 `gap 30` / `justifyContent center` / `padding-bottom 52` 仅属空态 |
| `Stream` | `fill_container` 双向、`clip`、`alignItems center` |
| `StreamInner` | 宽 720（与 composer 同轴）、`gap 20`、`padding [28,0,8,0]` |
| 用户消息 | 行 `justifyContent end`；气泡 `$surface-2`、`radius-lg 14`、`padding [10,14]`、`fs-md`、`lineHeight 1.6`、`fit_content` |
| 助手消息 | 行左对齐、`gap 10`；正文无填充、`$text-primary`、`fs-md`、`lineHeight 1.7`、`fill_container` |
| 等待态 | 三个 6px 圆点、`gap 5`、`$text-muted`、行高 22；静态稿用 opacity `1 / .55 / .3` 表达脉冲 |
| 错误块 | `$danger-soft` 填充、`radius-lg`、`padding [12,14]`、`gap 10`、`alignItems start` |
| 错误块图标 | lucide `circle-alert` 15px `$danger`，外裹 `padding-top 2` 对齐首行 |
| 错误块标题 | `fs-body` `$danger` `lineHeight 1.5` |
| 错误块 detail | `fs-sm` `$text-muted` `$font-latin` `lineHeight 1.5`；内容是主进程原始报错去掉 `[CODE]` 前缀 |
| 重试按钮 | 高 26、`padding [0,12]`、`radius-full`、1px `$danger-border` 内描边、文字 12.5 `$danger` |
| 发送键三态 | 空输入 `$surface-2` + `$text-muted` 箭头；可发送 `$primary` + `$on-primary` 箭头；生成中 `$primary` + 11×11 `radius 2` `$on-primary` 方块 |

失败态用 `danger` 而非中性色，依据是同文件既有先例：更新卡的 `TrustStrip`（`X8Ujf` / `rYhnl`）就是 `$danger-soft` 填充 + `$danger` 图标文字。detail 行留在 `$text-muted`，避免整块变成红墙。

### 4.1 与当前实现的差异（R1 收尾需补）

R1 的代码先于画板落地，以下三处需要对齐：

1. `styles/shell-tokens.scss` **没有 danger 系 token**。需补 `--shell-danger` / `--shell-danger-soft` / `--shell-danger-border`：light `#C4342B` / `#C4342B14` / `#C4342B3D`，dark `#E0655C` / `#E0655C26` / `#E0655C4D`；高对比两块按既有约定让位给 `--tx-*`。
2. `HomePage.vue` 的 `.HomePage-Error` 目前是 `$surface` + 1px `$border` 的中性卡（当时没有 danger token 可用），需改成 `danger-soft` 版；重试按钮描边同步换 `$danger-border`。
3. `.HomePage-SendBtn` 的禁用态目前是 `$primary` + `opacity .4`，画板是 `$surface-2` 底 + `$text-muted` 箭头 —— 这条偏差在空态画板 `AHQQk` 就已存在（子任务 ① 遗留），本轮一并纠正。

## 5. 兼容与回退

- 不改 `router.ts`、不改主进程、不加数据库迁移 —— R1 的全部改动落在 renderer 的两个新文件 + `HomePage.vue` + 两份 i18n
- R2 接手时，`useHomeConversation` 的 `messages` 由内存数组换成 transport 拉取，`send()` 内部多两次持久化调用，视图层不动
- 若 `intelligence.basic` 权限在某些环境下被拒，表现为 `send()` 的错误态，与 provider 未配置同一条路径，无需额外分支

## 6. R1.5 · 本机 `pi` CLI provider

### 6.1 为什么挂在 `LOCAL` 类型下

| 事实 | 出处 | 后果 |
|---|---|---|
| `hasUsableRuntimeCredential` 对 `LOCAL` 无条件返回 `true` | `intelligence-sdk.ts:170` | 无凭据也能通过可用性筛选，不必为 CLI provider 开特例 |
| `destinationFor` 对 `type === 'local'` 且无 `baseUrl` 判为 `'local'` | `privacy/provider-disclosure.ts` | 隐私披露自动归为本地，不误报外发 |
| `ALL_PROVIDERS` 已含 `LOCAL`，`text.chat` 支持该类型 | `intelligence-module.ts:795` | 能力注册表不用改 |

新增 provider **类型枚举**要动 `@talex-touch/tuff-intelligence` 外部包，代价明显更大。因此复用 `LOCAL`，在工厂里按 `metadata.origin` 分派：

```ts
// provider-factory.ts —— 与既有 createCustomProvider 分派 Nexus/Custom 同构
export function createLocalProvider(config) {
  return isPiCliProviderConfig(config) ? new PiCliProvider(config) : new LocalProvider(config)
}
```

### 6.2 子进程契约（实测，非推测）

拉起形态：`pi -p --mode json --no-tools --no-session -ne -ns -nc <prompt>`

各开关的理由：`-p` 非交互一次性退出；`--mode json` 输出 NDJSON；`--no-tools` 首页对话不授予任何工具；`--no-session` 不落 pi 自己的会话文件（状态以应用侧为准）；`-ne/-ns/-nc` 关掉扩展、skill、`AGENTS.md`/`CLAUDE.md` 发现，避免把用户仓库上下文带进闲聊。

stdout 为一行一个 JSON 对象，本轮只取三类：

| 行 | 取值 | 映射到 |
|---|---|---|
| `{"type":"message_update","assistantMessageEvent":{"type":"text_delta","delta":"…"}}` | `delta` | `IntelligenceStreamChunk.delta` |
| `{"type":"message_start","message":{"provider":"codex","model":"gpt-5.6-terra"}}` | `provider` / `model` | chunk 的 `provider` / `model` |
| `{"type":"message_end","message":{"usage":{"input","output","totalTokens"}}}` | usage | `IntelligenceUsageInfo`（`input→promptTokens`、`output→completionTokens`） |

`agent_settled` 是最后一行。进程非零退出且未产出任何 delta 时，把 stderr 尾部作为错误 message 抛出。

### 6.3 取消

渲染层 `StreamController.cancel()` → 主进程 `streamContext.isCancelled()` 为真 → `for await` 循环 `break` → 异步生成器被 `.return()` → provider 的 `finally` 执行。因此**杀子进程放在 `chatStream` 的 `finally`**，不需要额外的 signal 管线。这是本轮唯一可靠的取消点。

### 6.4 多轮上下文

实测 `pi` 的位置参数是**多条 user 消息**，不是 role 交替，无法用它注入 assistant 历史。本轮采用无状态拼接：历史按 role 前缀渲染进单条 prompt，system 指令走 `--system-prompt`（覆盖 pi 默认的编码助手提示词）。

不采用 `--session-id` 复用 pi 会话，理由是它会与 R2 的落库形成两份历史，且停止/重试后两边必然发散。

### 6.5 可执行文件探测

`intelligence-local-environment.ts` 的 `findExecutable` 只扫 `process.env.PATH`。Electron 从 Finder 启动时 PATH 通常只有 `/usr/bin:/bin:/usr/sbin:/sbin`，mise / volta / npm 全局目录都不在其中，仅靠它必然探测失败。因此探测需要在 PATH 之外补候选根（mise installs、`~/.local/bin`、`/opt/homebrew/bin`、npm 全局 bin）。
