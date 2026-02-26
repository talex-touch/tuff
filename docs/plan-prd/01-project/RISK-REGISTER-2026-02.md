# 风险点登记（2026-02）

> 本文档用于收敛本次仓库扫描识别出的高风险项，提供可执行的缓解方向与落地路径。
> 更新时间：2026-02-26

---

## 风险总览

| 风险ID | 等级 | 风险描述 | 影响范围 | 证据（文件） | 建议缓解 | 目标版本 | 状态 |
|---|---|---|---|---|---|---|---|
| RISK-001 | P0 | 旧同步链路明文写入风险已收口（`syncStore.ts` 下线，`authStore.ts` 不再写 `value_json`） | Sync 规则与合规风险（已缓解） | `apps/nexus/server/api/sync/push.post.ts`、`apps/nexus/server/utils/authStore.ts` | 持续保持 `/api/sync/*` 显式拒绝；新增守卫禁止回归 `value_json` 写入路径 | 2.4.8 | Done |
| RISK-002 | P1 | 渲染进程敏感令牌/设备信息依赖 localStorage | 设备安全与泄露风险，违反安全存储策略 | `apps/core-app/src/renderer/src/modules/auth/auth-env.ts` | 迁移到主进程 secure store（safeStorage）通道；renderer 仅保留短期会话态 | 2.4.8 | Open |
| RISK-003 | P1 | 超大文件职责过重导致维护与回归风险 | 变更成本高、SRP/KISS 受损 | `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts`、`apps/core-app/src/main/modules/plugin/plugin-module.ts`、`apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts`、`apps/nexus/server/utils/tuffIntelligenceLabService.ts` | 拆分为“索引/检索/遥测/同步”或“安装/生命周期/运行时”子模块；先做接口边界与测试基线 | 2.4.8 | Open |
| RISK-004 | P2 | 依赖版本漂移（Vue/Vite/TS/ESLint/Vitest/Unocss/Electron） | CI/IDE 行为不一致，长期升级成本升高 | `package.json` + workspace `package.json` | 先对齐工具链与构建依赖，再做业务依赖收口；给出最小可行版本基线 | 2.4.7 | Done |
| RISK-005 | P2 | 迁移壳层/Deprecated 仍较集中 | 兼容层长期存在，影响 SDK Hard-Cut 目标 | `packages/utils/channel/index.ts`、`packages/utils/transport/index.ts` | 制定 Hard-Cut 批次清单与删改窗口；迁移完成后移除旧入口 | 2.4.8 | Open |

---

## 说明与边界

- 本登记仅覆盖“当前扫描”显著风险点；不替代 PRD 或专项报告。
- 若风险涉及架构或行为变更，需同步更新：
  - `docs/plan-prd/README.md`
  - `docs/plan-prd/TODO.md`
  - `docs/plan-prd/01-project/CHANGES.md`

---

## 验收标准（建议）

- RISK-001：`/api/sync/*` 写入路径全部关闭或显式拒绝；`authStore.ts` 不再写入 `value_json` 明文；新增功能全部走 `/api/v1/sync/*`。
- RISK-002：敏感令牌不再落入 localStorage；安全存储与生命周期一致。
- RISK-003：至少 3 个超大文件完成职责拆分，并补足回归验证点。
- RISK-004：核心依赖版本收口到 1 个基线（工具链优先）。
- RISK-005：旧 Channel 入口迁移完成，并有删除计划与回滚点。
