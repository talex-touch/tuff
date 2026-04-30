# Transport Legacy 清退清单（2026-03）

> 目标版本：`v2.5.0`  
> 口径来源：`pnpm compat:registry:guard` 的 `legacy-transport-import`

## 1. 现状快照

- 基线（修复前）：`4 files / 4 hits`
- 当前（2026-03-16）：`0 files / 0 hits`

### 已完成收口文件（第一轮）

1. `apps/core-app/src/renderer/src/modules/plugin/widget-registry.ts`
2. `packages/utils/index.ts`
3. `packages/utils/plugin/preload.ts`
4. `packages/utils/renderer/storage/base-storage.ts`

## 2. 清退原则

1. 跨层通信统一 typed transport/domain SDK。
2. legacy 仅允许 warn-and-forward，不承载新能力。
3. 每清退 1 个入口必须同步更新 `compatibility-debt-registry.csv` 对应条目。
4. CoreApp renderer 业务消费统一走 `~/modules/storage/app-storage`、`@talex-touch/utils/renderer/storage` 与 `useStorageSdk()`；`~/modules/channel/storage` 只保留 storage bootstrap/兼容 re-export 边界。

## 3. 执行顺序

1. `packages/utils/plugin/preload.ts`：移除 `transport/legacy` 类型依赖。
2. `packages/utils/renderer/storage/base-storage.ts`：收口双轨 transport 访问。
3. `apps/core-app/src/renderer/src/modules/plugin/widget-registry.ts`：移除 legacy 导出桥接。
4. `packages/utils/index.ts`：删除 `export * from './transport/legacy'` 并完成 API 公告。

## 4. 验收

1. [x] `legacy-transport-import` = `0 files / 0 hits`。
2. [ ] `pnpm test:targeted`、`pnpm legacy:guard`、`pnpm quality:gate` 全绿。
3. [x] `docs/plan-prd/01-project/CHANGES.md` 记录退场结果与影响范围。
4. [ ] `v2.5.0` 窗口移除 `transport` 中 legacy 兼容符号转出（破坏性变更）。
5. [x] CoreApp renderer storage consumer import boundary 固化为 `src/renderer/src/modules/storage/app-storage-boundary.test.ts`。
