# C. skills 与 MCP · 技术设计

前置事实（2026-08-05 已核实）：**「主进程自建 MCP client」已经存在** —— `intelligence-mcp-registry.ts` 是完整实现（stdio + streamable-http、懒连接、代际失效、5min 空闲回收、secure-store 凭据注入、MCP annotations→风险映射、`listStructuredTools`/`callTool`）。`ai-imported-config-runtime.ts` 已做 orca 式 skills 注入（metadata-only + `skill.read` 按需取正文）和 imported mcp item → profile 的懒注册（`mcpProfilesFromItem`/`ensureMcpProfile`）。**但这一切只服务 `ai-cli-orchestrator` 岛**（经 `pi-agent-runtime-host`），首页会话走的是 pi CLI 子进程（`pi-cli-provider` → `pi-extension-tuff` → tool-gateway），两岛不通。

**C 的本质 = 三座桥 + 一个管理面**，不是新建 MCP client。

## 决策记录（覆盖 PRD 两处）

1. **弃 `--mcp-config` 产物路线**（PRD 原验收第 3 条）。用户已定主进程路线；`--mcp-config` 属 pi 第三方扩展（pi-mcp-adapter），且 server 进程会落在 agent 进程侧、绕开确认门。改为：MCP 调用经 tool-gateway 代理，server 进程只在主进程手里。
2. **skills 注入总开关挂 `appSetting.tools.autoContext`**，不新增设置项。autoContext 的语义（"让模型按需拉取上下文"）与 skills metadata 注入完全一致，且它已经是 composer 与设置页共管的同一偏好。

## 桥 1 · MCP → tool-gateway（延迟加载语义）

gateway `tool-registry` 新增两个**静态**工具（白名单稳定，不随 server 增删波动——这就是 orca 的 deferred-tools 形态）：

- `tuff_mcp_list_tools`（risk=read，可记住）：遍历启用的 profiles → `registry.listStructuredTools`，返回目录：`server / tool / description / risk`；连接失败的 server 列为 `unavailable + 原因`（单 server 失败不拖垮整表）。无启用 server 时返回提示文本而非空错。
- `tuff_mcp_call`（server, tool, args）：`registry.callTool(profileId, toolName, args)`。风险按 registry 的 annotations 映射降档执行：`low → read`（可记住），其余（medium/high/critical）→ `execute`（恒确认）；`destructiveHint` 的确认卡 summary 前缀 `⚠`。确认卡 summary 显示 `profileName / toolName`，args 截断进 detail。

授权模型：**设置页启用某 server = 同意运行该 server 进程**（连接发生在主进程，list 即可能触发懒连）；**每次工具调用仍逐条过确认门**。两层分离，与既有 agentTools 总开关（B 已做）叠加：总开关关 → 两工具与其余 tuff 工具一并不注册。

`pi-extension-tuff` 的静态 `TOOLS` 数组加这两个 spec（promptSnippet 写明「先 list 后 call、工具目录可能变化」），沿用既有 `(toolCallId, params)` 执行器契约与转发器实现，零新通路。

## 桥 2 · skills/rules → 首页 system prompt

- 新增 `buildHomeInjection()`（放 `ai-imported-config-runtime` 上，与 `buildSystemPrompt` 共用取数）：产出 ① active skills 的 metadata-only 清单（沿用 209-235 行既有格式，提示语改为 `call tuff_skill_read`）② active rules 全文。**不含** workspace/objective 语境（那是 orchestrator 专属）。
- 注入点在 `intelligence-service` 调 provider 前追加 system part —— `pi-cli-runtime.buildPiPrompt` 已有 systemParts 席位，**provider 层零改动**。受 `tools.autoContext` 门控；变更即时生效=下一轮发送时重新取数（无缓存）。
- gateway 新增 `tuff_skill_read(id)`（risk=read）：读取 imported skill 的 `contentRef` 管理内容。**只允许 contentRef**（store 管理的落盘副本），拒绝任意路径——首页无 workspace 语境，不能沿用 runtime 271 行的 workspace 越界校验，改为「非 contentRef 即拒」这一更严格的不变量。

## 桥 3 · 导入（几乎白拿）

`ai-cli-import-service` 扫描/去重/apply 与 `IntelligenceLocalSkills.vue`（886 行，含 mcp 候选）已覆盖 PRD「自动导入」全部验收。C 不重建导入，只在新设置组给入口（跳 IntelligencePage 或内嵌既有组件，S5 落地时定）。

## 管理面 · 设置页「技能与 MCP」

按 CoreBox v2.5 设置页版式（分组标签外置 + 单层卡片 + C2/Row + soft chip 三档）：

- **MCP servers 区**：列 aiOrchestratorStore 中 kind=mcp 的 items（名称/来源 chip/传输类型/启停=既有 setActive）+ 每行「探测」按钮 → 主进程 `probe(profileId)`（connect+listTools，返回 `ok/toolCount/error`）→ soft chip 三档（可用/未探测/失败+原因 tooltip）。
- **手动新增**：表单（name + stdio: command/args/env | http: url/headers）→ 写入 aiOrchestratorStore 作 `source=manual` 的 mcp item —— 导入/手动同一数据模型，`mcpProfilesFromItem` 直接消费，删除/启停免费复用。env 值走既有 secure-store authRefs 通道，不落明文。
- **skills 区**：active skills 列表（名称/描述/启停）+ 导入入口。
- IPC：复用 orchestrator store 既有通道（items CRUD/setActive），仅新增 `probe` 与 manual upsert 两口（S4 对齐现有通道命名风格）。

## 数据流（发送一轮）

```
用户发送 → intelligence-service
  ├─ autoContext? → buildHomeInjection() → systemParts 追加
  └─ agentTools? → pi CLI (--tools 白名单含 mcp 两工具)
       模型 → tuff_mcp_list_tools → gateway → registry(懒连,主进程) → 目录
       模型 → tuff_mcp_call → 确认门 → registry.callTool → 结果回流
       模型 → tuff_skill_read → contentRef 正文
```

## 边界与回退

- registry/runtime/import-service/LocalSkills **均不做行为变更**（新增方法除外）——orchestrator 岛零回归风险。
- 回退开关天然存在：autoContext 关 → 无注入；agentTools 关 → 无 MCP 工具；server 全禁用 → list 返回空目录。
- 不做（后续）：`/name` 显式点名语法、目录化 SKILL.md 用户目录来源（PRD 三档中的「用户目录」档——V1 只有内置注入逻辑 + 导入档，用户目录档立 P1 便签）、MCP server 断线自动重连 UI 提示。
