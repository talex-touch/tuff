# Research: pi 首页会话回复整段重复 N 次

- **Query**: 首页会话 pi 回复出现整段重复 5 次（同一段文本在单条气泡里连续重复，末段截断）；与 08-04「pi 首发偶发空回复」是否同源
- **Scope**: internal（代码）+ 本机实测（pi 0.83.0 真实 NDJSON 捕获）
- **Date**: 2026-08-05

---

## 结论（TL;DR）

**根因不在 talex-touch 的解析或渲染，而在于「一次 `pi` 进程里可以跑多轮同一个 prompt」这件事我们完全没有感知。**

`pi` 的 agent 层带有内建 auto-retry：某一轮 assistant message 以 `stopReason: "error"` 结束时，它会**把这条失败的 assistant message 从自己的 state 里删掉**，然后重跑整个 turn。但**已经写到 stdout 的那一轮的 `text_delta` 收不回来**。`PiCliProvider` 把 stdout 当成单调递增的一条文本流，把每一轮的 `text_delta` 全部 append 到同一个 buffer —— 于是用户看到答案重复 N 次，最后一遍因为最后一轮也被中断而截断。

同一根因还解释了 08-04 记录的「首发偶发空回复」：`pi --mode json` **即使每一轮都失败也退出码 0**（实测），所以 `pi-cli-provider.ts:162` 的 `code !== 0` 兜底永远不触发，应用拿到一个空字符串，渲染成空气泡。

两个症状是同一个缺陷的两个面：**我们把 pi 的「多轮尝试」事件流当成了「一轮输出」。**

---

## 一、症状

单条 assistant 气泡内，同一段文本（「我通过大量文本、代码和对话示例训练…」）连续重复 5 次，最后一段截断。

---

## 二、证据链

### 2.1 `pi --mode json` 把 session 的**每一个**事件原样打到 stdout

`~/.local/share/mise/installs/node/24.18.0/lib/node_modules/@earendil-works/pi-coding-agent/dist/modes/print-mode.js:80-84`

```js
unsubscribe = session.subscribe((event) => {
    if (mode === "json") {
        writeRawStdout(`${JSON.stringify(event)}\n`);
    }
});
```

没有任何过滤。`auto_retry_start` / `auto_retry_end` / `agent_end.willRetry` 这些「这一轮作废了」的信号**就在我们的 stdin 里**，只是没人读。

### 2.2 同一个文件里，pi 自己写明了正确语义

同文件 `:100-117`（`--mode text` 分支）：

```js
const lastMessage = state.messages[state.messages.length - 1];
if (lastMessage?.role === "assistant") {
    if (assistantMsg.stopReason === "error" || assistantMsg.stopReason === "aborted") {
        console.error(...); exitCode = 1;
    } else {
        for (const content of assistantMsg.content) { if (content.type === "text") writeRawStdout(...) }
    }
}
```

**text 模式只打印最后一条 assistant message。**失败的轮次一个字都不输出。这是 pi 官方对「答案是什么」的定义 —— 我们在 json 模式下把所有轮次拼在一起，语义上就是错的。

### 2.3 重试时 pi 会丢弃上一轮的 assistant message（但 stdout 收不回）

`dist/core/agent-session.js:2113-2145` `_prepareRetry()`：

```js
this._retryAttempt++;
if (this._retryAttempt > settings.maxRetries) { this._retryAttempt--; return false; }
const delayMs = settings.baseDelayMs * 2 ** (this._retryAttempt - 1);
this._emit({ type: "auto_retry_start", attempt: ..., maxAttempts: ..., delayMs, errorMessage: ... });
// Remove error message from agent state (keep in session for history)
const messages = this.agent.state.messages;
if (messages.length > 0 && messages[messages.length - 1].role === "assistant") {
    this.agent.state.messages = messages.slice(0, -1);   // <-- 只删 pi 自己的 state
}
```

- 预算：`dist/core/settings-manager.js:553-558` → `maxRetries: this.settings.retry?.maxRetries ?? 3`，`baseDelayMs ?? 2000`。默认最多 1 + 3 = 4 轮。
- `dist/core/agent-session.js:353`：`agent_end` 事件额外带 `willRetry: boolean`。
- `dist/core/agent-session.js:376-384`：**任何一轮成功后 `_retryAttempt` 归零**，所以一个 turn 里总轮次可以超过 4（这是「5 次」而不是「4 次」的最可能解释，见 §6）。

### 2.4 用户机器上装了一个把重试面放大的 pi 扩展

`~/.pi/agent/settings.json` 的 `packages` 里有 `npm:@narumitw/pi-retry@0.1.37`，自述为
「Public pi extension that **retries empty-detail provider errors and stalled streams**」。

`~/.pi/agent/npm/node_modules/@narumitw/pi-retry/src/retry.ts`：

- `:14` `DEFAULT_STALL_TIMEOUT_MS = 90_000` —— 流 90 秒没动静就 `ctx.abort()`（`:106-114`）。
- `:175-193` 把被 watchdog 掐断的 message 重写成 `stopReason: "error"`，让 pi 内建 retry 接手。
- `:198-217` 额外把 `Unknown error (no error details in response)`、`stream_read_error`、截断 JSON 也归类为可重试。
- `:224-228` 作者自己的注释：*"makes pi's built-in auto-retry path pick it up, **remove the failed assistant message from live agent state**, and call agent.continue()"*。

**这个扩展什么时候会加载？** `pi-cli-runtime.ts:248`：

```ts
...(allowedTools.length > 0 ? [] : ['--no-extensions']),
```

即 **工具开启（`--tools ...`）时不再传 `--no-extensions`，扩展全量加载**，stall watchdog 生效。工具关闭时扩展不加载 —— 但 **pi 的内建 retry（§2.3）与扩展无关**，429 / 5xx / overload 一样会重跑。所以扩展是「放大器」，不是根因本身。

### 2.5 实测复现：一次 pi 进程跑了 4 轮同一个 prompt

```bash
PI_RETRY_STALL_TIMEOUT_MS=700 pi --print --mode json --no-tools --no-session \
  --no-skills --no-context-files --system-prompt '...' '用中文写一段约120字的自我介绍，说明你是如何被训练的'
```

产物：`research/evidence-pi-retry-stall.ndjson`（36 行）。事件序列：

```
session
  entry_appended / agent_start / turn_start
    message_start(user) / message_end(user)
    message_start(assistant) / message_end(assistant, stopReason=error)
  turn_end / agent_end(willRetry=true)
auto_retry_start {attempt:1, maxAttempts:3, delayMs:2000}
  entry_appended / agent_start / turn_start / message_start / message_end(error) / turn_end / agent_end(willRetry=true)
auto_retry_start {attempt:2, delayMs:4000}
  ... 同上 ...
auto_retry_start {attempt:3, delayMs:8000}
  ... 同上 ...
agent_end(willRetry=false)
auto_retry_end {success:false, attempt:3, finalError:"Request aborted\n\n[stall-watchdog-retry] ..."}
agent_settled
```

**4 个 `agent_start` / `turn_start` / `turn_end` / `agent_end`，3 个 `auto_retry_start`，全部在同一个进程、同一条 stdout 里。**

对照健康运行 `research/evidence-pi-healthy-run.ndjson`：`agent_start` 恰好 1 次，无 `auto_retry_*`，`stopReason: stop`，107 个 `text_delta` 累出 149 字 —— **1:1，解析层本身没有重复**。

真实 `text_delta` 形状（健康运行首个 delta）：

```json
{"type":"message_update","assistantMessageEvent":{"type":"text_delta","contentIndex":0,"delta":"老板",
 "partial":{"role":"assistant","content":[{"type":"text","text":"老板"}],"api":"openai-responses",
 "provider":"codex","model":"gpt-5.6-terra","usage":{...}}}}
```

注意 `partial` 携带**当前这条 message 的全量累计文本** —— 但我们只读 `event.delta`，所以这不是重复源（见 §3）。

### 2.6 用真实解析器验证 app 侧的累加行为

把 §2.5 的事件结构（补上每轮的 `text_delta`）喂给 `apps/core-app/src/main/modules/ai/providers/pi-cli-runtime.ts` 的真实 `parsePiCliLine`：

```
answer emitted by model, per attempt: "我通过大量文本、代码和对话示例训练。"
attempts in the NDJSON stream          : 4
parser surfaced any reset/retry signal : NO
accumulated content length             : 72 (= 4x the answer)
accumulated content                    : 我通过大量文本、代码和对话示例训练。我通过大量文本、代码和对话示例训练。我通过大量文本、代码和对话示例训练。我通过大量文本、代码和对话示例训练。
```

**4 轮 → 4 倍文本，且解析器一个作废信号都没有透出。**

### 2.7 姊妹症状：json 模式恒退出 0

两次实测（全失败的重试运行、健康运行）**退出码都是 0**。`print-mode.js:100-117` 只有 `mode === "text"` 分支才会 `exitCode = 1`。

于是 `pi-cli-provider.ts:159-166`：

```ts
const code = await exited
if (code !== 0 && !emittedDelta) { throw new Error(...) }
```

在「4 轮全失败、0 字输出」的运行里 **`code === 0`，不抛错**，接着 yield `{done:true}` 空内容 → `useHomeConversation.ts:321-331` 的 `complete()` 看到空 content → `status = 'failed'` + `CONVERSATION_ERROR_EMPTY_RESPONSE`。**这就是 08-04 的「首发偶发空回复」**，用户看到的是一个没有任何原因说明的失败气泡，而真实原因（`auto_retry_end.finalError`）就在被丢弃的那一行 JSON 里。

---

## 三、已排除的嫌疑（逐条，附行号）

| 排查路径中的嫌疑 | 判定 | 依据 |
|---|---|---|
| `parsePiCliLine` 把 message 级全量文本当增量 append | **排除** | `message_update` 分支在 `:358`（无 `assistantMessageEvent`）和 `:389`（未知子类型）都提前 `return null`，**永远不会落到** `:419` 的 `message_start\|message_end\|turn_end` 分支；而该分支 `:419-430` 只读 `provider` / `model` / `usage`，不读任何文本。全流程只有 `:360-363` 的 `text_delta` 贡献文本。健康运行实测 107 delta ↔ 149 字，1:1 无倍增 |
| 一次会话 spawn 多次 pi | **排除** | 整个 `modules/ai/` 只有一处 `spawn(`（`pi-cli-provider.ts:91`），由 `chatStream` 每次调用一次（`:112`）。重复发生在**单个进程内部** |
| 渲染层 `fallback()` 与 stream 双写 | **排除** | `useHomeConversation.ts:349` 是**赋值** `assistant.content = result.result`，不是 `+=`；且 `onError`（`:393-400`）只在 `received === false` 时才调 `fallback`。它无法把内容追加到已流式落地的文本上 |
| 主进程 router 的 provider fallback 重跑 | **排除** | `intelligence-sdk.ts:1018-1025`：`selectedProviderEmittedDelta` 为真时直接 rethrow，绝不在已出 delta 后改跑别的 provider；fallback 循环成功即 `return`（`:1044`） |
| transport 把同一事件投递两次 | **排除** | `sdk.stream` 走 `intelligenceApiEvents.stream`（`packages/utils/transport/sdk/domains/intelligence.ts:1537-1562`），`contextStream` 走 `intelligenceContextEvents.stream`（`:1802-1821`），是两个不同事件；首页只用前者 |
| pi-ai 层的 provider retry 造成同一 message 内重复 | **排除** | `@earendil-works/pi-ai/dist/utils/provider-retry.js:74` `maxRetries = options.maxRetries ?? 0`，且重试的是**请求本身**（连接/429），发生在流开始之前，不会重发已推送的 delta |

---

## 四、最小修复方案

核心原则：**`auto_retry_start` = 「此前本轮流出的文本已被 pi 作废，丢弃它」**。

不要用 `message_start` 做重置边界 —— 工具开启时 pi 一个 turn 内合法地产生多条 assistant message（text → toolCall → toolResult → text），那些**必须**拼接。只有 `auto_retry_start` 才表示 pi 已经把上一条从自己 state 里删了。

好消息：`partEvent` 这条链路 **provider → router → transport → renderer 已经是泛型贯通的**，加一个 kind 不需要动任何传输代码。

### 改动点（5 处，按数据流顺序）

**1. 类型：加一个 part event kind（两份拷贝都要改）**

- `packages/tuff-intelligence/src/types/intelligence.ts:562-575`
- `packages/utils/types/intelligence.ts:522-535`（**是独立拷贝，不是 re-export**，内容当前逐字相同）

```ts
export type IntelligencePartEvent =
  | { kind: "text-reset" }        // 新增：此前流出的文本已被上游作废
  | { kind: "reasoning-start" }
  | ...
```

> `packages/tuff-intelligence/dist/index.d.ts` 是产物，改完需要重新 build 该包。

**2. `apps/core-app/src/main/modules/ai/providers/pi-cli-runtime.ts`** —— 在 `parsePiCliLine` 末尾 `return null`（`:434`）之前加：

```ts
if (type === 'auto_retry_start') return { partEvent: { kind: 'text-reset' } }
```

**为什么这是根因而不是症状**：这一行不是「过滤掉重复文本」，而是补上我们从一开始就漏掉的一个协议事件。pi 明确广播了「刚才那轮不算」，我们此前把它连同其它未知类型一起丢进 `return null`。

**3. `apps/core-app/src/main/modules/ai/providers/pi-cli-provider.ts`**

- `chatStream`（`:130-157`）本身**无需改动**：`:138-146` 已经原样转发 `partEvent`。
- `chat()`（`:192-199`）累加 `content += chunk.delta` 时要响应重置：遇到 `chunk.partEvent?.kind === 'text-reset'` 则 `content = ''`。
- `emittedDelta`（`:119` / `:149` / `:162`）同样要在重置时清掉，否则「文本全被作废」的运行仍会被当成「已经给过用户内容」而吞掉错误。

**4. `apps/core-app/src/main/modules/ai/intelligence-sdk.ts`** —— router 自己维护 `accumulated`（`:930` 声明，`:982` 累加，`:995-1007` 作为 `end` 事件的 `result` / `content`）。转发 `text-reset` 时（`:971-980` 的 part 分支）需要 `accumulated = ''`，否则 `end.result` 仍是重复版本。

**5. `apps/core-app/src/renderer/src/modules/conversation/useHomeConversation.ts`**

- `handlePartEvent`（`:240-292`）加 `case 'text-reset'`：`assistant.content = ''`、清空 parts（用 `parts.length = 0` 保持响应式数组身份）、`reasoningStartedAt = null`。
- 注意 `onPartEvent`（`:375-384`）会在调 `handlePartEvent` 前把已有 content 播种成首个 text part；`text-reset` 最好在这个播种分支**之前**短路处理，避免先播种再清空的无谓抖动。

### 独立的第二处修复（对应空回复症状）

`parsePiCliLine:419-430` 目前完全忽略 `message.stopReason`，`auto_retry_end` 也被丢弃。建议：

- 透出最后一条 assistant `message_end` 的 `stopReason`，以及 `auto_retry_end` 的 `success` / `finalError`；
- `pi-cli-provider.ts:159-166` 不再只看退出码：**当整段运行没有存活文本、且最后状态是 error/aborted 时抛出带 `finalError` 的错误**。

这样「重试全失败」会变成一条有原因、可重试的失败，而不是当前那个无解释的空气泡。

### 可选的纵深防御（1 行，非根因修复）

`pi-cli-provider.ts:90-104` 的 spawn env 里加 `PI_RETRY_STALL_TIMEOUT_MS: '0'` —— 扩展在 `retry.ts:16,57` 读这个环境变量，`0` 即关闭 90 秒 stall watchdog。理由：watchdog 是给交互式 TUI 设计的（用户能看到「🔁 retrying」状态条），在无头 app 里它只会静默把输出翻倍。**但这不关闭 pi 内建 retry**，所以只能减少发生频率，替代不了上面的修复。

---

## 五、验证方式

1. **单测（解析层）** —— 扩 `apps/core-app/src/main/modules/ai/providers/pi-cli-runtime.test.ts`：
   - `parsePiCliLine('{"type":"auto_retry_start","attempt":1,"maxAttempts":3,"delayMs":2000}')` 返回 `{ partEvent: { kind: 'text-reset' } }`；
   - 把 §2.6 的 4 轮序列做成 fixture，断言累加结果是 1 份而不是 4 份（该 harness 已验证过当前代码给出 4x）。
2. **回归护栏（不能误伤工具循环）** —— 断言单独的 `message_start`（assistant）**不**产生 `text-reset`；一个 `text → toolCall → toolResult → text` 序列的文本仍然拼接。
3. **单测（渲染层）** —— `apps/core-app/src/renderer/src/modules/conversation/useHomeConversation.test.ts`：deltas → `text-reset` part event → 更多 deltas，最终 `content` 与 `parts` 只含第二批。
4. **端到端复现** —— `PI_RETRY_STALL_TIMEOUT_MS=700 pi --print --mode json ...`（§2.5 命令）可稳定造出 3 次重试；修复后同一条 NDJSON 喂进 provider 应只产出最后一轮的文本。
5. **空回复分支** —— 用 `research/evidence-pi-retry-stall.ndjson`（全失败、退出码 0、零文本）驱动 provider，断言它**抛错并带上 `finalError`**，而不是静默返回空串。

---

## 六、Caveats / 未能确证的部分

- **「5 次」这个具体次数没有精确对上。** 默认预算是 1 + `maxRetries(3)` = 4 轮。两个可能的解释：(a) `agent-session.js:376-384` 在任一轮成功后把 `_retryAttempt` 清零，一个 turn 内因此可以获得新的重试预算，总轮次可超过 4；(b) 用户 settings 里的 `retry.maxRetries` 被调过（当前 `~/.pi/agent/settings.json` 未显式设置，取默认 3）。**机制已确证，次数未逐一对齐** —— 建议修复后仍保留一条 log，记录每次 `auto_retry_start` 的 `attempt`/`maxAttempts`。
- **我没有捕到「重试轮次里带真实文本」的实盘 NDJSON。** 强制 700ms stall 会在首 token 之前就掐断，所以复现文件里各轮都是 0 delta。文本重复这一段是由「健康运行的 `text_delta` 形状」+「重试结构」+「真实解析器的 4x 累加输出」（§2.6）三者合成证明的，不是直接观测。若要一份完整实盘证据，可在 app 里把 stall timeout 设到能让首 token 先落地、再触发中断的窗口（依赖网络抖动，非确定性）。
- **`agent_settled` 目前被解析成 `{done:true}` 但无人使用** —— `chatStream` 读到 stdout EOF 为止，从不看 `event.done`。不影响本 bug，但如果后续要在「pi 还会重试」期间抑制 UI 收尾，`agent_end.willRetry` 比 `agent_settled` 更合适。
- **本机 pi 在诊断期间自更新过一次**（`bin/pi` 符号链接时间戳 23:41，期间一次调用报 ENOENT）。所有结论基于 **pi 0.83.0**；`@earendil-works/pi-coding-agent` 升级后需重新核对 `print-mode.js` 与 `agent-session.js` 的事件契约。

---

## 七、相关文件索引

| 路径 | 说明 |
|---|---|
| `apps/core-app/src/main/modules/ai/providers/pi-cli-runtime.ts` | `parsePiCliLine`（`:338-435`）、`buildPiArgs`（`:229-260`，`:248` 决定扩展是否加载） |
| `apps/core-app/src/main/modules/ai/providers/pi-cli-provider.ts` | spawn（`:91`）、读流循环（`:130-157`）、退出码兜底（`:159-166`）、`chat()` 累加（`:192-199`） |
| `apps/core-app/src/main/modules/ai/intelligence-sdk.ts` | router `stream`（`:842-1061`）、`accumulated`（`:930`/`:982`）、provider fallback（`:1010-1057`，已排除） |
| `apps/core-app/src/renderer/src/modules/conversation/useHomeConversation.ts` | `handlePartEvent`（`:240-292`）、`onDelta`（`:364-374`）、`fallback`（`:345-358`，已排除） |
| `packages/tuff-intelligence/src/types/intelligence.ts:562` / `packages/utils/types/intelligence.ts:522` | `IntelligencePartEvent` 的两份独立拷贝 |
| `packages/utils/transport/sdk/domains/intelligence.ts:1537-1562` | 渲染侧 `stream` 的事件分发（`onPartEvent` 在 `:1553`） |
| `apps/core-app/src/main/modules/tool-gateway/index.ts:84-91` | `getRuntimeConfig()` —— 决定 `--tools` 是否出现，进而决定扩展是否加载 |
| `research/evidence-pi-retry-stall.ndjson` | 实测：一次进程 4 轮 + 3 次 `auto_retry_start`，退出码 0 |
| `research/evidence-pi-healthy-run.ndjson` | 实测：健康运行，1 次 `agent_start`，107 delta ↔ 149 字 |

### 外部（pi 0.83.0，本机安装路径）

- `~/.local/share/mise/installs/node/24.18.0/lib/node_modules/@earendil-works/pi-coding-agent/dist/modes/print-mode.js:80-117` —— json 模式无过滤转储；text 模式只取最后一条 assistant message
- `.../dist/core/agent-session.js:353`（`agent_end.willRetry`）、`:376-384`（成功后重置计数）、`:388-399`（`_willRetryAfterAgentEnd`）、`:2113-2145`（`_prepareRetry`）
- `.../dist/core/settings-manager.js:553-558` —— `maxRetries ?? 3`、`baseDelayMs ?? 2000`
- `~/.pi/agent/npm/node_modules/@narumitw/pi-retry/src/retry.ts` —— stall watchdog + 可重试分类扩展
- `~/.pi/agent/settings.json` —— `packages` 中的 `npm:@narumitw/pi-retry@0.1.37`

---

## 八、主会话复审：按流式协议最佳实践重定形（2026-08-06）

§四的 `text-reset` 方案有一个**工具轮次缺陷**：pi 重试只删除**最后一条** assistant message，而 §4.5 的渲染层处理是 `content = ''` + `parts.length = 0` ——整条消息清零。工具开启时一个 turn 合法地含多条 assistant message（text₁ → toolCall → toolResult → text₂）；若 text₂ 生成中途失败触发重试，正确语义是只丢 text₂，方案却会把 text₁ 与工具卡一并抹掉。中途失败（长文本在工具结果之后遭 529/stall）恰是高发场景。

### 定形原则（对齐主流流式协议的消费姿势）

**Delta 是预览，message_end 是提交点，auto_retry_start 是回滚到上一个提交点。**
（乐观更新 + checkpoint/rollback——与 Anthropic SSE 的 `message_stop`、DB WAL 同构；pi 自己的 text 模式也是这个语义：只输出最终存活的 message。）

### 修正后的事件与各层职责

1. **两个 partEvent（双镜像类型）**：
   - `{ kind: 'message-commit' }` — assistant `message_end` 且 `stopReason` 非 error/aborted 时发出
   - `{ kind: 'text-reset' }` — `auto_retry_start` 时发出（语义：回滚到上一个 commit）
2. **renderer（useHomeConversation）**：维护高水位 `committed = { contentLen, partsLen }`；`message-commit` → 快照推进；`text-reset` → `content = content.slice(0, committed.contentLen)`、`parts.length = committed.partsLen`（保数组身份）、清 reasoning 悬挂态。turn 内先前已提交的 text₁/工具卡因此存活。
3. **provider `chat()` 与 `emittedDelta`**：同样 commit/rollback；`emittedDelta` 语义改为「存在已提交内容」——全部尝试被作废的运行不得因预览 delta 而吞错。
4. **router（intelligence-sdk）`accumulated`**：同一对 commit/rollback，保证 `end.result` 是存活版本。
5. **空回复修复**（§四第二处，保持）：解析层透出最后 `stopReason` 与 `auto_retry_end.success/finalError`；EOF 后「无已提交内容且终态 error」→ 抛带 `finalError` 的错误，不再依赖恒为 0 的退出码。
6. **纵深防御**（保持）：spawn env 加 `PI_RETRY_STALL_TIMEOUT_MS: '0'`（关掉无头场景下只会翻倍输出的 90s watchdog；不影响 pi 内建 retry）。
7. **可观测性**：`auto_retry_start` 记 log（attempt/maxAttempts/delayMs）——§六「5 次未对齐」的后续证据来源。

### 追加测试（在 §五之上）

- **工具轮回滚护栏**：text₁ commit → toolCall/toolResult → text₂ deltas → `auto_retry_start` → text₂′ deltas+commit：断言最终 content = text₁+text₂′，工具卡存活，text₂ 无残留。
- **commit 不误发**：`message_end(stopReason=error)` 不产生 `message-commit`。
- 全失败运行（零提交）→ provider 抛 `finalError`，`emittedDelta` 不吞错。
