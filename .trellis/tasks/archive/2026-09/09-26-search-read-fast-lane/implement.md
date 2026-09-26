# Implement — 快层 provider 独立读车道

## Checklist

1. [x] `workers/search-index-read-worker-client.ts`：`lane` 选项、requestId 前缀、retire 日志 meta。
2. [x] `search-core.ts`：字段 `searchIndexFastReadWorker` / `searchIndexFastService`；init 构造；destroy finally 关闭；deps `getSearchIndexService(provider)` 三元分流；常量 `FAST_READ_LANE_TIMEOUT_MS = 3000`。
3. [x] `search-provider-registry.ts`：deps 类型 + `load(provider)` 传 provider。
4. [x] 测试：client lane 测试（`search-index-read-worker-client.lane.test.ts`，含 3s 超时只重建 fast 车道）；registry 分流测试（`search-provider-registry.lane.test.ts`）。
5. [x] 验证（2026-09-26，trellis-check 复核后）：
   - 六个指定 vitest 文件 6/6，60/60 用例（含新增的 3s 超时只重建 fast 车道用例）；`channel/common.test.ts` 36/36。
   - `typecheck:node` 通过；eslint 五个文件 0 错误 0 警告；`git diff --check` 干净。
   - 追加：`beforeProvidersLoad` 对 fast 实例也做一次 `waitUntilReadable()` 预热，避免首次快层查询付 worker 启动成本；契约测试重跑 40/40。
   - 备注：3s 预算下连续三次超时会触发既有的 30s 冷却（R4 决定），真机留意 `lane=fast consecutiveFailures=3`。

## Review gates

- 只碰 search-core.ts 的 init 构造块、destroy finally、deps 三元；不碰 talex-touch-40 的 coalescer hunk。
- fast 实例不得交给 `LegacySearchIndexWriter` 或可见性屏障。

## Rollback

- 删除第二实例与分流即可，无数据影响。
