# 遥测与错误上报系统 PRD（压缩版）

> 状态: 历史参考 / 待重写
> 更新时间: 2026-03-16
> 适用范围: `apps/core-app`、`apps/nexus` 观测与错误治理
> 替代入口: `docs/plan-prd/TODO.md`、`docs/plan-prd/01-project/CHANGES.md`
> 深入文档: `telemetry-error-reporting-system-prd.deep-dive-2026-03.md`

## TL;DR

- 该专题最初目标是建立统一的错误追踪、性能监控与匿名行为分析体系（Sentry + 聚合分析双通道）。
- 现阶段项目已具备基础日志与门禁治理，本专题未作为 `2.4.9` 当前执行主线。
- 若重启该专题，优先按“最小可执行闭环”推进：
  1. 错误事件结构化标准（字段与脱敏规则）
  2. 关键链路性能指标最小集
  3. 回滚与隐私合规策略

## 当前结论（2026-03）

- 不在当前 2 周清单中单独立项，避免与 `Nexus 设备授权风控` 主线抢占资源。
- 历史设计细节全部保留在 deep-dive 文档，供后续专项恢复时复用。
- 所有新增观测能力必须遵守当前质量基线：
  - Storage/Sync 安全规则
  - 文档同步规则
  - `typecheck/lint/test` 可回归门禁

## 重新激活条件

- `Nexus 设备授权风控` Phase 1 完成并通过验收。
- `docs:guard` 连续零告警达到 strict 升级条件。
- 明确 owner、里程碑与风险豁免边界。

## 追溯

- 历史完整方案与实现推演：`telemetry-error-reporting-system-prd.deep-dive-2026-03.md`
