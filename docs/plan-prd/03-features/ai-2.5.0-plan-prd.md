# PRD: Tuff 2.5.0 AI 桌面入口收口

> 更新时间: 2026-05-10  
> 状态: Plan PRD / Scope Lock  
> 目标版本: 2.5.0  
> 适用范围: `apps/core-app`、`retired-ai-app`、`apps/nexus`、`packages/tuff-intelligence`、`plugins/touch-intelligence`

## 1. 背景与问题

Tuff 已经具备较完整的 Intelligence 底座：CoreApp 有 Provider、Capability、Prompt、Audit、Quota、Agent 与 Workflow；CoreBox 有 `touch-intelligence` 插件；AI 已形成独立 Chat-first 应用；Nexus Provider Registry / Scene 已进入通用供应商模型。

当前问题不是“缺少 AI 代码”，而是用户可感知入口分散、稳定能力边界不清、配置安全口径需要锁定：

- CoreBox AI 入口只提供轻量问答结果项，尚未形成桌面 AI 主链路。
- AI 能力完整但独立部署，与 CoreApp 桌面入口关系需要定义。
- Nexus Provider / Scene 已有 registry 与 CRUD，runtime orchestration 尚未闭环，不适合作为 2.5.0 主卖点。
- 多模态能力在配置/类型层已扩展，但部分 provider runtime 仍返回 unsupported，不能作为稳定承诺。
- BYOK 配置必须从普通 provider metadata 中剥离密钥，改为 secure-store 或 `authRef`。

## 2. 最终目标

业务目标：2.5.0 将 AI 板块定位为 **桌面 AI 入口收口版本**，让用户从 CoreBox / OmniPanel 直接完成问答、划词处理、剪贴板整理等高频桌面任务。

工程目标：复用现有 `intelligence.invoke()`、`@talex-touch/tuff-intelligence`、Provider/Capability 配置与审计能力，不重写 AI，不把 Nexus Scene runtime 编排塞进 2.5.0。

North Star：

- 用户有一个明确的桌面 AI 主入口，而不是在 CoreBox、AI、Assistant、设置页之间寻找能力。
- 任何桌面内容被选中、复制、截图或拖入后，都能进入一个可预览、可撤销、可审计的 AI Workflow。
- 2.5.0 Stable 能力只承诺文本 + OCR，避免把未实装多模态误包装成稳定能力。
- Provider 配置满足安全基线：metadata 可普通落盘，API Key / secret 只通过 secure-store 或 `authRef` 引用。

## 3. 现状与预期

| 方向 | 当前现状 | 2.5.0 预期 |
| --- | --- | --- |
| AI 入口 | CoreBox 有 `touch-intelligence` 插件；AI 是独立 Chat-first 应用；Assistant 仍偏实验 | 明确 CoreBox / OmniPanel 为桌面主入口，AI 作为高级 Chat / DeepAgent 能力来源 |
| 基础模型能力 | `tuff-nexus-default` 默认启用；OpenAI / Anthropic / DeepSeek / SiliconFlow / Local 已有配置结构 | 登录后基础 Chat / 翻译 / 摘要可用；BYOK 作为可选增强 |
| Provider 配置 | 配置页较完整，但 API Key 存储边界需要重新定义 | 密钥走 secure-store / `authRef`；禁止把明文 BYOK 作为稳定版设计 |
| 能力矩阵 | 文本能力较完整；OCR 有路径；图片/音频/video 配置存在但运行时支持不完整 | Stable 只承诺文本 + OCR；图片/音频生成列为 Experimental |
| Agent / Workflow | 底座和页面已有，但偏工程化 | 只选择 2~3 个高频桌面模板进入 2.5.0 MVP |
| Nexus Provider / Scene | Registry / Scene CRUD 已有，执行编排未闭环 | 作为架构约束和 2.5.x 后续方向，不作为 2.5.0 主卖点 |

## 4. 范围与非目标

### 4.1 Stable 范围

- CoreBox AI Ask：连续问答、复制回答、重新生成、失败可见、基础上下文。
- OmniPanel Writing Tools：划词翻译、摘要、改写、解释、纠错、调整语气、代码解释。
- Workflow `Use Model` 节点：手动运行、文本输入、结构化输出、失败重试、用量审计。
- Review Queue 最小闭环：AI 输出先进入预览队列，再由用户复制、应用到剪贴板、保存到文件或交给插件动作。
- Desktop Context Capsule：统一封装选区、剪贴板、OCR、文件元数据、当前应用名/窗口标题等非敏感上下文。
- Provider 基础体验：默认 Nexus provider + BYOK 配置说明。
- 审计与用量：记录 `traceId / provider / model / latency / usage / success / errorCode`，不保存完整 prompt 或完整 response。
- 插件权限：插件调用 AI 仍需 `intelligence.basic`，复制回答仍需 `clipboard.write`。

### 4.2 Beta 范围

- Workflow Template Center：剪贴板整理、会议纪要/摘要、文本批处理、代码解释/Review、日报/周报生成。
- Tuff Intents / Action Manifest：把插件动作、系统动作、Workflow 节点统一描述为可搜索、可编排、可审批的动作合同。
- Skills Pack：把 instructions、脚本、模板、资源打包成可安装的桌面 AI 能力包。
- Background Automations：定时、剪贴板、下载目录、截图/OCR 等触发器先进入 Beta，默认需要用户确认。
- AI 联动：作为高级 Chat / DeepAgent 入口或能力来源，不替代 CoreApp 桌面主入口。

### 4.3 Experimental 范围

- Assistant 悬浮球与语音唤醒。
- 多 Agent 并行任务面板、长任务工作区、跨 Workflow 的后台队列。
- `image.generate`、`image.edit`、`audio.tts`、`audio.stt`、`audio.transcribe`、`video.generate`。
- Nexus Provider / Scene runtime orchestration。

### 4.4 非目标

- 不在 2.5.0 承诺全量多模态生成/编辑能力稳定可用。
- 不重写 AI，不把 `retired-ai-app` 合并进 CoreApp。
- 不在 2.5.0 完成 Nexus Scene runtime 编排、Metering ledger、Health check 全链路。
- 不新增孤立 AI provider 模型；新增供应商仍遵守 Provider registry / Capability / Scene 解耦方向。

## 5. 用户场景

### 5.1 CoreBox 快速问答

用户在 CoreBox 输入 `ai 帮我总结这段内容`，系统通过 `text.chat` 返回可复制答案。失败时展示 provider、模型、错误原因与重试入口，不 silent failure。

### 5.2 OmniPanel 划词处理

用户选中文本后唤起 OmniPanel，可直接执行翻译、摘要、改写、解释。动作入口应复用现有 typed transport / SDK，不新增 raw event 分发。

### 5.3 剪贴板与 Workflow 模板

用户选择内置 Workflow 模板处理剪贴板文本，例如批量整理、会议纪要、文本摘要。模板执行需保留历史记录，涉及工具调用时按风险等级走审批。

### 5.4 AI 高级对话

需要长对话、工具卡、Websearch、DeepAgent 的用户进入 AI。2.5.0 只定义 CoreApp 到 AI 的产品关系与入口策略，不要求改造 AI runtime。

## 6. 下个版本场景包与工作包

外部参考只抽象为产品模式，不作为兼容目标：Codex 的后台任务、Review Queue、Skills、长任务审批；Apple Intelligence / Shortcuts 的 Writing Tools、Use Model、App Intents 与个人自动化。Tuff 2.5.0 的差异化落在桌面本地上下文、插件动作编排与本地优先审计。

### 6.1 OmniPanel Writing Tools（P0）

OmniPanel 是 2.5.0 AI 的第一优先入口。目标是让用户选中文本后直接进入高频 AI 动作，不需要先打开完整 Chat。

| 动作 | 能力映射 | 输出 | 验收口径 |
| --- | --- | --- | --- |
| 翻译 | `text.translate` | 译文 + 复制/替换 | 至少支持中英互译；失败显示 provider/model/errorCode |
| 摘要 | `text.summarize` | TL;DR + 要点列表 | 长文本自动截断或分段，不 silent failure |
| 改写 | `text.rewrite` | 更正式/更简洁/更自然 | 语气 preset 可选，默认不覆盖原文 |
| 纠错 | `text.rewrite` | 修正后文本 + 变更说明 | 输出进入 Review Queue |
| 解释 | `text.chat` / `code.explain` | 解释说明 | 代码片段优先走 `code.explain` |
| Review | `code.review` | 风险点 + 建议 | 仅对代码上下文展示，不伪装为安全审计结论 |

交互要求：

- 选区为空时不展示 Selection AI 主动作，只保留剪贴板/截图/OCR 入口。
- 结果默认进入预览区，用户明确点击后才写回剪贴板、文件或外部应用。
- OmniPanel 关闭后长任务可在 Review Queue 中继续查看，不丢失 trace 状态。
- 所有动作复用 typed transport/domain SDK，不新增 raw event 字符串分发。

### 6.2 Workflow `Use Model` 节点（P0）

Workflow 需要一个标准 AI 节点，作为后续模板和自动化的核心积木。

| 字段 | 要求 |
| --- | --- |
| 输入 | `text`、`selectionRef`、`clipboardRef`、`ocrRef`、`fileTextRef` |
| 输出 | `text` 或 JSON schema 约束后的结构化对象 |
| 能力 | 只调用 Stable capability；多模态生成不得进入默认模板 |
| 模型 | 默认 Nexus provider，可选 BYOK provider；密钥只引用 `authRef` |
| 审计 | 记录 traceId、workflowId、nodeId、provider、model、latency、usage、success/errorCode |
| 失败 | 支持重试、跳过、人工修正输入；失败原因必须可见 |

### 6.3 Workflow Template Center（P0/P1）

2.5.0 不做模板市场，先内置少量高频桌面模板，验证 Workflow 体验闭环。

| 模板 | 优先级 | 输入 | 输出 | 说明 |
| --- | --- | --- | --- | --- |
| 剪贴板整理 | P0 | 当前剪贴板文本 | 清洗后的结构化文本 | 去重、分段、格式化、提取 TODO |
| 会议纪要/摘要 | P0 | 文本/转写稿 | 摘要、决议、行动项 | 可导出 Markdown |
| 文本批处理 | P0 | 多段文本 | 批量翻译/改写/摘要 | 支持逐条状态与失败重跑 |
| 代码解释/Review | P1 | 代码片段/文件文本 | 解释、风险点、建议 | 不替代安全审计 |
| 日报/周报生成 | P1 | 剪贴板/历史片段 | 草稿 | 只生成草稿，不自动发送 |
| 截图 OCR 整理 | P1 | 截图 OCR 文本 | 译文/摘要/结构化结果 | 只承诺 OCR + 文本处理 |

模板必须支持保存、运行、查看历史、重跑、复制结果；涉及文件写入、外部应用、插件动作时必须进入 Review Queue。

### 6.4 Review Queue（P0）

Review Queue 是 AI 自动化的安全阀，避免模型输出直接修改用户环境。

- 低风险动作：复制结果、保存草稿、查看历史，可一步确认。
- 中风险动作：替换剪贴板、写入文件、批量处理，需要明确确认。
- 高风险动作：调用插件执行外部副作用、发送网络请求、执行命令，必须走权限与审批票据。
- Queue item 必须包含来源、能力、workflow/node、traceId、创建时间、状态、错误原因与可撤销策略。

### 6.5 Tuff Intents / Action Manifest（P1）

为后续大量 Workflow 工作量建立统一动作合同。插件动作、系统动作、AI 能力、Workflow 模板都应能被 CoreBox 搜索、OmniPanel 推荐、Workflow 编排。

最小字段：

```ts
interface TuffActionManifest {
  actionId: string
  title: string
  description?: string
  inputSchema: unknown
  outputSchema?: unknown
  permissions: string[]
  riskLevel: 'low' | 'medium' | 'high'
  reviewPolicy: 'none' | 'preview' | 'approval'
  examples?: Array<{ input: unknown, output?: unknown }>
}
```

约束：

- Action Manifest 只描述动作，不携带 provider secret、用户原文或敏感上下文。
- CoreBox 搜索动作时只能使用 title、description、examples 的非敏感摘要。
- Workflow 编排引用 actionId，不复制动作实现。

### 6.6 Skills Pack（P1 Beta）

Skills Pack 是面向高级用户和插件生态的能力包，不作为 2.5.0 Stable 主卖点。

首批建议：

- 文档处理 Skill：摘要、改写、Markdown 结构化。
- 表格处理 Skill：CSV/TSV 清洗、字段解释、简单公式建议。
- 代码分析 Skill：解释、Review、变更摘要。
- 发布检查 Skill：PRD/TODO/CHANGES 同步检查。

### 6.7 Background Automations（P1 Beta）

后台自动化必须保守启用，默认以“建议执行 + Review Queue”形态出现。

- 定时触发：每天工作简报、每周总结。
- 剪贴板触发：复制长文本后提示整理。
- 文件夹触发：下载目录出现 PDF/Markdown 后提示摘要。
- 截图触发：截图后 OCR + 翻译/摘要。

默认不允许自动发送、自动删除、自动覆盖文件或自动执行命令。

### 6.8 Desktop Context Capsule（P0）

AI 调用统一通过上下文胶囊传入非敏感上下文，避免每个入口自行拼 prompt。

| 上下文 | 可用范围 | 默认持久化 |
| --- | --- | --- |
| selection text | OmniPanel / Workflow | 否 |
| clipboard text | CoreBox / Workflow | 否 |
| OCR text | 截图/OCR Workflow | 否 |
| appName/windowTitle | 入口排序、提示词上下文 | 仅审计安全摘要 |
| file metadata | 文件摘要/批处理 | 仅路径引用或 fileRef |
| user prompt | CoreBox / AI | 默认不保存完整原文 |

## 7. 公共接口与合同

- 统一能力入口继续是 `intelligence.invoke(capabilityId, payload, options)`。
- 2.5.0 Stable 能力只承诺：
  - `text.chat`
  - `text.translate`
  - `text.summarize`
  - `text.rewrite`
  - `code.explain`
  - `code.review`
  - `vision.ocr`
- Provider 配置合同：
  - provider metadata、enabled、models、baseUrl、priority 可进入普通配置。
  - API Key / secret 必须进入 secure-store 或以 `authRef` 表示。
  - 旧配置迁移可读一次并写回安全引用；不得继续把明文 key 当作 SoT。
- Nexus Provider / Scene 合同：
  - 新 provider 进入 Provider registry。
  - 新使用场景进入 Scene。
  - 2.5.0 不要求完成 Scene runtime orchestration。
- Workflow / Action 合同：
  - `Use Model` 节点只能通过 `intelligence.invoke()` 调用 Stable capability。
  - Workflow 引用 `TuffActionManifest.actionId`，不得复制插件动作实现或绕过权限。
  - 写剪贴板、写文件、调用插件、网络请求、命令执行等副作用必须声明 `riskLevel` 与 `reviewPolicy`。

## 8. 里程碑

| 里程碑 | 交付内容 | 验收口径 |
| --- | --- | --- |
| M0 Plan PRD | 锁定 2.5.0 AI 定位、范围、非目标、能力分级 | 六主文档同步，`docs:guard` 通过 |
| M1 体验设计 | CoreBox AI Ask、OmniPanel Writing Tools、Review Queue 交互规格 | 有入口、状态、错误、权限、审计字段定义 |
| M2 Workflow 底座 | `Use Model` 节点、Context Capsule、Action Manifest 草案 | 手动运行、结构化输出、trace/audit 可追踪 |
| M3 模板闭环 | 剪贴板整理、会议纪要/摘要、文本批处理 3 个 P0 模板 | 保存、运行、历史、重跑、复制结果可复现 |
| M4 安全收口 | BYOK 密钥从普通配置剥离到 secure-store / `authRef` | 明文 key 不再作为稳定存储合同 |
| M5 验收冻结 | 文档、回归、风险与后续 2.5.x backlog 固化 | PRD / TODO / CHANGES / INDEX 同步 |

## 9. 质量约束

- 类型与调用：新增调用必须走 typed transport/domain SDK；不得新增 raw event 字符串分发。
- 安全：禁止 API Key、token、完整 prompt、完整 response 明文落普通 storage、localStorage、JSON 同步载荷或日志。
- 错误处理：provider 不可用、quota 不足、权限拒绝、模型不支持必须有用户可见原因。
- 性能：CoreBox AI 入口不得阻塞搜索主链路；长任务必须进入异步状态并可取消或重试。
- 权限：插件调用 AI 必须通过 `intelligence.basic`；高风险工具调用必须走审批票据。
- 自动化：Background Automations 默认不得自动执行高风险副作用，必须先进入 Review Queue。
- Workflow：模板不得内嵌 provider secret、明文 API Key 或不可审计脚本；节点失败必须可重试或可跳过。
- 审计：保留 traceId、provider、model、latency、usage、success/errorCode；默认不持久化原文输入与完整输出。
- 文档：任何行为/接口/安全边界变化必须同步 `README / TODO / CHANGES / INDEX` 至少对应入口；主线变化同步 Roadmap 与 Quality Baseline。

## 10. 验收标准

### 10.1 产品验收

- 未配置 BYOK 时，登录用户可通过默认 Nexus provider 完成一次 `text.chat`。
- CoreBox 输入 `ai 帮我总结...` 能得到可复制回答。
- OmniPanel 对选中文本至少完成翻译、摘要、改写、解释中的一种动作。
- provider 调用失败时 UI 展示可理解错误，不 silent failure。
- Workflow `Use Model` 节点可手动运行，并能输出文本或 JSON schema 约束结果。
- Workflow 至少 3 个 P0 内置模板可保存、运行、查看历史、重跑、复制结果。
- Review Queue 能展示 AI 输出来源、traceId、风险等级、确认动作和失败原因。
- Action Manifest 草案能覆盖至少 1 个系统动作、1 个插件动作、1 个 AI 动作与 1 个 Workflow 模板。

### 10.2 安全验收

- PRD 与实现均明确 API Key 不落普通 storage。
- 旧配置迁移策略与兼容边界可追踪。
- 审计记录不包含完整 prompt / response。
- 插件调用 AI 仍需 `intelligence.basic` 权限。
- 写文件、调用插件、网络请求、命令执行等副作用默认进入 Review Queue 或审批票据，不允许模型输出直接执行。

### 10.3 文档验收

- `pnpm docs:guard`
- `pnpm docs:guard:strict`
- 同步 `docs/plan-prd/README.md`、`docs/plan-prd/TODO.md`、`docs/plan-prd/01-project/CHANGES.md`、`docs/INDEX.md`。

## 11. 回滚与兼容策略

- CoreBox / OmniPanel AI 入口可通过功能开关回退到当前 `touch-intelligence` 轻量问答能力。
- Workflow `Use Model` 节点可通过 feature flag 只保留模板草稿，不进入运行入口。
- Review Queue 可降级为只读结果历史，不执行写回动作。
- BYOK 迁移失败时返回 `provider_config_unavailable`，不回退明文存储。
- AI 联动失败不阻塞 CoreApp Stable 文本能力。
- Nexus Provider / Scene runtime 未完成时保持 registry 只作为配置与架构约束，不承载 2.5.0 稳定执行路径。

## 12. 后续 2.5.x 方向

- Nexus Scene runtime orchestration：将 AI Chat、划词翻译、截图翻译、汇率换算逐步接入 Scene。
- 多模态真实 adapter：补齐 image/audio/video provider runtime 与验收矩阵。
- Assistant 默认入口评估：在稳定权限、语音唤醒与错误处理后再决定是否从实验转 Beta。
- Workflow 模板市场化：把高频桌面 AI 模板沉淀为可安装、可审计、可版本化能力。
- 多 Agent 长任务工作区：引入并行任务、后台队列、结果审阅与失败恢复，但不进入 2.5.0 Stable。
