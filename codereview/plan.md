# 全仓质量推进计划（排序执行）

> 目标：以“高风险优先、面向收益、可验证”为原则，优先消除 P1/P2 风险与 TODO 空间。

## 总体优先级策略
1) **阻断/高风险功能缺口（P1）**  
2) **稳定性与一致性（日志、类型、安全门控）**  
3) **测试与自动化门禁**  
4) **文档/流程同步**

## Phase 0 — 基线收敛（1~2 天）
- 输出：统一追踪表（风险、负责人、状态、目标版本）
- 动作：
  - 确认 `todo-backlog.md` 中 P1/P2 项负责人
  - 明确“功能可见但不可用”的 UI gate 策略

## Phase 1 — P1 功能缺口闭环（最高优先）
### 1.1 Agent 市场安装/卸载
**路径**：`apps/core-app/src/main/service/agent-market.service.ts:391/428`  
**目标**：从 “假可用” → “最小可用”  
**输出**：安装/卸载主流程 + 错误提示 + 最小测试

### 1.2 plugin-core API 最小实现
**路径**：`apps/core-app/src/renderer/src/modules/channel/plugin-core/index.ts:2`  
**目标**：定义最小 API + 调用端 gating  
**输出**：接口定义 + 基本实现 + 文档说明

### 1.3 Search engine 性能/刷新逻辑
**路径**：`search-core.ts:225/1360`  
**目标**：provider 级熔断/缓存刷新策略  
**输出**：策略配置 + 测试/性能基线

### 1.4 File provider Phase2 与 embeddings
**路径**：`file-provider.ts:849/3283`  
**目标**：明确 Everything SDK 接入方案 + 向量检索 hook 设计  
**输出**：方案/时间线 + 最小实现或明确禁用路径

### 1.5 AI Capability gating
**路径**：`base-provider.ts`、`local-provider.ts`、`intelligence-sdk.ts`  
**目标**：所有 “not implemented” 不可到达  
**输出**：UI/调用链 gating + 统一错误提示

## Phase 2 — 生产可观测性与日志治理（P2）
**范围**：`flow-bus/*`、`division-box/*`、`download/*`、`update/*`  
**目标**：`console.log` 替换为可控 ModuleLogger + env gating  
**输出**：日志级别策略 + 统一开关

## Phase 3 — 类型安全治理（P2）
### 3.1 `as any` 高密度模块优先
- `packages/utils`（channel/transport 访问层）
- `packages/tuffex`（高频组件）
- `apps/nexus/server`（API/utils）
**目标**：为 runtime accessor 建立强类型 + schema 校验

### 3.2 `@ts-ignore` 清理
**目标**：对 auto-import/DOM API 提供明确声明替代

## Phase 4 — 测试门禁补齐（P2）
- `apps/nexus`：补 server utils/API 最小测试
- `apps/core-app`：Search/File provider/Agent market 相关测试
- `packages/utils/tuffex`：为高风险组件/transport 补测试
**输出**：每包可运行最小测试命令

## Phase 5 — CI/文档同步（P3）
- 打开包级 CI 的 `run-test/run-lint/typecheck`
- 根级补 `test` script
- PRD/TODO 状态同步机制（文档 checklist）

## 关键验收标准
- 所有 P1 缺口有实现或明确禁用策略
- 生产路径不出现 “not implemented” 异常
- 主要模块日志可控且不污染生产
- 核心包具备可运行的最小测试入口
