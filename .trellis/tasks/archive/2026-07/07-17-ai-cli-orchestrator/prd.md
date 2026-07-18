# AI CLI 中央调度与 Skills 兼容
> 状态：已实现并完成质量门（2026-07-18）


## Goal

在 Talex Touch 内部集成一个以 Pi 为核心的中央调度器，统一用户触发与后台自动化 AI 任务；用户现有 Pi CLI、Codex、Claude Code、Oh My Pi、OpenCode 只作为配置来源，用于快速导入 Skills、MCP、Agents、Commands 与 Rules/Instructions，不作为任务执行后端。

用户价值：保留已有 AI 工具生态配置，同时只维护一套 Tuff 任务生命周期、权限、模型、用量与审计体系。

## Background

- `apps/core-app` 已有 `TuffIntelligenceRuntime`，覆盖 session、plan/execute/reflect、暂停/恢复/取消、trace、工具预算与审批。
- CoreApp 另有 `AgentManager` / `AgentScheduler` / `AgentExecutor`；`IntelligenceDeepAgentOrchestrationService` 已连接 Agent/Workflow、MCP 与现有运行时。新增 Pi 时不能形成第三套生命周期或长期双轨。
- `packages/tuff-intelligence` 已提供 Engine/Decision/Store adapter、`ConversationAgentPort` 与 `SkillRegistry`；当前 `SkillRegistry` 只有内存注册、指令加载和触发匹配，尚未形成产品级多来源配置仓库。
- 仓库自身同时存在 `.agents/skills` 与 `.opencode/skills`，已经需要来源、scope、冲突与规范化语义。
- Pi 官方 npm 体系区分轻量 `@earendil-works/pi-agent-core` 与完整 `pi-coding-agent`。本需求只需要前者的 Agent loop、事件与 tool hooks。
- Pi 官方不提供宿主级文件、进程、网络或凭据权限系统，默认继承启动进程权限，因此实际工具必须留在 Tuff 治理边界。
- Pi、Codex、Claude Code、OMP 与 OpenCode 均支持 `SKILL.md`/Agent Skills 生态，但目录、递归、frontmatter 扩展、优先级和冲突规则不同；MCP、Agent、Command、Rule 格式差异更大。

## Requirements

### R1. Pi Runtime

- `@earendil-works/pi-agent-core` 是迁移完成后的唯一 Agent loop。
- Pi npm package 随 Tuff 锁版本打包，在 Electron `utilityProcess` 中直接运行；不调用用户系统中的 `pi` CLI，也不使用 Pi CLI RPC 作为主集成协议。
- Electron main 通过 Tuff typed IPC 管理 Pi Agent 生命周期。业务层不得直接依赖 Pi package 类型。
- 每个正式 AI 任务都经过 Pi：CoreBox、Assistant、Workflow、Plugin AI、用户任务与无人值守 automation 均不保留旁路。
- Pi 在启动任何子 Agent 前必须输出结构化委派计划，包含 profile、目标、依赖、工具范围、并发和成本预算；交互任务由用户确认后才创建 child runs。
- 每个被确认的委派节点由 Tuff 建立独立 child run/session，并继承不超过父任务的 scope、权限、预算和审计关联。
- Pi 迁移完成后删除 DeepAgent 与 legacy Agent loop。迁移 feature flag 只用于短期验证/回滚，不形成永久分流。

### R2. Model, Tool, and Permission Ownership

- Pi 的模型调用全部通过 Tuff host-owned model adapter，复用现有 Provider/Capability routing、secure secret、quota、fallback、usage 与 audit。
- Pi 不读取或维护独立 provider/auth/model 配置。
- Pi 只拥有 Agent loop 与决策，不直接使用 package 自带文件、终端、浏览器或 MCP 工具。
- Utility Process 只接收 Tuff 生成的 host-tool schema；每个调用回到 Tool Registry / MCP Registry，统一执行权限、审批、取消、超时、审计和结果清洗。
- 外部 Agent 配置的 tool allowlist、sandbox 或 permission 只能进一步收紧 Tuff 权限，不能授予能力或绕过审批。

### R3. Durable Session and Recovery

- Tuff Intelligence Runtime 是 durable session、event sequence、approval、trace、usage、run status 与恢复的唯一真相源。
- Pi Agent 是可丢弃运行投影，不依赖 Pi session 文件。
- 应用重启或 Utility Process 崩溃后，从版本化 Tuff snapshot/event projection 重建 Pi messages、context、profiles 和 active tool set。
- 已完成 tool call 以稳定 `callId` 去重；unfinished non-idempotent call 不自动重放；只有显式 retry-safe/idempotent 工具可自动重试。
- pending approval 跨重启保持 pending；provider stream 中断进入明确 `interrupted` 状态，不猜测丢失输出。
- Utility Process 退出、无响应、取消和应用退出必须映射为现有 Runtime 的明确终态。

### R4. Background Automation

- Pi 首批同时接管用户触发任务与后台 cron、开机、文件/事件触发任务，并复用现有 durable scheduler owner。
- automation 启用时固化版本化预授权 policy：工具/MCP、路径、网络目标、成本、步骤、运行次数、超时与重试预算。
- policy 内操作自动执行；越界调用持久化为 `pending_approval`、释放并发槽并通知用户，批准后恢复。
- 后台 automation 不弹出交互式委派确认，只能自动执行启用 automation 时已预批准的 Agent profiles/委派范围；计划需要未授权 profile 或更高预算时进入 `pending_approval`。
- policy 变更只影响尚未开始的 run；禁止继承其他会话或“上次允许”的临时权限。
- 默认每个 automation single-flight。运行中、休眠或退出期间的重复触发合并为一个 pending run，保留 `missedCount`、时间范围和最新 payload，恢复后只补跑一次。
- 高级策略可选 `skip` 或有界 `replay`，但所有模式都有队列、并发与成本上限。
- 审批拒绝、过期或 automation 版本变化必须进入明确终态，不允许无限悬挂。

### R5. Import Sources and Types

- 为用户现有 Pi、Codex、Claude Code、OMP、OpenCode 提供独立只读 source adapter。
- adapter 发现 user/global 与 project/workspace 来源，并解析该来源真实支持的 Skills、MCP、Agents、Commands、Rules/Instructions。
- 某来源不支持某类型时返回 N/A；不得伪造兼容。
- 首批不导入 Hooks、插件包、模型偏好、provider/auth 凭据或外部执行策略。MCP connection secrets 按 R9 例外处理。
- adapter 只读配置文件，不执行 CLI，不运行 command/hook/script，不自动抓取 remote instruction URL，不反向写入外部配置。
- 各 adapter 独立失败；一个来源损坏不得阻止其他来源返回结果。

### R6. Unified Import Model

- 每个 candidate 使用稳定 source identity，至少包含 source CLI、source scope、canonical root、kind 与 source key。
- 同名项以 `source/scope/type/name` 语义的稳定命名空间并存；用户在预览中选择默认别名，禁止按扫描或导入顺序覆盖。
- 默认保留来源 scope：user/global 进入 Tuff global；project/workspace 绑定原 canonical workspace/repo root。预览允许显式调整目标 scope。
- workspace 配置只在匹配且已信任的 workspace 下可见，不能泄漏到全局任务。
- 每个导入项同时保存凭据清洗后的完整只读 source snapshot 与 Tuff normalized projection；MCP secret 仅以 `authRef`/fingerprint 表示，provider/auth 字段只保留结构和 `[redacted]`。
- 未知/不可映射字段不生效并显式列为 ignored/blocking；不得静默丢弃。核心字段有效时允许带警告导入，无法安全降级时拒绝该项。
- 类型语义保持：Skill 按需加载；Agent 是具名 profile/委派角色；Command 仅显式调用；Rule/Instruction 按 scope/条件注入；MCP 是受治理工具源。
- explicit-only Command 不得变成自动 Skill，可选 Skill 不得变成 always-on Rule。

### R7. User-triggered Import Flow

- 设置页提供一个“从其他 AI 工具导入”按钮，一次只读扫描全部已知来源。
- 结果按 CLI、scope 和类型分组；支持全局刷新与单独重扫某来源。
- 预览展示 added/changed/unchanged/source-missing/invalid、字段映射、冲突、requested permissions、脚本/MCP command、URL、不可迁移字段与安全警告。
- 只有用户勾选并确认的项才写入并立即启用；未勾选项不导入。
- 导入不后台监听、不持续同步。后续更新由用户再次点击导入触发。
- 导入项是只读 snapshot；用户修改时复制为独立 Tuff 本地配置。
- 重新导入只更新相同 source identity，不覆盖其他来源、其他 scope 或本地副本。
- 外部项消失时标记 `source-missing` 并显示差异，保留现有 snapshot，直到用户显式停用或删除。
- 外部源不可用、解析失败或冲突未解决时保留当前已验证 snapshot，禁止以空结果静默清空。

### R8. Skill, Agent, Command, Rule, and MCP Runtime Semantics

- Skill 只将 name/description 元数据暴露给 Pi；完整内容通过 host-owned `skill.read` progressive disclosure 加载。
- Agent profile 的 model 字段只能映射到 Tuff model role；无法映射时继承 Tuff 默认并告警。
- Command 参数由 Tuff 展开；动态 shell/file injection 只能转换为受治理 tool/context request，禁止在导入阶段执行。
- Rule/Instruction 的 scope、glob 与 always-apply 语义必须显式保留；远程引用默认不抓取。
- 导入 MCP 只注册到 Tuff MCP Registry，首次实际 tool call 时惰性启动或连接，空闲后按策略释放；后台 run 可预热。
- Pi package 不得直接启动或连接 MCP server。

### R9. MCP Secret Migration

- 用户确认导入后，MCP env、Header、token、client secret 与可读取认证值全部自动迁入 Tuff secure store；普通配置只保存 `authRef` 与 fingerprint。
- secret 只允许在受信 Electron main 边界重新读取并写入 secure store。renderer、Pi Utility Process、日志、trace、audit 与预览只接收字段名、掩码和 fingerprint。
- MCP 导入必须原子化：secret 写入、snapshot、projection、registry activation 任一步失败时均不激活部分 server，并回滚本次新建 authRefs。
- 重新导入发现 secret fingerprint 变化时，在确认页明确标记。
- 外部工具 keychain/DB 中无法安全导出的 OAuth refresh token 不得伪造成功；定义可导入为 `reauth-required`，启用前在 Tuff 完成授权。
- 除用户在 MCP 导入确认页授权的上述迁移外，不复制或展示外部 CLI 的 token、API key、OAuth 凭据或 cookie。

### R10. Storage and Cutover

- SQLite 是 imported source/item/alias/revision、normalized projection、automation definition/policy/run 与诊断状态的本地业务真相源。
- 大型 raw snapshot、Skill assets/scripts 可进入受控 content-addressed blob store，SQLite 保存 hash/ref；secure store 保存 MCP secret。
- 切换完成后迁移全部正式调用方并移除旧 Agent loop、重复 scheduler/executor 与 `deepagents` 运行依赖。
- 不保留兼容别名、永久 feature flag、入口级分流或外部 CLI 执行 adapter。

## Acceptance Criteria

- [x] AC1：packaged Electron 中，CoreBox/Assistant/Workflow/Plugin AI/Automation 都通过同一 Pi Runtime Host，并产生同一 Tuff session/run/trace 契约。
- [x] AC2：Pi 使用 Tuff provider 完成真实流式 turn，provider/model/usage/quota/audit 与当前 Intelligence SDK 语义一致。
- [x] AC3：所有实际 tool/MCP 调用通过 Tuff 权限与审批；Pi Utility Process 不持有 provider/MCP secret。
- [x] AC4：在 provider stream、tool call、pending approval 边界终止 Utility Process 后，Tuff 可重建 Pi 状态且不重复非幂等副作用。
- [x] AC5：后台 automation 的多次错过/重叠触发默认合并为一个带 `missedCount` 的补跑；越界工具调用暂停并通知。
- [x] AC5a：交互任务在任何子 Agent 启动前展示结构化委派计划；未确认不创建 child run。后台任务只委派预批准 profiles，越界时暂停。
- [x] AC6：统一导入按钮可同时扫描 Pi、Codex、Claude、OMP、OpenCode，并在单一预览中分组展示候选与独立诊断。
- [x] AC7：Skills、MCP、Agents、Commands、Rules/Instructions 保持各自触发语义；同名项命名空间并存并可选择默认别名。
- [x] AC8：导入项是只读 snapshot，可复制为本地配置；手动重新导入不会覆盖其他来源、本地副本或静默删除 source-missing 项。
- [x] AC9：MCP secret 经用户确认后原子迁入 secure store；renderer、Pi、日志、trace、audit 中不存在明文；不可导出 OAuth 显示 `reauth-required`。
- [x] AC10：MCP 只在首次使用时惰性启动；导入扫描与确认过程不执行外部命令、脚本或远程指令。
- [x] AC11：完成 clean cutover 后，代码中只剩 `pi-agent-core` Agent loop，无 DeepAgent/legacy Agent 执行路径或 `deepagents` 运行依赖。
- [x] AC12：`design.md` 与 `implement.md` 经用户确认后才拆分/启动实施任务；实施已在明确批准后进行。

## Verification Evidence

- `corepack pnpm -C apps/core-app exec vitest run ...`：13 个相关测试文件、128 个测试全部通过，覆盖 Pi Host、审批/恢复、automation、五来源导入、原子 secret、source-missing、Rule glob、Command 参数、MCP 生命周期及正式入口桥接。
- `corepack pnpm --filter @talex-touch/core-app typecheck:node` 与 `typecheck:web`：通过。
- `corepack pnpm --filter @talex-touch/tuff-intelligence build`、`@talex-touch/intelligence-uikit typecheck`、`@talex-touch/core-app build:vite`：通过；构建产物包含独立 `out/main/pi-agent-runtime-worker.js`。
- `corepack pnpm lint:changed`：通过。
- 真实 Electron `utilityProcess` smoke：成功 turn 返回 `hello from tuff bridge` 与 7 tokens / 0.002 cost；model error 与未知 cost budget 均进入失败终态，不误报 completed。
- 隔离 Core App 实例浏览器验收：Intelligence 设置页扫描到五类 CLI provider，blocked provider config 未被勾选，alias/target-scope 控件及分组候选正常渲染；未执行导入写入。

## Out of Scope

- 调用用户系统中的 Pi、Codex、Claude Code、OMP、OpenCode 执行任务，或兼容其会话、审批、diff、usage、subagent 协议。
- 首批导入 Hooks、插件包、模型偏好、provider/auth 配置和外部执行策略。
- 后台自动同步、外部配置写回或导入 snapshot 与本地副本三方合并。
- 用终端文本解析、静默忽略字段或伪造能力来宣称兼容。
