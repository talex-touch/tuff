# 质量审查 260111

## 范围
- 主进程调度、轮询与定时器使用
- 工具函数重复/冲突
- 注释卫生与架构一致性

## 调度与轮询发现
- 已收敛：主/渲染进程中的 `setInterval` 已统一迁移到 `PollingService`（Clipboard、Sentry、DownloadCenter、UsageSummary、RecommendationEngine、DevServerMonitor、FxRate、DivisionBox、SystemSampler、renderer perf 等）。
- 仍保留的 `setTimeout` 为短生命周期的 debounce/timeout，不在统一轮询范围内。
- `StoragePollingService.setInterval` 仅为配置 API 命名，不是实际定时器。

## 工具函数重复/冲突
- `sleep` 相关 helper 重复：
  - `apps/core-app/src/main/utils/common-util.ts` 定义了 `sleep`。
  - `packages/utils/common/utils/index.ts` 导出了 `sleep`。
- `delay` 相关 helper 重复实现：
  - `apps/core-app/src/main/modules/box-tool/search-engine/search-gather.ts` 内部定义了本地 `delay`。
  - `apps/core-app/src/main/utils/common-util.ts` 内含 `debounce`，而共享代码中已有其他 debounce 实现。
- `packages/utils/common/utils/task-queue.ts` 已提供 `runAdaptiveTaskQueue`（自动让出事件循环），可替换手写分批/`setImmediate`。
- 建议：统一收敛到 `packages/utils`，移除本地重复实现，避免行为不一致与分叉。

## 复杂度 / 重构候选
- `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts` 体量过大、职责混杂（索引、缓存、图标抽取、IPC）。建议拆分：
  - 图标抽取队列
  - 打开器解析 + 存储持久化
  - 索引进度 + 事件上报
- `apps/core-app/src/main/modules/box-tool/search-engine/search-gather.ts` 包含自定义聚合与延迟逻辑；建议使用共享任务队列工具（`packages/utils/common/utils/task-queue.ts`）。

## 注释卫生问题
- 大段被注释的代码要么删除，要么放在 feature flag 后恢复：
  - `apps/core-app/src/main/modules/build-verification/index.ts` 包含大量注释逻辑。
  - `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts` 有完整注释掉的 `ProgressLogger`。
- 建议：只保留实际生效的代码与精简动机注释；长时间失活的代码应迁入文档或 feature-flag 模块。

## 补充说明
- Perf 事故上报已在 summary key 中包含通道类型与方向；Nexus 消息应在可用时包含 `eventName`、`channelType` 与方向信息。
- 按需求：即便用户关闭 analytics，Nexus 的异常上报仍应保持开启。
