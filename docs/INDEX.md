# 文档索引

> 更新时间：2026-03-15  
> 本页仅保留入口与高价值快照；历史细节以 `docs/plan-prd/01-project/CHANGES.md` 为准。

## 主要入口

- `docs/plan-prd/README.md` - PRD / 规划主索引（里程碑 + 未闭环能力）
- `docs/plan-prd/TODO.md` - 执行清单（含单一口径矩阵与优先级）
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md` - 产品总览 + 路线图
- `docs/plan-prd/01-project/RELEASE-2.4.7-CHECKLIST-2026-02-26.md` - v2.4.7 Gate 清单（A~E）
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md` - PRD 质量基线与门禁约束
- `docs/plan-prd/01-project/CHANGES.md` - 全历史变更记录（唯一历史源）

## 状态快照（2026-03-15，统一口径）

- **2.4.9 主线 Gate**：插件完善主线执行中，`权限中心 Phase 5` 已完成；`View Mode 安全闭环 + 类型增强` 与 `CLI 切换收口`进入同版本 Gate 验收。
- **2.4.8 主线 Gate（historical）**：OmniPanel 稳定版 MVP 已落地（真实窗口 smoke CI + 失败路径回归 + 触发稳定性回归）。
- **v2.4.7 发布门禁**：Gate A/B/C/D/E 已完成（Gate E 为 historical，Gate D 已通过手动 `workflow_dispatch(sync_tag=v2.4.7)` 收口）。
- **Pilot Runtime 主路径**：Node Server + Postgres/Redis + JWT Cookie；Cloudflare runtime/D1/R2 仅保留历史归档。
- **Pilot 接口迁移（M2/M3）**：已完成收口；微信相关接口进入豁免模式，支付链路切换为本地 mock（下单 3 秒自动成功）。
- **Pilot channels 治理**：已新增 `POST /api/pilot/admin/channels/merge-ends` 与一次性脚本，执行“Pilot 优先、Ends 补缺”。
- **执行顺序（锁定）**：`权限中心 Phase 5（已完成） -> View Mode 安全闭环+类型增强 -> CLI 切换收口 -> 主文档同步验收 -> Nexus 设备授权风控`（`OmniPanel Gate`、`SDK Hard-Cut E~F`、`v2.4.7 Gate D/E` 已完成）。
- **质量边界**：Network 套件全仓硬禁生效，业务层 direct `fetch/axios` 继续保持 0 违规。

## 强制同步矩阵（单一口径）

| 文档 | 当前状态 | 下一动作 |
| --- | --- | --- |
| `docs/plan-prd/TODO.md` | 已同步到 2026-03-15 | 推进 View Mode 剩余拆分项与 CLI 分包剩余项 |
| `docs/plan-prd/README.md` | 已同步到 2026-03-15 | 保持“近 3 个月里程碑 + 未闭环能力”口径 |
| `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md` | 已同步到 2026-03-15 | 按锁定顺序推进 `View Mode -> CLI -> 文档验收` |
| `docs/plan-prd/01-project/RELEASE-2.4.7-CHECKLIST-2026-02-26.md` | Gate A/B/C/D/E 已完成（D/E historical，2026-03-15 已复核） | 保留证据链并切换到 `2.4.9` 插件主线收口 |
| `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md` | 已同步到 2026-03-15（新增 2.4.9 插件主线质量记录） | 保持 `v2.4.7` 豁免仅限历史版本，`>=2.4.8` 严格门禁 |
| `docs/plan-prd/01-project/CHANGES.md` | 已同步到 2026-03-15 | 补录 2.4.9 插件主线（权限/View/CLI）收口记录 |
| `docs/INDEX.md` | 本页（入口+快照）已压缩 | 仅维护导航与高价值快照 |

## 归档与降权

- `docs/plan-prd/next-edit/*`：降权为草稿池，不作为发布判定与状态口径来源。
- `docs/plan-prd/05-archive/*`：历史归档区，仅用于追溯，不参与当前里程碑状态统计。

## 高价值专题入口

- `docs/plan-prd/03-features/omni-panel/OMNIPANEL-FEATURE-HUB-PRD.md` - OmniPanel Feature Hub PRD
- `docs/plan-prd/04-implementation/LegacyChannelCleanup-2408.md` - Legacy Channel Cleanup 2.4.8
- `docs/plan-prd/docs/NEXUS-RELEASE-ASSETS-CHECKLIST.md` - `v2.4.9` Gate D 发布资产核对（严格签名）
- `docs/plan-prd/docs/PLUGIN-STORE-MULTI-SOURCE-ACCEPTANCE-2026-03-15.md` - 插件市场多源验收结论
