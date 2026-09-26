# 推理强度真实接入（自动 / 低 / 中 / 高 / 极高，含 Nexus 服务端）

父任务：`09-25-home-session-polish`。来源：`09-26-composer-controls-redesign` 的 D11（老板：「真实接入！」）。完整调研：`.trellis/tasks/09-26-composer-controls-redesign/research/reasoning-effort.md`（先读它，含各提供方的参数、文件行号与风险）。

## Goal

输入框模型胶囊「Tuff 智能 高」里的档位不再是写死的文案：用户能选推理强度，设置持久化，随请求传给模型，各路由按自身能力映射；做不到的明确告诉用户。

## 已拍板（2026-09-26）

- 档位：**自动（默认，不传参数，所有路由行为与现在一致）/ 低 / 中 / 高 / 极高**（极高 = 该模型支持的最高档）。本次不做「关」档（D11-c）。
- 「自动」时胶囊**不显示后缀**，只显示模型名（D11-a）。
- **全局一份**设置（`appSetting` 里与模型选择同一块，如 `conversation.reasoningEffort`），每个回合实际生效的档位记进回合信息随消息保存（D11-b）。
- 支持表：主进程与渲染层**共用 `packages/utils` 里的一张小表**（家族 + 模型前缀），测试钉住（D11-d）。
- **Tuff Nexus 路由这次连服务端一起改**（D11-e）：客户端经类型化字段 / metadata 传档位，Nexus 服务端的 AI 转发把它映射到上游提供方参数；服务端改动随 Nexus 部署生效。
- 不展示推理过程内容（D11-f）。

## Requirements

1. 类型化字段 `reasoningEffort`（请求选项里，非字符串透传），渲染层 → `intelligence:api:stream` → 主进程选定提供方后统一决定「请求档 / 实际生效档 / 状态」，各提供方只做参数翻译（调研 §4 映射表：OpenAI 兼容推理模型 `reasoning_effort`；Anthropic 新模型自适应 + effort / 旧模型 thinking 预算（注意默认 `max_tokens` 1024 需调大）；DeepSeek；Codex `-c model_reasoning_effort=…`；Claude Code `--effort`；pi / omp `--thinking`（pi 的参数名未在本机验证，照调研处理）；SiliconFlow / Ollama 本期不支持）。
2. 「自动」不传任何参数（向后兼容）。修正调研发现的既有问题时要单独列出（例如 omp 写死 `--thinking off`、Anthropic 默认发 `thinking: disabled`），只在选了非自动档时改变行为，除非另有决定。
3. 模型菜单（`HomeModelMenu`）里的档位行：可选档位；当前路由不支持时整行禁用并写明原因（「该模型不支持推理强度」/「云端暂不支持」等）。胶囊后缀随设置显示（自动不显示）。**`HomePage.vue` 正被另一个子任务修改：本任务先不改它，把胶囊需要的接口留给合并时接线（在本 PRD 末尾写 hand-off）。**
4. Nexus 服务端（`apps/nexus/server` 里 AI 转发 / 适配器）：接收档位并映射到上游；不支持的上游忽略并在响应元信息里标明未应用。
5. 审计 / 回合信息记录请求档与实际生效档。
6. 语言包 zh-CN / en-US：只追加新键，最后一次性小改动加入（这两个文件被多个会话同时编辑，改前重读、用唯一锚点做局部编辑，不整体重写）。

## Acceptance Criteria

- [ ] 单测：支持表（家族 / 前缀 → 可用档位）；各提供方翻译出的请求参数（钉住请求体，Anthropic 走 `invocationParams()`）；「自动」不产生任何参数；不支持时的状态。
- [ ] Nexus 服务端单测：档位 → 上游参数映射；不支持时忽略。
- [ ] 主进程 `tsc -p tsconfig.node.json`、渲染层 `vue-tsc -p tsconfig.web.json`、nexus 相关测试、eslint 通过。
- [ ] 真实应用验证（主会话做）：切换档位后对一条支持的路由实发一次，审计 / 回合信息显示实际生效档。

## 实现记录（2026-09-26，implement agent）

- 支持表 + 线格式翻译：`packages/utils/intelligence/reasoning-effort.ts`（独立文件，渲染层 / 主进程 / Nexus 服务端共用）。类型在 `packages/utils/types/intelligence.ts`：`IntelligenceInvokeOptions.reasoningEffort`、`IntelligenceReasoningEffortDecision { requested, applied, status }`，并挂在 `IntelligenceStreamEvent`（`start` / `end`）、`IntelligenceInvokeResult`、`IntelligenceStreamChunk` 上。
- 主进程：`apps/core-app/src/main/modules/ai/reasoning-effort-runtime.ts`；`intelligence-sdk.ts` 在**每次提供方尝试**（含备选）选定后出计划（`reasoningPlan`，仅主进程内部，调用方传入的一律剥掉），提供方只翻译。审计白名单加 `reasoningEffort / reasoningApplied / reasoningStatus`。
- 状态：`applied`（按请求发出；「极高」= 该模型最高档）/ `clamped`（模型没有该档，先上后下取最近档）/ `unsupported-model` / `unsupported-provider`（什么都没发）/ `forwarded`（交给 Nexus，服务端回报后被替换；旧服务端不回报时保持 `forwarded`）。
- 「自动」：渲染层请求里**没有** `reasoningEffort` 字段 → 主进程不出计划 → 所有请求体 / argv 与改动前逐字节一致（有测试钉住）。

### 仍在的既有问题（未改动，仅列出）

- omp 自动档仍写死 `--thinking off`（保持原行为）。
- Anthropic 自动档仍由 LangChain 显式发 `thinking: { type: 'disabled' }`、`temperature: 0.7`、`max_tokens: 1024`：Home 回答在 1024 token 截断；`claude-opus-4-7+` / `claude-opus-5` / `claude-fable-5` 可能不接受 temperature 或不能关思考，自动档可能本就报错。选了档位时这些都不再发送。
- Nexus 的 OpenAI 兼容适配器自动档固定发 `temperature: 0.2`，上游是 o 系列 / gpt-5 时可能被拒；选了档位（推理模型）时不再发 temperature。

## HomePage hand-off（合并时接线；本任务未改 `HomePage.vue`）

`HomeModelMenu.vue` 的档位行、回合信息行（`HomeTurnInfoMenu` 经 `buildTurnInfoRows`）已经可用，`HomePage.vue` 只需三处接线：

1. 取设置与胶囊后缀（与 `useModelOptions()` 放在一起）：

```ts
import { reasoningLevelLabelKey } from '~/modules/conversation/reasoning-effort-display'
import { useReasoningEffort } from '~/modules/conversation/useReasoningEffort'

const { setting: reasoningEffortSetting, pillLevel: reasoningPillLevel } = useReasoningEffort()
```

2. 发送时读取（与 `routing` / `autoContext` 同样是 getter，切档后下一条就生效；非流式回退自动带同一份）：

```ts
const conversation = useHomeConversation({
  routing: () => modelRouting.value,
  autoContext: () => autoContext.value,
  identity: () => { /* 不变 */ },
  leadNote: createOpeningLeadNote(t),
  reasoningEffort: () => reasoningEffortSetting.value
})
```

3. 胶囊 `#trigger` 里把写死的 `<span class="HomePage-ModelEffort">{{ t('home.effortHigh') }}</span>` 换成：

```vue
<span v-if="reasoningPillLevel" class="HomePage-ModelEffort">
  {{ t(reasoningLevelLabelKey(reasoningPillLevel)) }}
</span>
```

`pillLevel` 的规则（`resolveReasoningRow`）：自动 → 不显示（D11-a）；固定模型接不住 → 不显示；模型会就近取档 → 显示实际档；其余显示所选档（「极高」即使落到 `xhigh` 也显示「极高」）；自动路由 + 显式档 → 显示所选档。

接线后：`home.effortHigh` 在两份语言包里不再有人用，可在同一改动里删除；`.HomePage-ModelEffort` 目前是 `--shell-text-muted`，调研建议改 `--shell-text-secondary`（对比度），由输入框重做任务决定；后缀变化若要走 `ComposerChip` 的文字 + 宽度编排，数据源就是 `reasoningPillLevel`。`HomeTopBar` 的胶囊不显示档位，不用改。

### 真实应用验证要点（主会话）

主进程改动需重启 dev 才生效。选一条支持的路由（如 Codex `gpt-5.5`、OpenAI `gpt-5.x`、Claude Code `opus`、pi）→ 菜单选「高」→ 发一条 → 顶栏 `⋯` 回合信息出现「推理强度」行；审计记录 metadata 带 `reasoningEffort / reasoningApplied / reasoningStatus`。再切到 `gpt-4o` / Ollama：菜单档位行禁用并写原因，胶囊无后缀。Nexus 路由要等 Nexus 部署后才会回报 `applied`，之前显示「云端未确认」。

## 真实窗口验证（2026-09-26，主会话，dev 带 9333 端口）

- Claude Code：选「低」/「高」时 CLI 命令行带 `--effort low` / `--effort high`（进程 argv 实测），`start` / `end` 的决定为 `applied`；「自动」时 argv 无 `--effort`、事件无决定。
- Codex：实现里未固定模型时判为 `unsupported-model`、什么都不发——本机 Codex 的模型写在 `~/.codex/config.toml`（`gpt-5.6-sol`）。已修：`planProviderReasoning` 在 Codex 没有模型时读 `readCodexConfiguredModel()`（与模型列表同一个读取），重启后实测 argv 带 `-c model_reasoning_effort="high"`、决定 `applied`。规范 `channel-transport-contracts.md` 补了这一条例外。
- Home 发送：胶囊显示「Tuff 智能 高」，回合信息出现「推理强度 高」，持久化的回合 meta 带 `reasoningRequested / reasoningApplied / reasoningStatus`；菜单档位行亮 / 暗两色截图正常；验证后设置已还原为「自动」。
- 审计表（`intelligence_audit_logs`）今天所有调用都是 0 行，没法在库里核对三个审计键。
- 与本任务无关的环境问题：本机 Codex 经 CC Switch 本地代理，上游 KTVSky 返回 401（API key 无效），随后「所有供应商已熔断，无可用渠道」，所以 Codex 路由当前每次约 30s 后失败；应用里只显示 `UNKNOWN`（CLI 的错误原文没透传，是另一个待办）。
