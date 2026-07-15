# Plugin SDK 重构说明

## 概述

Plugin SDK 已重构为统一的工厂函数模式，参考 `DivisionBoxSDK` 的设计。旧版本 API 已废弃，调用时会抛出错误。

## 新的 SDK 结构

### 1. BoxSDK - CoreBox 窗口控制

控制 CoreBox 窗口的显示、大小和输入框状态。

```typescript
// 隐藏/显示 CoreBox
plugin.box.hide();
plugin.box.show();

// 扩展窗口（显示更多结果）
plugin.box.expand({ length: 10 });
plugin.box.expand({ forceMax: true });

// 收缩窗口
plugin.box.shrink();

// 控制输入框
plugin.box.hideInput();
plugin.box.showInput();

// 获取与设置输入
const input = await plugin.box.getInput();
await plugin.box.setInput("Hello Touch!");
await plugin.box.clearInput();
```

### 2. FeatureSDK - 搜索结果管理

管理插件推送的搜索结果项（TuffItems）。

```typescript
// 推送多个结果
await plugin.feature.pushItems([
  { id: 'item-1', title: { text: 'Result 1' }, ... },
  { id: 'item-2', title: { text: 'Result 2' }, ... }
])

// 更新单个结果
plugin.feature.updateItem('item-1', {
  title: { text: 'Updated Title' }
})

// 删除单个结果
plugin.feature.removeItem('item-1')

// 清空所有结果
plugin.feature.clearItems()

// 获取所有结果
const items = plugin.feature.getItems()

// 监听输入变化（实时搜索）
const unsubscribe = plugin.feature.onInputChange((input) => {
  console.log('User typed:', input)
  // 执行实时搜索
  performSearch(input)
})

// 取消监听
unsubscribe()

// 键盘交互在插件 UI 内使用组件本地 keydown 或宿主传入的 hostKeyEvent props。
// feature.onKeyEvent() 已移除；旧 core-box:key-event 没有生产发送端。
```

`pushItems()` 会透传宿主写入的 completion：main runtime 需要异步解析 file icon 时可 `await` 首次挂载完成，再用同步 `updateItem()` 原位更新 stream 状态；旧 renderer/host 返回 `void` 时 `await` 仍安全。不要逐 token 重复 clear+push。

发送型 feature 可在声明中开启 `interaction.sendMode`，使 CoreBox 激活期间把右侧 pin 按钮替换为发送按钮。widget feature 默认启用发送模式；非 widget feature 可显式声明。

```typescript
import { withSendMode } from "@talex-touch/utils/plugin/sdk";

features.addFeature(
  withSendMode({
    id: "ask-assistant",
    name: "Ask Assistant",
    desc: "Send the current CoreBox input to the assistant",
    icon: { type: "emoji", value: "✨" },
    push: true,
    platform: {},
    commands: [{ type: "over", value: "" }],
    interaction: {
      type: "webcontent",
      path: "/assistant",
      showInput: true,
      allowInput: true,
    },
  }),
);
```

Dynamic features use `feature.id` as their lifecycle identity. `addFeature()` rejects duplicate ids and duplicate display names; `removeFeature()` accepts the id, never the display name. This keeps persisted registries and reload reconciliation deterministic.

Dynamic features with `icon.type: "file"` use the same host-owned icon initialization as manifest features. The host resolves relative files against the owning plugin root, validates traversal, and replaces the raw relative value with the resolved runtime asset instead of leaving renderer code to interpret it.

运行时新增的 widget feature 若要复用已预编译 renderer，应填写同插件 `feature.id` 形式的 `interaction.rendererFeatureId`，并让自定义 item 使用该目标 feature 的 namespaced widget id。宿主只在当前插件内解析目标；目标不存在、不是 widget 或没有 `interaction.path` 时会 fail closed，且不会进入动态 feature lifecycle。

`plugin.feature.pushItems/updateItem` 表示显式激活 feature 的状态写入，不受根搜索 provider 开关影响；`boxItems.push*/update` 仍是根搜索写入，必须继续遵守 `search.root-results` 权限与 provider enablement。

#### Widget 可复用私有模块

`tuff builder` 会继续把 `widgets/` 下未在 manifest 声明的公开 `.vue/.ts/.js/.cjs/.tsx/.jsx` 文件自动预编译为独立 widget。仅作为依赖的源码应放在以下划线开头的文件或目录中，例如 `widgets/_shared/format.ts`；这类 private module 可由 widget 相对导入并被打进对应 bundle，但不会生成额外的 `build.widgets[]` entry。

```text
widgets/
  panel.vue
  _shared/
    format.ts
```

```typescript
// widgets/panel.vue
import { formatResult } from "./_shared/format";
```

该约定只影响未声明文件的目录自动发现；manifest `interaction.path` 显式指向的 entry 仍会预编译。相对导入必须留在 `widgets/` 内，不能借 private module 绕过 widget sandbox 路径边界。

### 3. IntelligenceSDK - AI 能力与发现信息

插件可通过 `context.utils.intelligence` 或 `context.utils.plugin.intelligence` 调用 AI 能力，并读取 capability/provider/model 发现信息。发现接口是只读能力，用于在 Alfred / uTools 类插件体验里先判断入口是否可用，再决定展示动作或降级说明。

```typescript
export async function summarizeCurrentSelection(context) {
  const { intelligence, system } = context.utils;
  const selection = await system.captureSelection();
  if (!selection.text) {
    context.utils.logger.warn(
      `Selection unavailable: ${selection.issueCode ?? "empty"}`,
    );
    return;
  }

  const status = await intelligence.getCapabilityStatus({
    capabilityId: "text.chat",
  });
  const providers = await intelligence.getProviderModelOptions({
    capabilityId: "text.chat",
  });

  if (!status.available) {
    context.utils.logger.warn(
      `text.chat unavailable: ${status.reason ?? "no provider"}`,
    );
    return;
  }

  return await intelligence.text.chat(
    {
      messages: [
        {
          role: "user",
          content: `Summarize the current selection:\n\n${selection.text}`,
        },
      ],
    },
    {
      allowedProviderIds: providers
        .filter((provider) => provider.available)
        .map((provider) => provider.providerId),
    },
  );
}
```

`getCapabilityStatus()`、`getProviderModelOptions()` 与 `intelligence.text.*` / `intelligence.image.*` / `intelligence.audio.*` 等 domain wrapper 会走 typed Intelligence transport，并携带当前插件 `sdkapi` marker；`chat` 旧别名仍保持 hard-cut，不会恢复。

`system.captureSelection()` / `captureSelectedText()` 需要 manifest 声明并获准 `clipboard.read`。宿主先验证插件 identity，再复用 OmniPanel 的选区服务：macOS 优先 AXSelectedText，其余情况使用可恢复剪贴板快照的复制 fallback。空选区、禁用与不支持平台返回 `issueCode` / `issueMessage` / `limitations`，不会把空字符串伪装成成功；选中文本不得写入普通日志、持久历史或审计 metadata。

宿主的默认 Nexus provider 通过已认证 `/api/v1/intelligence/stream` 消费真实 provider token SSE；delta/usage/end 会保留 Nexus 实际 `traceId/provider/model`，最终 latency 位于 `end.metadata.latency`。整次调用只发一个 start event，它可能携带首选 provider 的 provisional routing metadata；候选 provider 只有在首个可见 delta 前失败时才可切换，任何 delta 输出后失败都会直接进入 error，不能把另一个 provider 的回答拼接到已有前缀。官方 `touch-intelligence` 的 stream-to-`contextInvoke()` compatibility 也只允许在 widget 展示首个 delta 前发生，并会在 feature query/send/retry supersede 时调用旧 `StreamController.cancel()`；晚返回的旧 controller 也会自取消。插件必须按标准 stream event 渲染，不能依赖 delta 数量、切分粒度或 start event 作为最终路由结论。

ContextHygiene 采用宿主所有权边界：插件 facade 不暴露 raw `contextPrepareTurn()`、`contextListCheckpoints()`、`contextListPackageLogs()`、CompressionSnapshot 或 Memory 管理方法。checkpoint 可含 summary/reason/任意 metadata，package log 还允许无 session filter 并携带 trace/source/item metadata；在 session/record 没有 verified plugin owner 前，`metadata-only` 不能作为跨 actor 授权。对话插件只使用 `contextInvoke()` / `contextStream()` 提交当前输入与 new/continue/stateless intent；宿主完成最终 Memory 复核、预算和消息组装，仅回传安全 context summary。纯策略预览 `contextEvaluateMemory()` 仍可用；raw host-only event 在 SQLite/service 前返回 `INTELLIGENCE_HOST_ONLY_CAPABILITY`。

Intelligence quota/usage control plane 同样属于宿主：插件 facade 不暴露 `getQuota()`、`setQuota()`、`deleteQuota()`、`getAllQuotas()`、`checkQuota()` 或 `getCurrentUsage()`，绕过 facade 发送对应 typed event 也会得到 `INTELLIGENCE_HOST_ONLY_CAPABILITY`。插件不应自行选择 quota caller；普通 `invoke()` / `stream()` 以及 provider-backed compatibility routes `chatLangChain()` / `ttsSpeak()` 的 `metadata.caller` 都会在宿主 transport boundary 强制绑定为 `plugin:<manifest plugin id>`，缺失或伪造 caller 不能绕过或跨插件计费。TTS cache 同时按 caller 隔离，不能向另一插件复用 trace/result。

Daily/monthly usage aggregation treats the canonical caller id as opaque：`plugin:<id>`（including ids that themselves contain `:`）is persisted byte-for-byte, so plugin quota counters cannot disappear through delimiter parsing.

`intelligence.basic` 只覆盖普通受治理的 AI 能力；高层自主执行 `invoke("agent.run")` / `invoke("workflow.execute")` 及对应 stream 必须额外声明并获授高风险 `intelligence.agents`。低层 `agentSession*`、`agentPlan/Execute/Reflect`、`agentTool*` 与持久化 `workflowList/Get/Save/Delete/Run/History/ReviewUpdate` 都属于宿主 control plane：插件 facade 不暴露，raw typed request/stream 在任何读取、修改、运行、订阅或 provider/tool 副作用前返回 `INTELLIGENCE_HOST_ONLY_CAPABILITY`。高层 `intelligence.agent.run()` / `intelligence.workflow.execute()` 仍可用；普通 `text.chat` 和 host caller 不受影响。permission runtime 不可用或 grant 缺失时分别返回 `INTELLIGENCE_AGENTS_PERMISSION_UNAVAILABLE` / `INTELLIGENCE_AGENTS_PERMISSION_DENIED`。

Autonomous plugin execution retains the same actor identity after permission approval：generic `agent.run` / `workflow.execute` binds caller at the verified invoke/stream boundary, then propagates it through internal workflow model/context calls and DeepAgent config/adapter metadata. A nested `metadata.caller` cannot replace the transport-authenticated plugin caller；host-owned low-level session/workflow APIs preserve their existing host metadata semantics.

Host-owned persisted/direct workflows retain self-governed DeepAgent prompt/agent provider checks when they execute with a canonical non-host caller：each call checks quota before runtime config/adapter work and writes prompt-free usage/failure audit. This is defense in depth for host orchestration, not a plugin registry API. Generic plugin `agent.run` / `workflow.execute` remains outer-governed；its identity-bound in-memory marker prevents duplicate inner quota/audit while preserving provider selection, fallback, cache, result, and caller behavior.

Provider diagnostic/admin surfaces 也不属于插件 SDK：`testProvider()`、`testCapability()`、`fetchModels()`、跨 caller audit/usage stats 与 `getLocalEnvironment()` 不可发现，raw typed event 同样 host-only。插件只使用 `getCapabilityStatus()`、`getProviderModelOptions()`、`getCapabilityTestMeta()` 做只读 capability discovery，再通过受治理 domain wrapper 调用；不得借宿主 provider test/fetch 绕过 network permission、消耗策略或读取本机工具/配置路径。

Local knowledge 仍可由插件使用，但 `permissionScope` 与 SQLite id 不是插件可选择的所有权凭证：`knowledgeIndexDocument()` / `knowledgeIndexChunk()` / `knowledgeSearch()` / `knowledgeBuildContext()` 会按 verified transport identity 强制绑定 `plugin:<manifest plugin id>`，并把 document/chunk id 映射到 deterministic actor namespace。插件索引时无需传 `permissionScope`；追加 chunk 必须复用返回的 `document.id`，不得猜测 host/其他插件的 id。

```typescript
let contextSessionId: string | undefined;

const execution = await intelligence.contextInvoke({
  capabilityId: "text.chat",
  input: "总结当前选中文本",
  payload: { messages: [{ role: "system", content: "请简洁回答。" }] },
  context: {
    mode: contextSessionId ? "continue" : "new",
    sessionId: contextSessionId,
    scope: "retrieval",
    tokenBudget: 1200,
  },
});

context.utils.logger.info(execution.context.packageId);
contextSessionId = execution.context.sessionId;
```

跨 archived/expired/idle 边界时，`execution.context.sessionId` 是新的 session id；`execution.context.continuation` 只包含 `sourceSessionId`、`reason`、`status`、`summarySourceType`、`summarySourceId` 和 `degradedReason` 等 metadata。插件应显示 reason/status 并更新本地 session id，不得假设能读取旧摘要正文或 raw turns。

```typescript
if (execution.context.continuation) {
  context.utils.logger.info(
    `${execution.context.continuation.reason}:${execution.context.continuation.status}`,
  );
}
contextSessionId = execution.context.sessionId;
```

### 4. ScreenshotSDK - 权限门禁截图

插件 lifecycle 可通过 `context.utils.screenshot` 或同对象镜像 `context.utils.plugin.screenshot` 查询 native 支持、枚举显示器，并捕获 cursor-display / display / region。facade 复用 typed `NativeEvents.screenshot.*`，不要自行拼 raw channel。

manifest 必须声明并获得高风险 `window.capture`；宿主还会要求 verified plugin context。需要截图后 OCR 时，再独立声明 `intelligence.basic` 并调用 `context.utils.intelligence.vision.ocr()`。

```typescript
const displays = await context.utils.screenshot.listDisplays();
const capture = await context.utils.screenshot.capture({
  target: "display",
  displayId: displays[0]?.id,
  output: "data-url",
  writeClipboard: false,
});
```

plugin facade 不返回 native 临时文件原始 `path`，只暴露安全的 `tfileUrl` / `dataUrl` 与显示器、尺寸、耗时、大小、剪贴板状态 metadata。截图、OCR 文本和 AI payload 不得写入普通日志或同步数据。

### 5. LocalizationSDK - 主机语言与领域词库

`sdkapi >= 260713` 的插件可通过 `context.utils.i18n` / `context.utils.lexicon`（以及 `context.utils.plugin.*` 镜像）读取主机语言、解析 localized text、创建 `$i18n:` transport message，并查询官方或本插件私有 Domain Lexicon。renderer 侧可从 `@talex-touch/utils/plugin/sdk` 导入 `usePluginI18n()` / `usePluginLexicon()`。

manifest 必须按使用面声明权限：

```json
{
  "sdkapi": 260713,
  "permissions": {
    "required": ["i18n.read", "lexicon.read"],
    "optional": ["lexicon.register"]
  }
}
```

```typescript
export default {
  async onInit(context) {
    const { i18n, lexicon } = context.utils;
    const locale = await i18n.getLocale();
    const title = await i18n.resolveText({
      default: "Unit Converter",
      locales: { "zh-CN": "单位换算" },
    });
    const transportMessage = i18n.createMessage("plugin.ready", { title });

    const meter = await lexicon.resolve("unit.length.meter", { locale });
    const registration = await lexicon.register([
      {
        id: "status.ready",
        domain: "capability",
        version: "1",
        labels: { default: "Ready", locales: { "zh-CN": "就绪" } },
        aliases: { default: ["ready"], locales: { "zh-CN": ["就绪"] } },
      },
    ]);

    context.utils.logger.info(
      `${transportMessage}:${meter?.label}:${registration.ids[0]}`,
    );
  },
};
```

- `getLocale()` / `resolveText()` 需要 `i18n.read`；`resolve()` / `search()` 需要 `lexicon.read`；`register()` 需要 `lexicon.register`。权限运行时、声明、grant、verified plugin context 或 SDK marker 缺失时均 fail-closed。
- `createMessage()` 是纯字符串构造，不读取主机状态；空 key 会被拒绝。
- `register()` 只接受 plugin-local id。宿主把 `status.ready` 投影为 `plugin:<pluginId>:status.ready`，并写入 `source=plugin:<pluginId>`；插件不能覆盖 official id，也不能读取其他插件 overlay。
- 每插件最多 100 entries、单批最多 50 entries / 256 KiB；批次先完整验证再原子提交。overlay 只驻留内存，插件 disable/unload 时清理，不写 SQLite、Catalog 或同步载荷。

### 6. 键盘事件自动处理

当插件的 UI View 附加到 CoreBox 时，系统会自动处理以下行为：

#### ESC 键自动退出

- 在 UI View 中按下 ESC 键会**自动退出 UI 模式**（deactivate providers）
- 插件无需手动处理 ESC 键的退出逻辑
- 这与 CoreBox 主界面的 ESC 行为保持一致

#### 键盘事件

插件 UI 内部的键盘交互应使用组件本地 `keydown` 或宿主传入的 `hostKeyEvent` props。

`feature.onKeyEvent()` 与 `core-box:key-event` 已硬裁切；旧事件没有生产发送端，调用会得到明确 migration error。

## 废弃的 API

以下 API 已废弃，调用时会抛出错误：

### 旧的 Box API

```typescript
// ❌ 废弃
plugin.$box.hide();
plugin.$box.show();

// ✅ 使用新 API
plugin.box.hide();
plugin.box.show();
```

### 旧的 Feature API

```typescript
// ❌ 废弃
plugin.pushItems(items);
plugin.clearItems();
plugin.getItems();

// ✅ 使用新 API
plugin.feature.pushItems(items);
plugin.feature.clearItems();
plugin.feature.getItems();
```

## 迁移指南

### 1. 更新 Box 控制代码

**旧代码：**

```typescript
plugin.$box.hide();
plugin.$box.show();
```

**新代码：**

```typescript
plugin.box.hide();
plugin.box.show();
plugin.box.expand({ length: 10 });
plugin.box.shrink();
```

### 2. 更新搜索结果管理

**旧代码：**

```typescript
plugin.pushItems([...])
plugin.clearItems()
const items = plugin.getItems()
```

**新代码：**

```typescript
plugin.feature.pushItems([...])
plugin.feature.updateItem('id', { ... })
plugin.feature.removeItem('id')
plugin.feature.clearItems()
const items = plugin.feature.getItems()
```

### 3. 添加实时搜索支持

**新功能：**

```typescript
// 在插件初始化时注册监听器
onInit(context) {
  context.utils.feature.onInputChange((input) => {
    // 用户输入变化时触发
    this.performRealTimeSearch(input)
  })
}
```

### 4. 注册全局快捷键

`regShortcut()` 会把快捷键注册到 CoreApp 全局快捷键系统；建议始终传入稳定 `id` 与面向用户的 `description`，这样设置页和插件详情页可以展示语义化来源。

```typescript
import { regShortcut } from "@talex-touch/utils/plugin/sdk/common";

await regShortcut(
  "CommandOrControl+Shift+K",
  () => {
    openCommandCenter();
  },
  {
    id: "open-command-center",
    description: "Open command center",
  },
);
```

## 完整示例

```typescript
export default {
  onInit(context) {
    const { feature, box } = context.utils;

    // 监听输入变化
    feature.onInputChange((input) => {
      if (input.length > 2) {
        // 执行搜索
        const results = performSearch(input);
        feature.pushItems(results);
      } else {
        feature.clearItems();
      }
    });
  },

  onFeatureTriggered(featureId, query, feature) {
    const { feature: featureSDK, box } = this.context.utils;

    // 推送结果
    featureSDK.pushItems([
      {
        id: "result-1",
        title: { text: "Search Result" },
        subtitle: { text: "Description" },
        source: { id: this.pluginName, name: this.pluginName },
      },
    ]);

    // 扩展窗口显示结果
    box.expand({ length: 5 });

    // 3秒后隐藏
    setTimeout(() => {
      box.hide();
    }, 3000);
  },
};
```

## 技术细节

### SDK 工厂函数

所有 SDK 都通过工厂函数创建：

- `createBoxSDK(channel)` - 创建 Box SDK 实例
- `createFeatureSDK(boxItems, channel)` - 创建 Feature SDK 实例
- `createDivisionBoxSDK(channel)` - 创建 DivisionBox SDK 实例
- `createPluginLocalizationSDK(transport, sdkapi)` - 创建 i18n / lexicon 组合 facade
- `usePluginI18n()` / `usePluginLexicon()` - 在插件 renderer 中使用当前 channel 与 sdkapi

### IPC 通道

新增的 IPC 通道：

- `core-box:hide-input` - 隐藏输入框
- `core-box:show-input` - 显示输入框
- `core-box:get-input` - 获取当前输入值
- `core-box:set-input` - 设置输入框内容
- `core-box:clear-input` - 清空输入框
- `core-box:input-change` - 输入变化广播（主进程 → 插件）
- `core-box:set-input-visibility` - 设置输入框可见性（主进程 → 渲染进程）
- `core-box:request-input-value` - 请求输入值（主进程 → 渲染进程）
- `plugin:i18n:get-locale` / `plugin:i18n:resolve-text` - permission-gated host locale/localized text
- `plugin:lexicon:resolve` / `plugin:lexicon:search` / `plugin:lexicon:register` - official + plugin-scoped Domain Lexicon

> Breaking change（2026-02-27）：`core-box:input-change` 事件载荷统一为 `{ input, query, source }` 必填结构。

### 架构优势

1. **统一的 API 风格** - 所有 SDK 使用相同的工厂函数模式
2. **更好的类型安全** - TypeScript 类型定义完整
3. **功能分离** - Box 控制和 Feature 管理职责清晰
4. **扩展性强** - 易于添加新功能
5. **向后不兼容** - 强制迁移到新 API，避免技术债务
