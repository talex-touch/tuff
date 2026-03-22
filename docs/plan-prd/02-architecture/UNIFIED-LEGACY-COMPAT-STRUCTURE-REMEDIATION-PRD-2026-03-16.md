# Talex Touch 一次性完整修复总方案（统一实施 PRD）

> 更新时间：2026-03-16  
> 范围：`apps/core-app`、`apps/nexus`、`apps/pilot`、`packages/*`、`plugins/*`  
> 目标版本窗口：`2.4.9-beta.4 -> 2.5.0`  
> 决策口径：**单一蓝图 + 并行工作包**，不使用 Phase 1-3 决策叙事。

## 1. 目标与边界

### 1.1 北极星目标

- 一次性定义并锁定 Legacy/兼容/结构治理的完整执行蓝图。
- 跨层通信统一到 typed transport / domain SDK，legacy 仅保留告警与转发。
- 结构复杂度可控：超长文件冻结增长并按统一职责模型拆分。
- 工具链默认只服务主线仓，影子应用不再污染默认门禁与发布链路。

### 1.2 本次治理覆盖

- 兼容性文件与兼容分支债务台账。
- legacy 关键词与 raw channel event 调用点。
- 超长文件（阈值 `>=1200`）治理清单。
- Monorepo workspace 默认扫描范围与质量门禁矩阵。

### 1.3 非目标

- 本文不直接执行所有业务重构代码迁移。
- 不在兼容期内做“立即破坏式删除”。
- 不恢复 `/api/sync/*` 旧写链路。

## 2. 当前基线（已由脚本固化）

### 2.1 债务命中（主线代码域）

- `legacy`：`81 files / 184 hits`
- raw `channel.send('x:y')`：`13 files / 46 hits`
- `transport/legacy` 导入：`4 files / 4 hits`
- `permission/legacy` 导入：`0 files / 0 hits`
- 兼容命名文件（规则：`legacy|compat|migration|shim|polyfill|adapter`）：`27 files`

### 2.2 复杂度命中

- 超长文件（`>=1200`）：`47`（主线扫描范围）
- 当前最大文件：`apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts`（`4898` 行）

### 2.3 SoT 与基线文件

- 兼容债务清册（唯一 SoT）：`docs/plan-prd/docs/compatibility-debt-registry.csv`
- legacy/raw/legacy-import 门禁基线：`scripts/legacy-boundary-allowlist.json`
- 超长文件门禁基线：`scripts/large-file-boundary-allowlist.json`

## 3. 统一治理硬约束（必须）

1. 新增兼容债务必须进入清册，并带 `expires_version`。  
2. 新增 legacy/raw event/legacy import 命中一律门禁失败。  
3. 新增超长文件或既有超长文件增长一律门禁失败。  
4. 插件 `sendSync` fallback 只保留过渡告警，不承载新能力。  
5. renderer storage 写路径统一到 `StorageEvents.app.*`，legacy 仅读兼容/转发。  
6. `/api/sync/*` 保持 `410` 语义，禁止恢复写路径。  
7. 行为/接口/架构变化必须同步文档矩阵（README/TODO/CHANGES/INDEX/ROADMAP/QUALITY）。

## 4. 五个并行工作包（统一里程碑验收）

## WP1：兼容债务 SoT 与治理台账

- 目标：清册成为唯一来源，新增债务可追踪、可过期、可验收。
- 输入：兼容命名文件、legacy 命中、raw event 命中、legacy import 命中。
- 产出：
  - `compatibility-debt-registry.csv`（固定字段）
  - `check-compatibility-debt-registry.mjs`（字段与覆盖校验）
- 验收：
  - 清册缺字段或缺条目即失败；
  - 过期债务未清理即失败。

## WP2：通信与存储单入口化

- 目标：typed transport/domain SDK 成为唯一主入口。
- 产出：
  - `check-legacy-boundaries.mjs` 新增 `transport/legacy` 与 `permission/legacy` 引用冻结；
  - 插件 `sendSync` fallback 与 storage legacy 通路统一一次性退场告警；
  - 对外契约文档明示退场窗口 `v2.5.0`。
- 验收：
  - 无新增 `channel.send('x:y')`；
  - 无新增 legacy import；
  - 兼容期行为不回归。

## WP3：超长文件治理与职责分层

- 目标：冻结增长并按统一模板拆分（entry/orchestrator + domain + infra + contract）。
- 产出：
  - `check-large-file-boundaries.mjs` + baseline allowlist
  - Top 风险文件拆分任务清单（`file-provider / plugin-module / clipboard / UpdateService / common`）
- 验收：
  - 门禁阻断新增超长文件；
  - 门禁阻断既有超长文件继续增长；
  - 拆分后回归不退化。

## WP4：项目结构与 workspace 治理

- 目标：主线与影子应用默认解耦，质量门禁降噪。
- 产出：
  - `pnpm-workspace.yaml` 主线显式纳入（`core-app/nexus/pilot`），隔离 `g-*`、`quota-*`；
  - root `lint/lint:fix` 默认仅覆盖主线 apps + packages + plugins。
- 验收：
  - 默认 lint/typecheck/guard 不再扫描影子应用；
  - 主线门禁执行时间与稳定性提升。

## WP5：质量门禁与发布策略统一

- 目标：一套命令、一套规则、一次验收。
- 产出：
  - 统一门禁矩阵：`legacy:guard + network:guard + typecheck(node/web) + targeted tests + docs guard`
  - 回滚策略：按提交粒度回滚，禁止回滚到“恢复 legacy 能力”分叉。
- 验收：
  - 任一门禁失败禁止合入；
  - 文档未同步禁止合入；
  - 关键行为断言持续稳定。

## 5. 里程碑与责任模型（单一口径）

| 里程碑 | 定义 | 负责人模型 | 通过条件 |
| --- | --- | --- | --- |
| M0 治理基线锁定 | 门禁脚本 + 清册 + workspace 策略合入 | 架构负责人 + 工具链负责人 | 门禁脚本全部通过 |
| M1 收口执行中 | 五工作包并行推进，按周更新清册与 CHANGES | 各域 owner | 无新增债务、无门禁回退 |
| M2 版本清退门槛 | 到 `v2.5.0` 前完成主要兼容壳退场 | 架构 owner + 模块 owner | 过期债务归零 |

> Owner 记录方式：清册 `owner` 字段按路径映射（`core-app`/`nexus`/`pilot`/`packages-*`/`plugin-*`）。

## 6. 对外接口影响（发布说明必填）

- `packages/utils/transport/legacy.ts`：已进入退场窗口（`v2.5.0`），禁止新增引用。
- `packages/utils/permission/legacy.ts`：同上。
- 插件 `sendSync` fallback：兼容期告警保留，后续版本移除。
- renderer storage：旧事件名读兼容保留，写路径推荐统一 `StorageEvents.app.*`。
- `/api/sync/*`：持续返回 `410`（行为不变）。

## 7. 测试与验收命令（固定）

```bash
pnpm legacy:guard
pnpm network:guard
pnpm -C "apps/core-app" run typecheck:node
pnpm -C "apps/core-app" run typecheck:web
```

领域回归（按变更触发）：

- Storage：多窗口广播、版本化读取、旧键迁移一致性。
- Plugin channel：transport 主路径、fallback 告警、无 `$channel` 错误语义。
- Sync：`/api/sync/*` 410 断言与 `/api/v1/sync/*` 主链路稳定。
- 大文件拆分：行为快照 + 集成冒烟对比。

## 8. 变更管理规则

- 禁止“边做边换方案”；如需换方案，必须先更新本文与清册并说明影响面。
- 不允许新增临时兼容壳绕过 typed transport/domain SDK。
- 清册与文档不同步视为流程违规。

