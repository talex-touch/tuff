# 插件市场 Provider Registry（前端版）

> 状态：Archived / 历史计划
> 更新时间：2026-05-14
> 完整快照：`./full/plugin-store-provider-frontend-plan.full-2026-05-14.md`

## TL;DR

本文是插件市场 provider 前端历史计划。当前插件发布和 Provider Registry 路线已分化：插件发布入口收敛到 Nexus `/dashboard/assets` 与 CoreApp `/store/publisher`；Nexus Provider Registry 则服务 AI/汇率/翻译等能力聚合。

## 当前项目口径

- 插件发布入口不新增 `/dashboard/plugins` 页面，继续使用 `/dashboard/assets`。
- CoreApp Store `/store/publisher` 支持发布管理与 `.tpex` 上传代理。
- 后续补 package policy/security scan 与真实 `.tpex` 上传端到端证据。

## 关联入口

- `docs/plan-prd/TODO.md`
- `docs/plan-prd/02-architecture/nexus-provider-scene-aggregation-prd.md`
- `docs/plan-prd/01-project/CHANGES.md`
