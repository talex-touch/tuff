# Nexus 用户数据同步与设备授权计划

> 状态：历史工程计划 / 压缩索引
> 更新时间：2026-05-14
> 完整快照：`./archive/2026-02-01_00-09-19-nexus-user-data-sync-auth.full-2026-05-14.md`

## TL;DR

本文原始版本描述 Nexus 用户数据同步、设备授权、密钥与 oplog 同步设计。当前 Storage/Sync 安全规则已经收敛到 Quality Baseline：SQLite 本地 SoT，JSON 只允许作为密文同步载荷或引用，新增同步能力走 `/api/v1/sync/*`。

## 历史有效结论

- 同步应以小粒度 oplog / cursor / ack 方式进行。
- 敏感数据需要 envelope encryption，不应明文同步。
- 设备授权需要审计、撤销、信任状态与冷却/频控。
- 恢复码、密钥、token 不得明文保存。

## 当前项目口径

- SQLite 是本地 SoT。
- Sync wire shape 只允许 `payload_enc` / `payload_ref` 等密文引用。
- `deviceId` 不得作为密钥材料。
- 旧 `/api/sync/*` 只允许迁移期只读，新增依赖禁止。
- Nexus 设备授权风控 Phase 1 已落地，当前非 2.4.10 主线 blocker。

## 关联入口

- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- `docs/plan-prd/04-implementation/NexusDeviceAuthRiskControl-260316.md`
- `docs/plan-prd/TODO.md`
