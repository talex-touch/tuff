# 文档盘点与下一步路线（2026-03-17）

> 更新时间：2026-03-17  
> 口径说明：本页用于固定“文档全量盘点 + 下一步执行优先级”，作为 `INDEX/README/TODO` 的统一引用锚点。

## 1. 文档全量盘点

### 1.1 全仓 Markdown 统计

- 全仓 Markdown 文档总数：`396`
- 按顶层目录分布：
  - `docs`: `146`
  - `packages`: `122`
  - `apps`: `55`
  - `plan`: `23`
  - `codereview`: `23`
  - `examples`: `11`
  - `plugins`: `7`

### 1.2 `docs` 目录统计

- `docs/plan-prd`: `110`
- `docs/engineering`: `20`
- 其他专题单文档与入口：`16`

### 1.3 `docs/plan-prd` 子域统计

- `03-features`: `32`
- `docs`: `20`
- `04-implementation`: `17`
- `01-project`: `12`
- `05-archive`: `11`
- `02-architecture`: `8`
- `06-ecosystem`: `4`

## 2. 当前主线文档入口（必须盯住）

- `docs/INDEX.md`
- `docs/plan-prd/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/01-project/CHANGES.md`
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- 锁定实施入口：`docs/plan-prd/04-implementation/NexusDeviceAuthRiskControl-260316.md`

## 3. 下一步路线（按优先级）

### P0：Nexus 设备授权风控收口

- 补齐 Phase 0 验收证据（含回滚演练）。
- 完成 Phase 1 落地：速率限制、冷却窗口、审计日志。
- 补齐告警策略、值守责任、发布前检查单。

### P0：文档治理收尾

- `TODO.md` 控制在 400 行内并稳定维护。
- 第二批历史文档补齐“历史/待重写”头标。
- Telemetry/Search/Transport/DivisionBox 长文档继续 TL;DR 分层。

### P1：门禁升级前置条件

- 连续 5 次 `pnpm docs:guard` 零告警。
- 连续 2 周无状态回退/口径漂移。
- 达标后将 CI 从 report-only 升级为 strict 阻塞。

### P1：技术债三波次并行（W2-W4）

- Wave A：Transport（MessagePort 高频通道 + `sendSync` 清理）。
- Wave B：Pilot（typecheck/lint 清理 + SSE/鉴权矩阵回归）。
- Wave C：架构质量（`plugin-module/search-core/file-provider` SRP 拆分）。
- 每波强制产出：`CHANGES` 证据 + `TODO` 状态 + 可复现门禁命令。

## 4. 验收与同步规则

- 每个主线动作强制同步：
  - `docs/INDEX.md`
  - `docs/plan-prd/README.md`
  - `docs/plan-prd/TODO.md`
  - `docs/plan-prd/01-project/CHANGES.md`
  - `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
  - `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- 最低门禁命令：
  - `pnpm docs:guard`
  - `pnpm docs:guard:strict`

## 5. 默认假设

- “所有文档列表”按主线文档体系解释为：`docs` 全量（146） + 全仓分布统计（396）。
- 当前执行优先级保持不变：先完成 `Nexus 设备授权风控`，再推进文档治理 strict 化与 Wave A/B/C。
