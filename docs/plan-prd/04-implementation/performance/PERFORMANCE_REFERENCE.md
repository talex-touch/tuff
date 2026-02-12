# 性能优化参考

> 精简自: PERFORMANCE_OPTIMIZATIONS.md

---

## 已实现优化

### 1. 数据库索引
```sql
-- download_tasks
CREATE INDEX idx_tasks_status ON download_tasks(status);
CREATE INDEX idx_tasks_created ON download_tasks(created_at DESC);
CREATE INDEX idx_tasks_priority ON download_tasks(priority DESC);

-- download_history
CREATE INDEX idx_history_created ON download_history(created_at DESC);

-- item_usage_stats
CREATE INDEX idx_item_usage_source_type ON item_usage_stats(source_type);
CREATE INDEX idx_item_usage_updated ON item_usage_stats(updated_at DESC);
```

**性能提升**: 查询耗时 50-100ms → 5-10ms (5-10x)

---

### 2. 虚拟滚动
- 文件: `VirtualTaskList.vue`
- 触发条件: 列表 > 50 项
- 渲染项数: 可见区域 + 上下3项缓冲
- 性能提升: 500项渲染 200ms → 20ms (10x)

---

### 3. 搜索防抖
- 延迟: 300ms
- 工具: `utils/performance.ts` 中的 `debounce()`
- 性能提升: 搜索响应 150ms → 30ms (5x)

---

### 4. 进度节流
- 频率: 1秒/任务
- 位置: `download-center.ts`
- 效果: IPC消息从 10-20/秒 降至 1/秒 (10-20x)

---

### 5. 任务缓存
- 结构: Map<taskId, Task>
- 更新: 任务修改时同步更新
- 效果: 减少队列查询,提升状态查询性能

---

## 性能监控

### PerformanceMonitor 类
```typescript
const result = await performanceMonitor.measure(
  'operation_name',
  async () => {
    // Your operation
  }
)

// 查看统计
monitor.logSummary()
const stats = monitor.getStatistics('db_get_all_tasks')
console.log(`P95: ${stats.p95}ms`)
```

**特性**:
- 追踪耗时、计数、百分位 (p50/p95/p99)
- 记录慢操作 (>100ms)
- 提供性能摘要

---

## 配置调整

### 虚拟滚动阈值
`DownloadCenterView.vue` 中的 `useVirtualScroll` ref,默认 50 项。

### 防抖延迟
`DownloadCenterView.vue` 中 `debounce()` 参数,默认 300ms。

### 进度节流
`download-center.ts` 中 `progressThrottleMs`,默认 1000ms。

---

### 6. 文件索引流水线（FileProvider fullScan / reconciliation）

**核心瓶颈**: SQLite 驱动层同步 I/O，单条 INSERT 阻塞 50-200ms

**优化措施**:
- DbWriteScheduler 逐任务 `setImmediate` yield（原每 3 任务）
- INSERT 分片: 100 → 20 条/批；delete 分片: 500 → 100 条/批
- 批量事务拆分为逐条独立事务（indexItems / removeItems / flushIndexWorkerResults）
- 生产者背压: `waitForCapacity(15)` 限制队列深度
- 同步图标提取移除，processFileExtensions 全面 fire-and-forget
- `estimatedTaskTimeMs` = 20（每个 runAdaptiveTaskQueue 任务后 yield）

**性能提升**: Event loop lag 500-900ms → ~200ms (4x)

---

### 7. DbWriteScheduler 背压机制

**核心 API**:
```typescript
// 生产者在循环中调用，队列深度 >= maxQueued 时挂起
await dbWriteScheduler.waitForCapacity(15)

// 每个任务完成后自动唤醒等待的生产者
private notifyCapacityWaiters(): void
```

**效果**: 防止 fire-and-forget DB 写入导致队列无限膨胀（等待时间从 1300ms+ 稳定到可控范围）

---

## 关键指标

| 指标 | 优化前 | 优化后 | 提升 |
|------|--------|--------|------|
| 500项列表渲染 | 200ms | 20ms | 10x |
| 搜索响应 | 150ms | 30ms | 5x |
| 数据库查询 | 50-100ms | 5-10ms | 5-10x |
| 进度更新IPC | 10-20/秒 | 1/秒 | 10-20x |
| 文件索引 event loop lag | 500-900ms | ~200ms | 4x |
| DB写入队列等待 | 1300ms+ | 稳定可控 | 背压限流 |

---

**参考原文**: `plan-prd/04-implementation/performance/PERFORMANCE_OPTIMIZATIONS.md` (223行)

**文档版本**: v3.0 (新增文件索引流水线与背压机制优化)
