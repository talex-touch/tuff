# Storage 统一封装分析 260111

## 现状
- 主进程 `StorageModule` 同时支持：
  - TouchChannel：`storage:get/storage:save/storage:update`（广播）
  - TuffTransport：`StorageEvents.*` stream
- 渲染进程存在两种接入路径：
  - `TouchStorage`（依赖 `storage:update`）
  - 直接订阅 `StorageEvents.app.updated` stream

## 痛点
- **双通道并存**：部分模块走 stream，部分模块走 legacy，行为不一致。
- **订阅语义不一致**：stream 与 broadcast 的回调时序、错误处理、节流策略不同。
- **封装层缺失**：业务模块直接知道“走 stream 还是 storage:update”，导致耦合。

## 你说的“统一封装”我理解是
把所有 storage 的读/写/订阅入口收敛到一个统一 API（utils 层），业务模块不关心底层是 stream 还是 legacy。

## 推荐方案
1. **utils 层提供 `StorageGateway`**
   - `get(key)` / `save(key, data)` / `reload(key)`
   - `subscribe(key, callback)`：优先 stream，失败自动 fallback 到 `storage:update`
2. **主进程统一更新事件**
   - 内部仍可用 stream，但对外只暴露一个订阅入口。
   - 广播节流/去抖在 StorageModule 内部集中处理。
3. **渲染进程统一适配**
   - `TouchStorage` 内部改为调用 `StorageGateway`
   - `SettingMessages` 等模块不再直接订阅 stream

## 风险点
- 多窗口广播时的版本冲突处理需要统一（versioned 存储）。
- stream/broadcast 的超时和 backoff 行为需一致化。

## 下一步建议
- 增加 `packages/utils/renderer/storage/storage-gateway.ts`（或 common）。
- StorageModule 对外只暴露统一 update 事件，内部可自由切换实现。
