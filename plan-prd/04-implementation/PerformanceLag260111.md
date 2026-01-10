# 卡顿分析 260111

## 现象
- 频繁出现 `Perf:EventLoop` lag（200ms~1000ms+），伴随 `core-box:query`、`core-box:input-change` 等 IPC slow。
- `FileProvider` 出现长时间 reconciliation / index scan（数万文件），与 lag 同步。
- 部分后台任务（更新检查、插件更新、统计上报）在相近时间触发，产生突刺。

## 主要可疑路径（按优先级）
1. **FileProvider 主线程扫描 + 解析**
   - reconciliation 扫描数万文件、图标提取、文件元数据读取集中在主线程。
   - 虽有 `setImmediate`/分批，但仍可能在高 IO/CPU 突刺时阻塞 event loop。
2. **CoreBox 搜索链路**
   - 搜索输入触发多次 IPC 与排序/过滤；日志显示 `core-box:query` 500ms+。
3. **后台定时任务集中触发**
   - 多个模块使用 `setInterval/setTimeout` 自建调度，可能在相近时间并发。
4. **IPC 回路**
   - `ipc.no_handler` / `channel.send.errorReply` 会引发异常链路和重试。

## 证据线索（来自现有日志）
- `Perf:EventLoop` 连续告警（200ms~1000ms）
- `FileProvider` reconciliation 15k+ items
- `core-box` 相关 IPC send/handler slow（>500ms）

## 建议策略
### 短期
- 将 UpdateService 的轮询改为统一 PollingService（已开始执行）。
- 对 FileProvider 扫描与图标提取做更严格的分批/让步（yield）。
- 对 `core-box:query` 关键路径做“输入合并 + 取消旧任务”。

### 中期
- 将文件索引/图标提取迁移到 Worker/子进程，主进程只做结果合并与缓存。
- 将后台轮询统一收口到 `PollingService`，避免多个定时器叠加。
- 为 IPC 添加 backpressure（超时/降级/缓存）。

### 长期
- 架构上将 IO-heavy 任务集中到 worker pool
- 对搜索与索引进行拆分（读写分离，前端只订阅状态变更）

## 需要补充的采样
- Perf summary 中加入更多 `eventName + channelType + direction` 统计
- FileProvider 各阶段耗时分段（scan / parse / persist / icon）
- CoreBox query pipeline 拆分耗时（provider 拉取 / 排序 / 渲染）
