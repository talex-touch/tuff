# 原生联网搜索可行性调研

调研日期：2026-08-07。结论先行：**用户选定的「provider 自带 server-side search」路线，在当前运行时下不可直接落地**，原因是 Home 对话的工具调用链路被 pi CLI 独占，而 pi 0.84 全链路没有联网搜索能力。

## 1. Home 对话的工具链路

```
HomePage.vue
  → PiCliProvider (apps/core-app/src/main/modules/ai/providers/pi-cli-provider.ts)
    → spawn `pi --print --mode json --tools <allowlist> ...`
      → pi 加载 packages/pi-extension-tuff (通过 -e 显式指定)
        → 扩展回调 loopback 工具网关 (apps/core-app/src/main/modules/tool-gateway/gateway-server.ts)
          → createToolRegistry() 执行工具 (tool-registry.ts:340)
```

`provider-factory.ts:20` 只有两个分支：

```ts
return isPiCliProviderConfig(config) ? new PiCliProvider(config) : new LocalProvider(config)
```

## 2. 现有工具清单：11 个，全本地，无联网

`tool-registry.ts` 注册（行号为 `name:` 所在行）：

| 工具 | 行 | 性质 |
|---|---|---|
| `tuff_search_files` | 343 | 本地文件搜索（复用 CoreBox 索引） |
| `tuff_read_file` | 361 | 本地 |
| `tuff_write_file` | 385 | 本地 |
| `tuff_open_path` | 428 | 本地 |
| `tuff_render_chart` | 441 | UI |
| `tuff_skill_read` | 455 | 本地 |
| `tuff_mcp_list_tools` | 472 | MCP 目录 |
| `tuff_mcp_call` | 508 | MCP 代理 |
| `tuff_list_features` | 555 | 插件能力 |
| `tuff_invoke_feature` | 586 | 插件能力 |
| `tuff_render_form` | 635 | UI |

`packages/pi-extension-tuff/index.ts` 一一对应声明同名工具。**没有任何联网搜索工具。**

截图中的失败路径由此而来：模型手上只有这 11 个工具，于是去试 `tuff_mcp_list_tools` 碰运气，撞上 `tool-registry.ts:472-484` 的空状态提示（注意它刻意写了 `isError: false`，设计上当提示不当错误），随后退化成凭记忆作答。

## 3. pi 侧：无内置搜索，也无 server-side 工具透传

`pi --help` 自述为 "AI coding assistant with read, bash, edit, write tools"。

扫描（**均带正对照**，防止「查无结果」实为扫描失效）：

| 扫描目标 | 正对照 | 正对照结果 | 真查询 | 真查询结果 |
|---|---|---|---|---|
| `pi-coding-agent@0.84.0/dist`（789 文件） | `no-builtin-tools` | 命中 `cli/args.js` 等 3 处 | `web_?search` | **0 命中** |
| `pi-ai/src`（207 文件，软链到 `~/Workspace/earendil-pi`） | `anthropic` | 命中 `compat.ts`/`models.ts`/`index.ts` | `web_?search\|server_?tool\|computer_?use\|code_?execution` | **1 命中，假阳性** |

那 1 处命中是 `packages/ai/src/api/anthropic-messages.ts:98` 的字符串 `"WebSearch"`，位于 `claudeCodeTools` 数组内，上方注释写明：

```
// Stealth mode: Mimic Claude Code's tool naming exactly
// Claude Code 2.x tool names (canonical casing)
```

即**工具名大小写查找表**，用于把工具名规范成 Claude Code 的写法（`toClaudeCodeName`），与 Anthropic server-side `web_search` 工具无关。

结论：pi 既没有内置 web search，也没有把 Anthropic/OpenAI 的 server-side 工具（`web_search_*`、`code_execution` 等）透传给模型的通道。

## 4. 非 pi 路径不具备工具调用能力

`LocalProvider extends OpenAiCompatibleLangChainProvider`（`local-provider.ts:47`）。

对 `langchain-openai-compatible-provider.ts` 扫描 `bindTools|tools|toolCall|tool_call`：**0 命中**（正对照 `class` 命中 1，扫描有效）。

即：**Agentic 工具调用是 pi 独占的**。`AnthropicProvider` 虽然存在（`intelligence-module.ts:791`、`intelligence-service.ts:73` 构造），但服务的是其它 intelligence 场景，不在 Home 对话的工具回路上。

## 5. 三条可选路线

| 路线 | 内容 | 代价 | 风险 |
|---|---|---|---|
| A. 上游改 pi | 在 `pi-ai` 的 anthropic/openai 适配层增加 server-side 工具透传，pi CLI 增加开关，再由本仓 `pi-cli-runtime.ts` 传参 | 最大，跨仓（`~/Workspace/earendil-pi`，且本机 pi-ai 是软链的 0.83 而 CLI 是 0.84，版本错位需先对齐） | 依赖上游节奏；provider 之间 server tool 形状不统一 |
| B. 自建 `tuff_web_search` | 在 `tool-registry.ts` + `pi-extension-tuff` 各加一个工具，后端接搜索 API，凭据走现有 `provider-credential-service` | 中等，全在本仓，复用现成风险分级与确认网关 | 需管理第三方密钥与配额 |
| C. 直连 provider 旁路 | Home 对话在需要搜索时绕开 pi 直连 provider | 大 | 与工具网关的确认/审计机制割裂，等于开第二条无人看管的通道 |

用户已选定「provider 自带 server-side search」，语义最接近 A。但 A 是跨仓上游改造，且当前不可独立验收；B 是本仓唯一能自洽交付的路线（用户此前明确未选）。**该分歧需回到用户决策，不得自行替换。**
