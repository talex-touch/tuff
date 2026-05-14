# PRD: Flow Transfer 插件间流转能力

> 状态：历史 PRD / 压缩索引
> 更新时间：2026-05-14
> 完整快照：`./archive/flow-transfer-prd.full-2026-05-14.md`

## TL;DR

Flow Transfer 目标是让插件之间可以以受控、可审计的方式传递数据和任务。当前该主题不阻塞 `2.4.10`，长期事项进入 TODO backlog。

## 历史有效结论

- sender/receiver 应通过能力声明和权限控制建立合同。
- 流转失败需要明确原因与用户可见反馈。
- 高风险数据流转需要审计日志。
- 应提供测试插件和开发文档验证生态接入。

## 当前项目口径

- Flow Transfer 长尾事项：审计日志、失败原因记录、sender/receiver 测试插件与开发文档补齐。
- 新增能力必须走 typed SDK / domain SDK，不新增 raw channel。
- 敏感载荷不得明文同步或落入普通日志。

## 关联入口

- `docs/plan-prd/docs/TODO-BACKLOG-LONG-TERM.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
