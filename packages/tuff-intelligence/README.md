# @talex-touch/tuff-intelligence

共享的 Intelligence SDK 基元包：提供 LangGraph 步骤编排、能力/提示词/提供商路由解析、工具注册与存储契约，供 Nexus、CoreApp 和前端消费。它本身不创建 provider、发起模型请求、持久化配置或执行配额/审计。

## 功能概述

- LangGraph 步骤编排：将调用方提供的有序 `TuffGraphStep` 编译为图，并传递 `TuffGraphContext`。
- 能力与提供商解析：规范化 capability ID，按 binding、模型偏好和 priority 计算候选路由。
- 提示词解析：从 capability、provider 和 metadata binding 中解析活动模板。
- Tool Kit：提供 Tuff-native 工具定义、Zod 运行时校验和可插拔审批门禁。
- 存储契约：声明审计、用量、配置与提示词所需的 `TuffIntelligenceStorageAdapter`；使用方负责实际持久化和策略执行。

## ContextHygiene 传输契约

完整 host SDK 暴露 `contextCreateCompressionSnapshot()`、`contextListCompressionSnapshots()` 与 `contextGetLatestCompressionSnapshot()` 的 typed transport contract。创建请求使用 `CompressionSnapshotDraft` 和 `expectedSessionUpdatedAt`；结果要么返回原子写入的 snapshot/checkpoint，要么以 `degradedReason: "cas-conflict"` 明确拒绝陈旧结果。实际 SQLite 校验、事务、source turn 隐私过滤与 ContextPackage 注入由 CoreApp host 实现，本包不直接持久化。

这些压缩与 Memory list/save/replace/delete 方法属于 host-only 管理 surface。CoreApp 的 renderer 与 main-process plugin facade 都会从属性读取、`in` 和枚举结果中移除这些方法；host handler 仍会拒绝绕过 facade 的 plugin actor，形成 defense-in-depth。插件应通过 `contextInvoke()` / `contextStream()` 只消费宿主整理后的 metadata-only context summary。

当显式 `continue` 跨越 archived/expired/idle session 边界时，host 会创建新的 session，只注入通过策略校验的 CompressionSnapshot 或 legacy summary。`execution.context.continuation` 使用 `ContextContinuationSummary` 返回 source session id、reason、included/excluded/unavailable status 与 summary source id/type；不返回摘要正文或旧 turns。调用方应保存新的 `execution.context.sessionId` 作为后续 continue 目标。

### Token streaming transport

`createIntelligenceClient()` 接受完整 typed transport 时，`stream()` 与 `contextStream()` 会返回可取消的 `StreamController`，并按顺序投递 `onStart`、`onDelta`、`onMessage`、`onUsage`、`onMetadata`、`onEnd` / `onError`。CoreApp 每次调用只投递一个 provisional start；provider fallback 只允许发生在首个 delta 前，输出后错误直接传播，避免跨 provider 拼接回答。CoreApp 插件 lifecycle 注入的 transport 同时携带 verified plugin actor 与当前 `_sdkapi`，因此插件 ContextHygiene token stream 继续经过 `intelligence.basic`、host-owned context assembler、配额和审计边界。

只有 `send()` 的 legacy channel 仍可调用非流式 API，但 streaming 会显式抛出 `stream-capable transport` 错误；SDK 不会把 buffered invoke 伪装成 token stream。直接宿主应传入同时实现 `send()` / `stream()` 的 typed transport，插件代码应优先使用宿主注入的 `context.utils.intelligence`。

## 安装

```bash
pnpm add @talex-touch/tuff-intelligence
```

## 快速上手

```ts
import {
  buildGraphArtifacts,
  invokeGraph,
} from "@talex-touch/tuff-intelligence";
import type { TuffIntelligenceConfig } from "@talex-touch/tuff-intelligence";

const config: TuffIntelligenceConfig = {
  providers: [],
  capabilities: [],
  prompts: [],
  quota: {},
  enableAudit: true,
};

const artifacts = buildGraphArtifacts({ config });

async function run() {
  const context = await invokeGraph({
    artifacts,
    context: { capabilityId: "text.chat", payload: { messages: [] } },
  });
  console.log(context);
}
```

## Tool Kit

`ToolKit` 提供 Tuff-native 工具定义、Zod 运行时校验和可插拔审批门禁。它不绑定 LangChain / DeepAgents，后续 adapter 可以消费同一套工具定义。

```ts
import { z } from "zod";
import {
  createToolKit,
  LangChainToolAdapter,
  defineTuffTool,
  toToolManifest,
} from "@talex-touch/tuff-intelligence";

const kit = createToolKit({
  approvalGate: async (request) => ({
    approved: request.riskLevel !== "critical",
    reason:
      request.riskLevel === "critical"
        ? "Critical tool requires HITL."
        : undefined,
  }),
});

kit.register(
  defineTuffTool({
    id: "text.uppercase",
    name: "Uppercase",
    description: "Uppercase input text.",
    inputSchema: z.object({
      text: z.string(),
    }),
    outputSchema: z.object({
      text: z.string(),
    }),
    execute: (input) => ({
      text: input.text.toUpperCase(),
    }),
  }),
);

const result = await kit.invoke("text.uppercase", { text: "tuff" });
if (result.ok) {
  console.log(result.output.text);
}

const manifest = toToolManifest(kit.get("text.uppercase")!);
const langChainTool = LangChainToolAdapter.fromTuffTool(
  kit.get("text.uppercase")!,
);
```

工具也可以桥接到既有 `CapabilityRegistry`：

```ts
import { CapabilityRegistry } from "@talex-touch/tuff-intelligence";

const registry = new CapabilityRegistry();
registry.registerTool(kit.get("text.uppercase")!);
```

## 存储适配器（接口）

`TuffIntelligenceStorageAdapter` 需实现：

- 审计：`saveAuditLog` / `queryAuditLogs`
- 用量：`saveUsageDelta` / `getQuota` / `setQuota`
- 配置：`saveProviderConfig` / `listProviders` / `saveCapabilityConfig` / `listCapabilities`
- 提示词：`savePrompt` / `listPrompts` / `deletePrompt`

存储需要由使用方注入（例如 Core 应用提供 DB 适配器）。

## 运行时边界

`buildGraphArtifacts()` 与 `invokeGraph()` 已提供真实的 LangGraph 顺序执行器，但只运行调用方注入的步骤；未传入步骤时使用 identity `noop`，不会隐式调用任何 AI provider。CoreApp 负责把 provider runtime、能力调用、配额/审计和 Agent 图组合起来；其他宿主也应在自己的 runtime 中注入对应步骤和存储实现。
