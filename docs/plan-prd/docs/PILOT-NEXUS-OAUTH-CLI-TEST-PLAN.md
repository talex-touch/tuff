# Pilot × Nexus OAuth × CLI 状态文档（测试优先）

> 更新时间：2026-03-16  
> 状态：执行态快照（已落地 vs 未启动）  
> 适用范围：`apps/pilot`、`apps/nexus`、`packages/tuff-intelligence`

## 1. 目标

- 维持 Pilot Chat-first 主路径的可回归质量基线。
- 统一说明 Pilot × Nexus OAuth × CLI 相关能力的真实落地状态，避免“计划态=已实现”误读。
- 将未启动能力明确归入 backlog，作为后续迭代入口。

## 2. 当前状态（已落地 vs 未启动）

| 主题 | 已落地（事实） | 未启动 / backlog |
| --- | --- | --- |
| T0 测试基线 | `apps/pilot` 与 `packages/tuff-intelligence` 已纳入 lint/typecheck/build/test 的日常回归链路（以实际 CI 与 CHANGES 为准） | 补齐更完整的 E2E 与长会话压测矩阵 |
| T1 Pilot OAuth | Pilot/Nexus bridge legacy 已下线；回调链路以 `code + state` 为主；OAuth token 交换主路径可用 | OAuth 失败分支与灰度观测指标仍需补强 |
| T2 CLI 对话 | 当前仅有 `tuff-cli`（插件生态 CLI）；Pilot 专用 CLI 尚未落包 | `tuff-pilot-cli`（`login/chat/send/sessions/trace`）为明确 backlog，仓库当前无 `packages/tuff-pilot-cli` |
| T3 渠道路由 | 会话与运行时已有渠道能力基础，主流程可用 | “会话级 channelId 全链路可配置”未作为当前迭代落地项 |

## 3. 已落地能力（执行口径）

1. Pilot/Nexus bridge 旧入口已下线：
   - `GET/POST /api/pilot/auth/bridge-*` 不再提供。
   - Pilot 回调仅接受 `code + state`，不再接受 `ticket`。
2. Pilot Web OAuth 主链路可用：
   - `/auth/login` -> `/auth/authorize` -> `/auth/callback`。
3. OAuth token 交换主路径：
   - `POST /api/pilot/oauth/token`（OAuth 客户端模式）。
4. 质量门禁以真实工程命令为准：
   - `pnpm -C "apps/pilot" run lint`
   - `pnpm -C "apps/pilot" run typecheck`
   - `pnpm -C "apps/pilot" run build`
   - `pnpm -C "packages/tuff-intelligence" run lint`
   - `pnpm -C "packages/tuff-intelligence" exec tsc --noEmit`

## 4. 未启动项（Backlog 定义）

1. `tuff-pilot-cli`：
   - 当前不在仓库中创建新包；仅保留需求定义与验收口径。
   - 启动前置：明确发布形态、认证存储策略、与现有 `tuff-cli` 的职责边界。
2. 渠道路由增强：
   - `session channelId` 全链路显式配置（创建会话、stream、trace）待后续版本推进。
3. 增强测试：
   - 长会话压测、断线补播强一致性、渠道矩阵自动化仍为后续补齐项。

## 5. 验收与同步

- 本文档作为执行态口径，不再承载旧“阶段计划正文”。
- 历史执行细节与逐条改动证据统一以 `docs/plan-prd/01-project/CHANGES.md` 为准。
- 任何状态变化需同步 `TODO / README / CHANGES`，避免再次出现“未启动项被误写为已落地”。
