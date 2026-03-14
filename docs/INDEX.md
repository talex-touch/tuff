# 文档索引

> 更新时间：2026-03-14  
> 本页仅保留入口与高价值快照；历史细节以 `docs/plan-prd/01-project/CHANGES.md` 为准。

## 主要入口

- `docs/plan-prd/README.md` - PRD / 规划主索引（里程碑 + 未闭环能力）
- `docs/plan-prd/TODO.md` - 执行清单（含单一口径矩阵与优先级）
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md` - 产品总览 + 路线图
- `docs/plan-prd/01-project/RELEASE-2.4.7-CHECKLIST-2026-02-26.md` - v2.4.7 Gate 清单（A~E）
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md` - PRD 质量基线与门禁约束
- `docs/plan-prd/01-project/CHANGES.md` - 全历史变更记录（唯一历史源）

## 状态快照（2026-03-14，统一口径）

- **2.4.8 主线 Gate**：OmniPanel 稳定版 MVP 已落地（真实窗口 smoke CI + 失败路径回归 + 触发稳定性回归）。
- **v2.4.7 发布门禁**：Gate A/B/C/E 已完成（Gate E 为 historical）；Gate D 进行中（本地 dry-run 对账 + GitHub CI 自动同步未闭环，CI 已接入 `backfill` 且仅 `v2.4.7` 启用）。
- **Pilot Runtime 主路径**：Node Server + Postgres/Redis + JWT Cookie；Cloudflare runtime/D1/R2 仅保留历史归档。
- **执行顺序（锁定）**：`v2.4.7 Gate D -> View Mode 安全收口 -> Nexus 设备授权风控`（`SDK Hard-Cut E~F` 与 `v2.4.7 Gate E` 已完成）。
- **质量边界**：Network 套件全仓硬禁生效，业务层 direct `fetch/axios` 继续保持 0 违规。

## 强制同步矩阵（单一口径）

| 文档 | 当前状态 | 下一动作 |
| --- | --- | --- |
| `docs/plan-prd/TODO.md` | 已同步到 2026-03-14 | 持续跟踪 Gate D / View Mode |
| `docs/plan-prd/README.md` | 已同步到 2026-03-14 | 保持“近 3 个月里程碑 + 未闭环能力”口径 |
| `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md` | 已同步到 2026-03-14 | 按锁定顺序推进后续里程碑 |
| `docs/plan-prd/01-project/RELEASE-2.4.7-CHECKLIST-2026-02-26.md` | Gate D 进行中（A/B/C/E historical done） | 执行 Gate D 对账并由 GitHub CI 同步写入 |
| `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md` | Gate 状态口径已对齐 | 保持 v2.4.7 豁免范围仅限历史版本 |
| `docs/INDEX.md` | 本页（入口+快照）已压缩 | 仅维护导航与高价值快照 |

## 归档与降权

- `docs/plan-prd/next-edit/*`：降权为草稿池，不作为发布判定与状态口径来源。
- `docs/plan-prd/05-archive/*`：历史归档区，仅用于追溯，不参与当前里程碑状态统计。

## 高价值专题入口

- `docs/plan-prd/03-features/omni-panel/OMNIPANEL-FEATURE-HUB-PRD.md` - OmniPanel Feature Hub PRD
- `docs/plan-prd/04-implementation/LegacyChannelCleanup-2408.md` - Legacy Channel Cleanup 2.4.8
- `docs/plan-prd/docs/NEXUS-RELEASE-ASSETS-CHECKLIST.md` - `v2.4.9` Gate D 发布资产核对（严格签名）
