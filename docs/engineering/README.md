# Engineering Docs

> 更新时间：2026-07-16
> 定位：工程规范、交接、审计和 curated evidence 入口。当前任务优先级见 [`../plan-prd/TODO.md`](../plan-prd/TODO.md)。

## 当前交接

- [`security-hardening-handoff-2026-07-15.md`](./security-hardening-handoff-2026-07-15.md)：安全加固完成项、剩余边界和真机前提。
- [`security-hardening-remaining-backlog-2026-07-15.md`](./security-hardening-remaining-backlog-2026-07-15.md)：插件隔离、sync 批量化、usage 双写等实施细节。
- [Search & Cross-Platform Audit](../../.trellis/tasks/07-13-search-crossplatform-audit/prd.md)：搜索系统与跨平台风险 backlog。

交接文档中的 commit、worktree、并行修改和“未 push”描述是生成当日快照；执行前必须读取当前仓库状态，不把快照当实时事实。

## 工程规范

- [`monorepo-standards.md`](./monorepo-standards.md)：monorepo 工程约束。
- [`coreapp-ui-contract.md`](./coreapp-ui-contract.md)：CoreApp renderer 与 TuffEx 使用边界。
- [`cloud-sync-sdk-usage.md`](./cloud-sync-sdk-usage.md)：Cloud Sync SDK 使用说明。
- [`tuff-intelligence-rollout-todo.md`](./tuff-intelligence-rollout-todo.md)：Intelligence rollout 专题。

## Evidence 与报告

- [`reports/README.md`](./reports/README.md)：reports 提交边界与索引。
- [`reports/coreapp-visible-ai-stable-2026-06-18/`](./reports/coreapp-visible-ai-stable-2026-06-18/)：AI visible evidence。
- [`reports/r3-indexing-runtime-2026-06-25/`](./reports/r3-indexing-runtime-2026-06-25/)：R3 indexing evidence。
- [`reports/release-integrity-2026-06-22/`](./reports/release-integrity-2026-06-22/)：发布完整性 evidence。
- [`reports/nexus-performance-2026-06-21/`](./reports/nexus-performance-2026-06-21/)：Nexus 性能工作表与摘要。
- [`reports/optimization-dry-run-2026-07-11/`](./reports/optimization-dry-run-2026-07-11/)：全仓优化审计摘要。

## 维护规则

1. 新过程资料优先补到现有专题、Trellis task 或 `reports/`，不在本目录根部堆叠临时 handoff。
2. `reports/` 只提交摘要、manifest/checklist、严格验证输出和最终可复核 evidence。
3. 调试日志、pid、完整 HAR、重复截图、Chromium profile 和 user-data 进入 ignored evidence 目录。
4. Release notes 保留在根目录 `notes/`，因为发布 workflow 消费该路径。
5. 工程文档不维护全局优先级；冲突时以 `plan-prd/TODO.md` 为准，完成声明以 evidence 为准。

## 主导航

- [全局文档索引](../INDEX.md)
- [规划入口](../plan-prd/README.md)
- [当前稳定化 TODO](../plan-prd/TODO.md)
- [变更日志](../plan-prd/01-project/CHANGES.md)
