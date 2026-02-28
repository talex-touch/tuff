# 风险点登记（2026-02）

> 本文档用于收敛高风险项，并作为发布前风险门禁依据。
> 更新时间：2026-02-28

---

## 发布前风险收口流程（GA 模板）

1. 风险录入：登记风险 ID、等级、影响范围、证据文件。
2. 责任分配：每条风险必须指定 Owner 与目标日期。
3. 缓解执行：明确最小可执行缓解动作与回滚策略。
4. 证据回填：补充代码路径、测试结果、日志或文档记录。
5. 门禁判定：
   - 存在 `P0=Open/In Progress`：禁止进入 Gate E（打 tag 发布）。
   - `P1=Open` 允许发布，但必须有 `Accepted` 原因与补偿计划。

---

## 风险总览

| 风险ID | 等级 | 风险描述 | Owner | 缓解策略 | 证据（文件） | 目标版本 | 目标日期 | 回滚策略 | 状态 |
|---|---|---|---|---|---|---|---|---|---|
| RISK-001 | P0 | 旧同步链路明文写入风险已收口（`syncStore.ts` 下线，`authStore.ts` 不再写 `value_json`） | Nexus Backend | 保持 `/api/sync/*` 显式拒绝；新增回归守卫，禁止回退旧写入链路 | `apps/nexus/server/api/sync/push.post.ts`、`apps/nexus/server/api/sync/pull.get.ts`、`apps/nexus/server/utils/authStore.ts` | 2.4.8 | 2026-02-28 | 若出现回归，立即回滚到最近稳定 commit，并封禁 legacy route 写入入口 | Done |
| RISK-002 | P1 | 渲染进程敏感令牌/设备信息依赖 localStorage | CoreApp Auth | 迁移到主进程 safeStorage；登录初始化前执行一次性迁移并清理 legacy 键 | `apps/core-app/src/renderer/src/modules/auth/auth-env.ts`、`apps/core-app/src/renderer/src/modules/auth/useAuth.ts`、`apps/core-app/src/renderer/src/modules/auth/auth-env.test.ts` | 2.4.8 | 2026-02-28 | 保留读取兼容分支但不写回 localStorage，异常时回退到仅短期会话态 | Done（已验证） |
| RISK-003 | P1 | 超大文件职责过重导致维护与回归风险 | CoreApp Architecture | 本期先完成 Owner/边界/测试基线，不执行大文件拆分；拆分排入后续迭代 | `docs/engineering/legacy-debt-report-2026-02-21.md` | 2.4.8 | 2026-03-15 | 拆分实施期按模块逐步迁移，保持接口不变并可按文件回滚 | Accepted（Deferred by decision） |
| RISK-004 | P2 | 依赖版本漂移（Vue/Vite/TS/ESLint/Vitest/Unocss/Electron） | Workspace Maintainer | 工具链与运行时基线收敛，锁定统一版本窗口 | `pnpm-workspace.yaml`、`package.json` | 2.4.7 | 2026-02-28 | 发现兼容异常时按 workspace 回滚到上一锁文件 | Done |
| RISK-005 | P2 | 迁移壳层/Deprecated 仍较集中 | SDK/Transport Maintainer | 按 Hard-Cut 批次收口旧入口，迁移完成后删除 deprecated API | `packages/utils/channel/index.ts`、`packages/utils/transport/index.ts`、`docs/plan-prd/04-implementation/LegacyChannelCleanup-2408.md` | 2.4.8 | 2026-03-31 | 保留最小兼容窗；若异常，临时恢复 adapter 层并记录 telemetry | In Progress |

---

## 深度技术债落地里程碑（来自 2026-02-21 报告）

| 里程碑 | 范围 | Owner | 截止 | 交付物 | 状态 |
|---|---|---|---|---|---|
| TD-M1 | 建立兼容入口清单（channel/deprecated/fallback）与移除顺序 | SDK/Transport Maintainer | 2026-03-07 | 清单 + 迁移顺序 + 风险说明 | In Progress |
| TD-M2 | fallback 链路可观测化（统一 telemetry 记录与开关） | CoreApp Platform | 2026-03-14 | fallback telemetry 字段规范 + 回归用例 | Planned |
| TD-M3 | 大文件拆分前置工作（接口边界/测试基线），不进入拆分实施 | CoreApp Architecture | 2026-03-15 | 拆分设计文档 + 测试基线 + 分批计划 | Accepted（No split now） |

---

## 说明与边界

- 本登记覆盖当前显著风险点，不替代专项 PRD。
- 若风险涉及行为/架构变更，必须同步：
  - `docs/plan-prd/README.md`
  - `docs/plan-prd/TODO.md`
  - `docs/plan-prd/01-project/CHANGES.md`
- 本轮明确：**大文件拆分暂不执行，只保留前置规划与验收基线**。

---

## 验收标准

- 每条风险必须具备：Owner、目标日期、缓解策略、回滚策略、证据链接。
- 发布前若存在 P0 未关闭，Gate E 不得执行。
- 风险状态变化需在同日同步 `TODO.md` 与 `CHANGES.md`。
