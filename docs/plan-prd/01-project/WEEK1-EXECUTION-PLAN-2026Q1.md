# Week 1 执行清单（2026-Q1）

> 目标窗口：2026-02-23 ~ 2026-03-01  
> 目标：修复主线质量阻塞，建立可执行的质量基线

## 1. 范围与优先级

- P0：`apps/core-app` 的 `typecheck:node` 阻塞项清理。
- P0：`packages/tuffex` 构建与 `typecheck:web` 阻塞项清理。
- P1：建立“最小必跑校验清单”并固化到文档。

## 2. 当前已知阻塞（事实来源）

### 2.1 typecheck:node 阻塞

- 文件：`apps/core-app/src/main/modules/tray/tray-manager.ts`
- 问题：
  - `App.activationPolicy` 类型缺失
  - `Tray.setHighlightMode` 类型缺失
- 预期处理：
  - 校验 Electron 类型版本与平台差异；
  - 使用安全的类型守卫或兼容封装。

### 2.2 typecheck:web 阻塞

- 文件：`packages/tuffex/packages/components/src/flat-radio/src/TxFlatRadio.vue`
  - `size` 变量未使用
- 文件：`packages/tuffex/packages/components/src/utils/__tests__/z-index-manager.test.ts`
  - `subscribed?.()` 被推断为 `never` 调用

## 3. 任务拆解（可执行）

### 3.1 P0：修复 core-app 主进程类型阻塞

- 核查 `activationPolicy` 与 `setHighlightMode` 的运行环境与类型定义。
- 补齐类型守卫或封装，确保跨平台不报错。
- 验收：
  - `pnpm -C "apps/core-app" run typecheck:node` 通过

### 3.2 P0：修复 tuffex 构建阻塞

- 清理 `TxFlatRadio.vue` 未使用变量（或改为实际使用）。
- 修复 `z-index-manager.test.ts` 的类型推断问题（确保可调用类型）。
- 验收：
  - `pnpm -C "apps/core-app" run typecheck:web` 通过

### 3.3 P1：最小必跑校验清单固化

- 文档化建议最小门禁：
  - `pnpm -C "apps/core-app" run typecheck:node`
  - `pnpm -C "apps/core-app" run typecheck:web`
  - （可选）定向 lint 与单测
- 输出到文档：
  - `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`（Week 1 说明）
  - `docs/plan-prd/TODO.md`（执行记录）

## 4. 风险与回滚

- 若类型修复影响运行时行为：优先用 platform guard 包裹，再逐步收紧类型。
- 若修复引发新错误：按“最小改动”原则回退到上一稳定版本。

## 5. 验收清单

- [ ] `pnpm -C "apps/core-app" run typecheck:node` 通过
- [ ] `pnpm -C "apps/core-app" run typecheck:web` 通过
- [ ] 最小必跑清单已固化到文档
