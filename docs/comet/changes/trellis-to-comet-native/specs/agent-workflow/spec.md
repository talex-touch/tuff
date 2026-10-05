# Project Agent Workflow

本规格定义本仓库切换后的工程协作行为，不改变 Tuff 产品功能或已保存数据格式。

## Entry points

omp、Claude Code 和 Codex 使用项目级 Comet Native。项目固定 Comet 0.4.4，CLI 通过 `mise exec -- comet` 调用。只安装三个批准目标；不初始化其他平台，不启用 Classic。

Skill 发现目录分别为 `.omp/skills/`、`.claude/skills/` 和 `.agents/skills/`。Codex 专属规则和 hooks 保留在 `.codex/`。平台规则必须指向同一项目知识与正式变更，不维护独立任务生命周期。

### Scenario: omp Native entry

Acceptance: A1

WHEN 新 omp 会话在仓库启动并调用 `/comet`，THEN 它发现项目 Skill 与 always-apply 规则，进入 Native。处于 Shape 或 Verify 等不允许实现写入的阶段时，真正的写入调用被 Hook 阻止。

### Scenario: Claude Native entry

Acceptance: A2

WHEN 新 Claude Code 会话在仓库启动，THEN 它加载 Comet Skill、规则、可移植项目 hooks；旧工作流注入不运行，用户已有 permissions 和其他非工作流设置保持原值。

### Scenario: Codex Native entry

Acceptance: A3

WHEN Codex 在受信任项目中启动，THEN 它从共享 Skill 根发现 Comet，读取统一项目入口。已安装 Hook 在本机支持与授权边界内实际运行；平台不支持的事件或未批准的 Hook 不能被宣称为已经强制执行。

## State and ownership

正式产物位于 `docs/comet/changes/`、`docs/comet/specs/` 和 `docs/comet/archive/`。配置在 `.comet/config.yaml`，Native-only、中文、batch、archive_confirmation 为 required。本机 `.comet/runtime/` 与当前选择不提交。

Runtime 是阶段、验收结果和报告的写入者。Agent 只编辑正式需求与规格，使用当前 continuation 推进，不手工伪造状态。恢复后的执行证据必须与当前候选、状态版本及工作区匹配。

### Scenario: portable recovery

Acceptance: A4

WHEN 会话中断或本机 Runtime 不再存在，THEN Runtime 能依据 `comet-state.yaml` 恢复正确阶段和下一步。无法安全复用的检查和独立验收保持待执行，不直接归档。

### Scenario: workspace and capability boundaries

Acceptance: A5

WHEN 写入位置与保存的工作区绑定不一致，THEN Runtime 拒绝推进并报告正确工作区。多个 Change 声明同一 capability 时，Archive 暴露顺序冲突，后续变更基于最新 Spec 重新对齐和验证。

## Engineering knowledge and retired work

工程规范位于 `docs/engineering/specs/{frontend,main-process,guides}/`。活审计独立维护在 `docs/engineering/reports/`。原工程约束、未解决缺陷及验证边界保留，过时的 Trellis 执行要求移除。

旧任务身份登记在 `docs/engineering/workflow/retired-task-index.json`；活跃任务冻结，归档任务保留历史身份。当前脏任务文档与证据保存为可读交接。没有真实需求确认的旧任务不会被批量创建为 Comet Change。

### Scenario: lossless handoff

Acceptance: A6

WHEN Trellis 项目资产退役，THEN 当前有效规范、活审计、全部旧活跃目标的去向，以及未提交或未跟踪任务文档和证据仍可读取；不猜测旧目标已完成或失效。

## Repository verification

文档保护继续检查有效链接、实质性需求与验收、占位内容、发布说明及 AI 文档契约。审计继续拒绝未知历史任务身份、空或损坏的身份来源和与实际源码相反的默认值断言。冻结记录不承担新任务生命周期。

### Scenario: CI independent of retired directory

Acceptance: A7

WHEN 工作区不包含 `.trellis/`，THEN 正常工程内容可以通过相关门禁；引用不存在目标、伪造审计任务或错误默认值，以及未填写有效验收的当前变更仍被拒绝。

### Scenario: single workflow cutover

Acceptance: A8

WHEN 新会话读取项目规则，THEN 默认进入 Comet Native，项目中没有仍执行的 Trellis hooks、生命周期脚本或失效规范入口。

## Authorization and compatibility

归档与 Git 交付分别授权。当前迁移不授权提交、合并、推送、创建 PR 或发布。不修改已序列化的 `PluginAiSessionsPlatform` 的 `trellis` 值，不覆盖其他会话的功能改动。用户设置和本机运行数据保持本机边界。

Codex 首次接入允许新增用户已批准的本仓库信任记录，并通过原生审核信任本仓库的两个 Comet hooks。不改变其他项目的信任、全局功能开关、模型或凭据。

### Scenario: compatibility and local state

Acceptance: A9

WHEN 迁移完成，THEN 已保存的产品兼容值和其他会话改动保持不变；Git 可共享资产不包含本机 Runtime、用户权限配置和执行日志。
