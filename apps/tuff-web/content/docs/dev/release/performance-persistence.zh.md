# 核心性能落地（2026-03）

本次落地聚焦 **SQLite 写压治理** 与 **高频统计降噪**，目标是减少锁竞争、降低写放大，并保证关键行为数据的可靠落盘。

## 背景问题
- 搜索链路存在高频 `stats/analytics` 写入，容易与业务写入争用 SQLite。
- OCR 队列在高压场景会产生大量中间态写入，造成无效 I/O。
- 统计数据曾以极短间隔落盘，不符合生产场景的成本收益。

## 已落地策略

### 1) Usage Stats 分层聚合
- `search` 与 `action(execute/cancel)` 拆分为两条落盘路径。
- `search` 默认按 **30 分钟**批量落盘；`action` 默认按 **10 分钟**批量落盘。
- 支持阈值提前触发，避免长时间不落盘导致数据滞后。
- 写压高时自动降采样 `search`，优先保障关键 action 数据。

### 2) Analytics 快照降频
- 最小落盘间隔调整为：
  - `15m` 视图：10 分钟
  - `1h` 视图：20 分钟
  - `24h` 视图：60 分钟
- 通过“内存聚合 + 低频持久化”降低持续 I/O 压力。

### 3) 查询补全与报表队列统一调度
- 查询补全记录写入接入 `dbWriteScheduler + withSqliteRetry`。
- analytics 报表队列的插入、重试标记、删除、清理统一走调度器。
- 所有高频写路径统一串行调度，降低并发抢锁概率。

### 4) OCR 写压治理
- 队列高压时跳过 `ocr.jobs.start` 中间态写入，仅保留终态关键写入。
- `last-queued` / `last-dispatch` / `last-success` 增加最小间隔与深度门控。
- `last-failure` 仅首次失败状态写入，避免失败风暴重复覆盖。
- `queue-disabled` 增加语义签名去重，相同状态不重复落库。

### 5) 策略模块化与可观测性
- OCR 配置落盘策略抽离为独立 policy 模块，减少服务层分支复杂度。
- `dbWriteScheduler` 增加按 label 的 TopN 聚合日志，辅助压测期快速定位热点。

## 预期收益
- 显著降低 SQLite “database is locked” 触发概率。
- 高频场景（搜索/OCR）写放大明显收敛。
- 统计数据保持可用性的同时，落盘成本从“秒级频繁写”转为“分钟级批量写”。

## 运维建议
- 关注 `dbWriteScheduler` 的队列深度、平均等待、失败/丢弃计数。
- 若写压再次抬升，优先调整：
  - `search` 采样比例
  - `search/action` flush 周期
  - OCR `last-*` 最小落盘间隔

## 官方公告固化到 D1
- 新增接口：`POST /api/dashboard/updates/sync-official`
- 认证：管理员会话或具备 `release:news` scope 的 API Key

:::TuffCodeBlock{lang="bash"}
---
code: |
  curl -X POST "https://<your-nexus-host>/api/dashboard/updates/sync-official" \
    -H "Authorization: Bearer <API_KEY>" \
    -H "Content-Type: application/json"
---
:::

- 返回字段包含：`total`、`inserted`、`updated`，可用于确认本次是否真正落库。
