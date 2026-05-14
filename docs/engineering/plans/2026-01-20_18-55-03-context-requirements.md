# Context Requirements

> 状态：历史工程计划 / 压缩索引
> 更新时间：2026-05-14
> 完整快照：`./archive/2026-01-20_18-55-03-context-requirements.full-2026-05-14.md`

## TL;DR

本文原始版本梳理上下文、storage、插件配置与迁移需求。当前执行口径已收敛到 Storage/Sync 规则、Quality Baseline 与 TODO。

## 历史有效结论

- 上下文能力需要区分应用配置、插件配置、运行时状态与同步数据。
- 旧 storage IPC/JSON 只能作为迁移边界，不应继续承载新能力。
- 插件配置与敏感信息需要隔离和权限控制。

## 当前项目口径

- SQLite 是本地 SoT。
- JSON 只允许作为密文同步载荷或引用。
- 新增同步走 `/api/v1/sync/*`。
- 插件 secret 不得进入普通 storage。

## 关联入口

- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- `docs/plan-prd/04-implementation/config-storage-unification.md`
- `docs/plan-prd/TODO.md`
