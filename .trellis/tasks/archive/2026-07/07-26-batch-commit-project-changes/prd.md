# 分批提交当前项目改动

## Goal

将当前工作区中尚未提交的业务代码按独立功能、独立回滚和测试归属拆成清晰的 Conventional Commits，在不推送远端、不改写历史、不混入 Trellis 过程文件的前提下完成本地提交。

## Background

- 当前分支为 `master`，相对 `origin/master` 为 ahead 3 / behind 0。
- 暂存区为空；工作区包含 40 个已跟踪业务文件和 2 个未跟踪业务文件的改动。
- 差异横跨 core-app、Nexus、TuffEx、共享 transport 和 touch-intelligence 插件。
- 研究清单将业务差异划分为 19 个候选逻辑组；8 个共享文件需要按 hunk 拆分。
- 详细证据、风险、依赖与最小验证命令见 `research/commit-inventory.md`。

## Requirements

- 每个提交只包含一个可说明、可验证、可独立回滚的逻辑单元。
- 实现、直接对应测试与必要依赖声明必须放在同一提交或按明确依赖顺序提交。
- 对共享文件使用 hunk 级暂存，并在每次提交前完整复核 staged diff。
- 提交消息遵循仓库现有英文 Conventional Commit 风格。
- 每组至少执行研究清单中的最小验证；高风险组还需执行适用的扩展验证。
- 不执行 `git push`、`git commit --amend`、rebase、reset 或历史重写。
- 不提交 `.trellis/tasks/07-26-batch-commit-project-changes/` 及其他过程性 Trellis 文件。
- 不修改与完成分组、验证和提交无关的业务代码。
- 若验证失败、存在已确认行为缺陷或高风险改动缺少关键覆盖，允许在当前逻辑边界内做最小修复或补充测试；验证通过后再提交。

## Acceptance Criteria

- [x] 所有纳入范围的业务差异均归入明确提交组，不存在误混文件或 hunk。
- [x] 每个提交的 staged diff 已复核，提交消息与内容一致。
- [x] 每个已提交组的最小验证通过；无法在当前逻辑边界内最小修复的组保留未提交并说明阻塞原因。
- [x] 最终本地提交历史按依赖顺序排列，未执行远端推送。
- [x] 最终工作区只剩明确排除、阻塞或 Trellis 过程文件，并向用户逐项说明。

## Out of Scope

- 推送远端、创建 PR、改写已有本地提交历史。
- 顺手重构或修复当前差异之外的问题。
- 将本次 Trellis 任务过程文件混入业务提交。

## Decisions

- 采用“最小修复后提交”门禁：允许在候选组现有边界内补测试或修复确认缺陷，不允许原样提交已知失败；无法最小闭环的组保留未提交。
- 接受 G12 文档 demo 接近视口自动激活策略及长文档滚动后全部 demo 保持挂载、JS heap 约增加 7.5 MB 的当前取舍，将 G12 纳入提交。
- 用户在 beta.23 发布前明确接受 G02 的分块写入语义：每个 chunk 内文件行与扩展行保持原子；后续 chunk 失败时已完成 chunk 保留，由下次基于唯一 `files.path` 的扫描补齐缺失应用。对应 focused tests 必须证明 chunk 数和部分成功行为。
