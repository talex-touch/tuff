# Nexus Team Invite PRD

> 状态：Archived / 历史 PRD
> 更新时间：2026-05-14
> 完整快照：`./full/NEXUS-TEAM-INVITE-PRD.full-2026-05-14.md`

## TL;DR

本文是 Nexus 团队邀请功能历史 PRD。当前不属于 `2.4.10` release blocker；若后续恢复推进，应重新按当前 auth、device trust、audit 与 API key 权限模型重写。

## 历史有效结论

- 团队邀请需要明确邀请创建、接受、撤销、过期与审计流程。
- 权限应区分团队角色与资源访问范围。
- 邀请链接与 token 需要过期时间、一次性使用与风险控制。

## 当前项目口径

- Nexus auth/device 风控已形成独立实施入口。
- 插件发布 API key 与 Dashboard assets 流程是当前更高优先级。
- 本文仅保留历史背景，不参与当前版本验收。

## 关联入口

- `docs/plan-prd/04-implementation/NexusDeviceAuthRiskControl-260316.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
