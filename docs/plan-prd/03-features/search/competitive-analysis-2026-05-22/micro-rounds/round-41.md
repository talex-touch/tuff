# 微审计 41/70

- 审计主题：uTools AI Agent tools 官方能力是否已纳入 Tuff 竞品映射；重点核对 `plugin.json.tools` + `utools.registerTool` 的双阶段语义，是否应映射为 Tuff 插件工具注册合同，而不是误判为当前 `touch-intelligence` 已经完成插件工具化。

- 读取/核对的文档或源码锚点：
  - `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/04-utools-plugin-cross-platform.md`
    - 第 1 节明确记录 uTools 已把插件能力推向“人与 AI Agent 共用的工具平台”，插件能力可通过 `plugin.json.tools` 暴露给 AI Agent，但仍要求运行时代码完成注册。
    - 第 2.1 节把 AI Agent 工具拆成两段：`plugin.json.tools` 声明工具，运行期通过 `utools.registerTool` 完成真实注册。
    - 同节给出的 Tuff 映射是 Intelligence / Workflow tool registry，但必须复用 Manifest、权限、`sdkapi` 与审计事件；同时明确不允许 manifest-only tool 伪装成可调用工具。
    - 第 4 节把“AI 制作插件 / 智能体”列为生态映射项，要求 AI 生成只输出草稿，必须经过 `tuff validate --strict`、权限说明审查和真实 register evidence。
  - `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/11-100-round-cross-review-ledger.md`
    - 第 41 条已把本轮判断点定义为“uTools AI Agent tools 官方能力是否已纳入”，结论草案是文档已记录 `tools` 声明 + 运行期注册，Tuff 映射要求 stable id、权限、schema、审计。
  - `packages/utils/plugin/index.ts`
    - `ITouchPlugin` 当前包含 `features: IPluginFeature[]`、`declaredPermissions`、`sdkapi`、`addFeature()` / `delFeature()` / `triggerFeature()` 等插件 feature 能力面。
    - Manifest 类型当前暴露 `features?: IPluginFeature[]`、`permissions`、`permissionReasons`、`dev`、`build` 等字段；未看到一等的 `tools?: ...`、tool input schema、tool approval policy 或 Agent 可调用注册字段。
    - `IPluginFeature.acceptedInputTypes` 与 `onFeatureTriggered()` 可承接用户触发的 feature 输入，但这仍是 CoreBox feature / Prelude handler，不是 AI Agent tool registry。
  - `packages/utils/types/intelligence.ts`
    - Intelligence 类型已包含 `WORKFLOW` / `AGENT` capability、`WorkflowStepKind = 'prompt' | 'tool' | 'agent' | 'model'`、`ToolSource = 'builtin' | 'mcp'`、`tool.called` / `tool.completed` / approval trace event 等内部 AI workflow / agent 结构。
    - `IntelligenceAgentPayload.tools?: IntelligenceAgentTool[]` 说明 agent capability 可以接收工具列表；但这属于 AI capability payload，不等价于插件 manifest 自动注册工具。
    - `TuffIntelligenceApprovalTicket` 已有 toolId、riskLevel、approval status 等审批模型，说明 Tuff 有工具审计/审批的类型基础，但仍缺插件侧注册入口和 manifest 校验合同。
  - `packages/utils/plugin/sdk/intelligence.ts`
    - 插件 SDK 暴露的是 `intelligence.invoke(capabilityId, payload, options)` 与 `ttsSpeak()`，并把 `_sdkapi` 透传到 typed channel。
    - 该 SDK 允许插件调用 Tuff Intelligence capability；它不是 `registerTool()`，也没有把插件函数发布给 Agent 调用。
  - `plugins/touch-intelligence/manifest.json`
    - `touch-intelligence` 声明 `sdkapi: 260428`、`category: "ai"`、required permission `intelligence.basic`、feature `intelligence-ask`，并支持 `acceptedInputTypes: ["text", "image"]`。
    - 该插件是 CoreBox 里的 AI Ask 用户入口；manifest 没有 `tools` 字段，也没有 tool schema / approval / Agent registry 声明。
  - bundled plugin manifest 扫描
    - 当前官方 bundled plugins 的 `manifest.json` 只命中 `sdkapi`、`permissions` 等字段；未发现 `tools` 字段。

- 结论：
  - 主文档已正确纳入 uTools AI Agent tools 这个官方能力点，且没有只把它当作普通插件 feature 或普通 AI Ask 功能处理。
  - Tuff 当前具备三类底座：插件 Manifest / Prelude / feature 权限体系，Intelligence capability / workflow / agent 类型，和 tool approval / trace 的内部类型模型。这些足以支撑后续设计插件工具注册合同。
  - 但当前不能宣称 Tuff 已完成 uTools AI Agent tools parity。`touch-intelligence` 是用户主动触发的 CoreBox AI 问答插件；`intelligence.invoke()` 是插件调用 AI capability 的 SDK；二者都不是“插件把自身能力注册为 Agent 可调用 tool”的合同。
  - 最小后续合同应保持主文档里的边界：允许无 Surface 的 AI tool，但必须有 stable tool id、manifest 或 runtime registration schema、权限理由、`sdkapi` hard-cut、输入/输出 schema、risk level、approval policy、调用审计和真实 register evidence。
  - KISS/YAGNI 角度看，首版不需要做 AI 生成插件闭环或完整工具市场；只需要一个 `plugin-tools-v1` 小合同，把 `manifest declares`、`runtime registers`、`agent can call only after permission/approval` 三件事跑通，并用 `tuff validate --strict` 阻断 manifest-only 假工具。

- 是否发现需修正的主文档问题：否。`04-utools-plugin-cross-platform.md` 与 `11-100-round-cross-review-ledger.md` 已明确区分 uTools `tools` 声明、运行期注册、Tuff Intelligence / Workflow tool registry 映射和审计边界；源码核对结果支持“有底座，未落地插件工具注册合同”的口径。

- 本轮未改业务代码、未提交 git 的说明：本轮只新增 `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/micro-rounds/round-41.md` 并更新 `.codexpotter` 进度记录；未修改业务代码，未修改 `01-11` 主分析文档，未修改 `docs/INDEX.md`、README、TODO、CHANGES，未执行 git commit / git push / 创建分支 / reset / checkout / 工作树清理。
