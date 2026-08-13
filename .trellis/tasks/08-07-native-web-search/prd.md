# 接入 provider 原生联网搜索

父任务：`08-07-home-chain-and-native-search`

## Goal

让首页对话具备联网搜索能力，不再因工具集里没有搜索而退化为凭记忆作答。

## 现状

助手回答「当前没有可用的联网搜索工具」属实，不是 UI 误报。

`tool-registry.ts` 注册的 11 个工具全部本地：文件搜索/读/写/打开、图表、skill 读取、MCP 目录与代理、插件能力列举与调用、表单渲染。没有任何联网搜索工具。模型于是去试 `tuff_mcp_list_tools` 碰运气，撞上空状态提示（`tool-registry.ts:472-484`），随后凭记忆作答。

完整链路与扫描证据见 `research/provider-search-feasibility.md`。

## 阻塞：选定路线与运行时冲突

用户选定「provider 自带 server-side search」。调研结论是该路线**当前不可直接落地**：

1. 首页对话的工具调用由 pi CLI 独占。`provider-factory.ts:20` 只有 `PiCliProvider` 与 `LocalProvider` 两条分支，而 `langchain-openai-compatible-provider.ts` 对 `bindTools|tools|toolCall|tool_call` **0 命中**（正对照有效）—— 非 pi 路径根本不具备工具调用能力。
2. pi 0.84 既无内置 web search，也无 server-side 工具透传通道。对 `pi-coding-agent/dist`（789 文件）与 `pi-ai/src`（207 文件）的带正对照扫描，唯一命中是 `anthropic-messages.ts:98` 的 `"WebSearch"` 字符串，属于模仿 Claude Code 工具命名的大小写查找表，**假阳性**。

即：要走 server-side search，必须先在上游 `~/Workspace/earendil-pi` 增加透传能力（且本机 pi-ai 软链为 0.83、CLI 为 0.84，版本先要对齐），这是跨仓改造，不构成本仓可独立验收的交付。

## 待裁决

三条路线的代价与风险见 `research/provider-search-feasibility.md` 第 5 节：

- **A. 上游改 pi** —— 最贴近用户原意，跨仓，周期最长
- **B. 自建 `tuff_web_search`** —— 本仓唯一自洽路线，复用现有确认网关与风险分级，但需管理第三方搜索 API 凭据（用户此前明确未选）
- **C. 直连 provider 旁路** —— 与工具网关的确认/审计机制割裂，不推荐

**在用户裁决前不推进实现。** 不得以「B 更容易」为由自行替换选定路线。

## Requirements（待路线确定后细化）

- R1 首页对话在需要外部事实时能真正联网检索，而非声明无能力
- R2 搜索结果的来源可追溯（对应 `AiSourcesPart` 已存在的 sources 部件类型）
- R3 联网调用须经现有工具网关的确认与风险分级，不得开辟绕过审计的第二通道
- R4 无搜索能力可用时（未配置凭据 / 上游不支持），空状态提示要明确指向用户可执行的动作，而非让模型误以为该去试 MCP

## Acceptance Criteria（待路线确定后细化）

- [ ] 验收标准待用户在上述 A / B / C 三条路线中裁决后补全；裁决前不推进实现
