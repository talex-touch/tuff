# Nexus 设备授权风控实施方案

> 状态：Phase 1 Done / 压缩版
> 更新时间：2026-05-14
> 完整快照：`./archive/NexusDeviceAuthRiskControl-260316.full-2026-05-14.md`

## TL;DR

Nexus 设备授权风控 Phase 1 已落地。当前该项保留实施入口与历史证据，不作为 `2.4.10` Windows release blocker。

## 已落地

- 设备码申请频控。
- 连续 reject/cancel 冷却。
- request/approve/reject/cancel/revoke/trust/untrust 审计日志。
- 长期授权后端时间窗。
- 可信设备显式白名单。

## 后续关注

- 风控告警策略与值守说明持续维护。
- 与团队/账号/API key 权限模型保持一致。
- 设备异常、密钥轮换、可信设备撤销需有可追溯审计。

## 关联入口

- `docs/plan-prd/TODO.md`
- `docs/plan-prd/01-project/CHANGES.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
