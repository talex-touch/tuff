# Storage 统一封装分析 260111

## 现状
- 主进程 `StorageModule` 同时支持：
  - TouchChannel：`storage:get/storage:save/storage:update`（广播）
  - TuffTransport：`StorageEvents.app.get/getVersioned/save/delete/updated`
- 渲染进程存在两种接入路径：
  - `TouchStorage`（现在优先走 TuffTransport，保留 legacy）
  - `storage-subscription`（stream 或 `storage:update`）

## 痛点
- **双通道并存**：部分模块走 stream，部分模块走 legacy，行为不一致。
- **订阅语义不一致**：stream 与 broadcast 的回调时序、错误处理、节流策略不同。
- **封装层缺失**：业务模块直接知道“走 stream 还是 storage:update”，导致耦合。

## 你说的“统一封装”我理解是
把所有 storage 的读/写/订阅入口收敛到一个统一 API（utils 层），业务模块不关心底层是 stream 还是 legacy。

## 已落地（本次变更）
- 渲染端 `TouchStorage` 支持 `initStorageTransport()`，优先走 `StorageEvents`，无 transport 时回落 TouchChannel。
- `storage-subscription` 支持 stream + legacy 双路径。
- 主进程补齐 `StorageEvents.app.get/getVersioned/save/delete` 处理器。

## 仍需收口的点
1. **同步能力**：`saveSync` 仍依赖 TouchChannel（窗口关闭场景）。
2. **统一入口**：建议继续引入 `StorageGateway`，隐藏 `sendSync/stream` 细节。
3. **语义对齐**：stream 与 broadcast 的节流策略需统一（目前仍是双轨）。

## 风险点
- 多窗口广播时的版本冲突处理需要统一（versioned 存储）。
- stream/broadcast 的超时和 backoff 行为需一致化。

## 下一步建议
- 增加 `StorageGateway`（utils 层），统一 get/save/reload/subscribe。
- 同步接口只保留在 gateway 内部，业务层统一 async。
