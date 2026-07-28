# Design — 收口全部开放 GitHub Issues

## Role And Boundary

本任务是协调型父任务，不直接承载跨模块代码改动。每个可独立验证的 Issue 处置由子任务拥有；父任务只维护基线、依赖、GitHub 状态和最终集成验收。

## Disposition Model

每个 Issue 必须经过同一状态机：

1. `triaged`：以当前 `master`、Issue 评论、测试与支持矩阵核验现状。
2. `planned`：明确为代码修复、证据关闭、替代关闭或等待报告者信息。
3. `verified`：代码项通过原始失败模式回归；关闭项有可点击实现与测试证据。
4. `reported`：GitHub 留下结论、版本/提交和验证方式。
5. `closed` 或 `blocked`：只有 `verified` 才关闭；缺外部复现资料则保持开放并明确阻塞。

## Task Graph

```text
证据收口: #43/#46/#54 ─┐
验证现有修复: #295 ─────┼─> 父任务最终 GitHub 复查
外部复现: #213 ─────────┘

#296 撤权语义 ─> #300 sender-bound identity ─> #299 storage boundary
                         ├───────────────> #297 Prelude isolation
                         └─> #298 secure views
#296 + #299 + #297 + #298 ─> #301 privacy lifecycle ─> #302 tracker close
```

#299 的 fail-closed 和危险 SQL 拦截可以先做 RED/最小 GREEN，但最终 privileged handler 身份契约必须与 #300 对齐。#298 的 renderer hard-cut 与 #297 的 Prelude process hard-cut可以分别实现，但官方插件回归和 compatibility migration 需要联合验收。

## GitHub Mutation Contract

- 关闭前先评论：当前结论、证据路径、测试/构建命令、替代路线（如有）。
- 不把 Trellis planning 文档当成完成证据；只引用已合并代码、可运行测试、发布物或明确支持文档。
- #213 在最新版 Ubuntu 复现证据缺失时只请求信息，不关闭。
- #302 只在子项状态与其 checklist 一致后关闭。

## Compatibility And Rollback

- 安全 hard-cut 通过 SDK/version gate 和确定性错误迁移，不保留静默不安全默认值。
- 若关闭后出现当前版本可复现证据，重新打开对应 Issue 并链接原关闭依据。
- 每个子任务独立提交/回滚；父任务不批量回滚用户工作区，也不把无关变更纳入提交。

## Operational Constraints

- 当前工作区存在未提交 Trellis 变更，所有实现前必须重新检查目标文件 diff。
- 不执行发布、push、生产请求或破坏性安全复现。
- 安全测试使用隔离临时目录和合成 canary，不记录 SQL payload、真实路径或用户内容。
