# Config Storage Unification

> 状态：历史实施方案 / 压缩索引
> 更新时间：2026-05-14
> 完整快照：`./archive/config-storage-unification.full-2026-05-14.md`

## TL;DR

本文原始版本记录配置存储统一方案。当前权威口径：SQLite 是本地 SoT；JSON 只允许作为密文同步载荷或引用；敏感配置必须进入 secure store / secret capability / `authRef`。

## 历史有效结论

- 配置域需要区分 local-only、sync-needed 与 secret。
- 迁移必须有 fallback 与回滚验证。
- renderer/main/plugin 不应各自维护并行配置通道。
- 旧 JSON 配置只能作为迁移输入，不应继续作为业务 SoT。

## 当前项目口径

- 新同步能力走 `/api/v1/sync/*`。
- Sync payload 只允许 `payload_enc` / `payload_ref`。
- CLI token、provider secret、插件 API key 不得普通 JSON 明文落盘。
- 行为改变需同步 TODO/README/CHANGES/INDEX 与 Quality Baseline。

## 关联入口

- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- `docs/plan-prd/TODO.md`
- `docs/engineering/plans/2026-02-01_00-09-19-nexus-user-data-sync-auth.md`
