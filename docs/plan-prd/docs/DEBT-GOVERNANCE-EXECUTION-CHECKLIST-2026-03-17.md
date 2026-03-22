# Talex Touch 治理执行清单（并行工作包）

> 更新时间: 2026-03-17  
> 目标版本: `v2.5.0`（兼容债务清退门槛）  
> 适用范围: `core-app / nexus / pilot / packages / plugins`（主线）

---

## 1) 当前状态（可执行口径）

- `compatibility-debt-registry.csv`: `120` 条
- `size` 超长基线（>=1200）: `46` 文件
- `growthExceptions`: `2`（`AIGC-EXECUTOR`、`DEEPAGENT`）
- 已完成首批清退动作：
  - `usePilotChatPage.ts` 拆分后降至 `1175` 行（退出超长文件集合）
  - `SIZE-GROWTH-2026-03-16-PILOT-CHAT-PAGE` 已从 allowlist/registry 清退

---

## 2) 并行任务包（Owner + Ticket + 验收）

| WP | owner | 目标文件 / 域 | 关键动作 | 票据 | 状态 | 验收命令 |
| --- | --- | --- | --- | --- | --- | --- |
| A | `pilot` | `apps/pilot/server/api/aigc/executor.post.ts` | 按 `entry + service + attachment adapter` 继续拆分，压降到 `<1200` | `SIZE-GROWTH-2026-03-16-AIGC-EXECUTOR` | 进行中 | `pnpm legacy:guard && pnpm size:guard` |
| B | `packages-tuff-intelligence` | `packages/tuff-intelligence/src/adapters/deepagent-engine.ts` | 提取 transport/adapter 逻辑到 service，压降到 `<1200` | `SIZE-GROWTH-2026-03-16-DEEPAGENT` | 待开始 | `pnpm legacy:guard && pnpm size:guard` |
| C | `packages-utils` | `raw-channel-send` 12 命中 | 按 SDK 域替换 raw event 为 typed transport | `LEGACY-GUARD-RAW-EVENT` | 进行中 | `pnpm legacy:guard && pnpm compat:registry:guard` |
| D | `core-app` | `file-provider / plugin-module / clipboard` | 按 SRP 模型分层拆分（entry/service/infra） | `LEGACY-GUARD-KEYWORD` | 待开始 | `pnpm quality:gate` |
| E | `docs` | 治理文档矩阵 | 每次清退同步 `CHANGES + TODO + registry` | `COMPAT-REGISTRY-NAMING` | 持续 | `pnpm docs:guard` |

---

## 3) 本轮已执行技术动作（对应 1+2）

### 3.1 可执行任务清单（本文件）

- 固化并行工作包、owner、ticket、门禁命令。
- 将“治理看板”与“执行清单”分离：看板看状态，清单看动作。

### 3.2 第一批清退动作（代码级）

- `apps/pilot/app/composables/usePilotChatPage.ts`
  - 抽离通用函数到 `apps/pilot/app/composables/pilot-chat.utils.ts`
  - 行数：`1366 -> 1175`
- `apps/pilot/server/api/aigc/executor.post.ts`
  - 抽离执行器工具到 `apps/pilot/server/utils/pilot-executor-utils.ts`
  - 行数：`1666 -> 1370`
- 关联债务清理
  - 从 `scripts/large-file-boundary-allowlist.json` 移除 `usePilotChatPage.ts` baseline + growth exception
  - 从 `compatibility-debt-registry.csv` 移除 `SIZE-GROWTH-2026-03-16-PILOT-CHAT-PAGE`

---

## 4) 执行顺序（非分阶段，按包并行）

1. 每个工作包先提交“可编译的最小拆分”。
2. 每次合入前跑统一门禁：`pnpm quality:gate`。
3. ticket 清退条件满足后，同步删除：
   - `growthExceptions` 条目
   - registry 对应 `size-growth-exception` 行
   - `CHANGES` 中增加“清退完成”记录

---

## 5) 风险与止损

1. 若拆分引入行为偏移：回滚到提交粒度，不恢复 legacy 能力面。
2. 若 `legacy-keyword` 或 `raw-channel-send` 新增：先撤回新增点，再补迁移方案，不走 allowlist 扩容兜底。
3. 若 `size` 压降不足：允许中途拆分，但不得新增 growth exception（除非新 ticket 且有 owner 承诺）。
