# AI 工具链：组件扩容、工具调用与智能基建

父任务：无（任务树根）。前序：`.trellis/tasks/08-05-tuffex-ai-suite`（①~④ 已落地：流式渲染、会话流、parts 组件、首页融合）。

## 背景

用户需求（2026-08-05，首页对话可用后追加）：

1. AI 能调用各种工具：搜索、打开文件、整理文档、调用 tuff 内部插件；能生成**交互式 UI**（给数据 → 生成数据分析报表）
2. 后台配置 skills 与 MCP，支持自动选择导入（参考 orca 的模式）
3. 参考 elements.ai-sdk.dev 复刻一套 AI 组件到 tuffex ai 系列

## 已探明地基（research/ 各子任务）

- **pi agent loop 完备**：`--tools` 白名单、npm 扩展机制、`--mcp-config` 原生 MCP、NDJSON 全事件链（thinking_*/toolcall_*/toolResult）实测可直接映射 AiToolCallPart / AiReasoningPart
- **渲染件就绪**（③）：TxToolCallCard 四态 + widget 展面槽、TxReasoningDisclosure、parts 流水线
- **仓内已有** `ai-cli-import-service.ts`（AiMcpImportCandidate 扫描导入候选）与 intelligence 类型层的 tool/workflow 模型
- widget 沙箱运行时（arrow-js）已可被会话内卡片宿主

## 任务图

| 子任务 | 交付物 | 依赖 |
|---|---|---|
| A `08-05-tuffex-ai-elements-port` | AI Elements 缺口复刻 P0：Confirmation / Sources / Suggestion / Context / ChainOfThought（P1 候补列表在其 PRD） | 无 |
| B `08-05-home-tool-loop` | 首页工具调用链路：pi loop 事件解析 → parts、内置工具（搜索/文件/文档/插件 feature）、tuff pi-extension、交互式 widget 工具、权限确认门 | A 的 P0（UI）；C 弱依赖（MCP 挂载可后接） |
| C `08-05-skills-mcp-config` | 设置页「技能与 MCP」：skills 目录管理、MCP servers 管理、自动导入（复用 import-service）、自动选择注入 | 无（产出被 B 消费） |

## 跨子任务约束

- **安全第一**：工具执行必须过确认门（可按工具级记住选择）；危险工具（写/执行类）默认拒；widget 结果只经既有沙箱渲染；pi 子进程的工具白名单由应用侧显式下发，永不裸放
- **provider 抽象**：事件→parts 的协议层不锁死 pi（云 provider 后续接同一 parts 流）；pi 是首个实现
- tuffex 新组件沿用既有惯例（`--tx-*`、单测、`components.ts` 注册、英文默认文案）
- 每子任务独立可验（mock 驱动），B 的端到端验收用真 pi

## 跨子任务验收（父任务集成审查）

- [ ] 首页问「找出 /tmp 下最大的三个文件并整理成表格」：确认门 → 工具卡片走四态 → 结果表格渲染，全程流式
- [ ] 给一段 CSV 数据要求做成报表：widget 工具返回交互式图表卡片（沙箱渲染）
- [ ] 设置页导入一个 MCP server 后，其工具出现在会话可用工具里并可被调用
- [ ] 拒绝确认 → 该工具跳过且会话可继续；stop 杀死整个工具循环无孤儿进程
- [ ] skills 增删后，下一轮会话的注入随之变化（自动选择开关可关）

## 明确不做（本任务树）

- 云 provider 的工具协议（OpenAI/Anthropic tool-use 接同一 parts 流：另立任务）
- AI Elements 的 Voice / Workflow(Canvas) 组
- 插件第三方工具的应用商店化分发（本轮只接内部 feature 调用）

## 开放决策（子任务 design 定案）

1. tuff pi-extension 的进程通信方式（extension→tuff 主进程：本地 IPC/HTTP/stdio 桥）——B design
2. skills 的存储形态（目录 SKILL.md vs 库表）与自动选择的相关性信号——C design
3. Confirmation 的记忆粒度（每工具/每会话/永久）——A/B design 联合定案
