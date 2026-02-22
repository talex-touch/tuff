# SQLite 重试回退到 Retrier 方案 260222

## 背景
- 当前 SQLite 重试逻辑集中在 `apps/core-app/src/main/db/sqlite-retry.ts`，但与 `@talex-touch/utils/common/utils/time.ts` 的 `createRetrier` 体系不一致。
- 多处模块已使用 `createRetrier` 做重试（如 AppProvider），希望统一重试策略与日志节流，降低日志噪音与维护成本。

## 最终目标
- 统一 SQLite busy 重试为 `createRetrier` 体系，保持指数退避 + 抖动 + 日志节流能力。
- 保证 Drizzle 包装错误（`cause` 链）也能触发 retry。
- 避免新增依赖，保持主线程行为可预测。

## 范围
- 主进程 SQLite 写入重试链路：
  - `apps/core-app/src/main/db/sqlite-retry.ts`
  - 使用该工具的 DB 写路径（Analytics/QueryCompletion/UsageStats 等）
- `@talex-touch/utils/common/utils/time.ts` 的 `createRetrier` 轻量扩展（仅为 delay/backoff）。

## 非目标
- 不调整 DB schema / WAL / migrations。
- 不改动 worker 线程写入策略（索引/文件处理）。
- 不引入新重试库或新依赖。

## 方案设计

### 1) 为 createRetrier 增加可配置退避
在 `packages/utils/common/utils/time.ts` 中新增可选配置：
- `delayMs?: number | ((attempt: number, error: Error) => number)`
- `jitterRatio?: number`（默认 0 或 0.2）
- 在每次 retry 前执行 `await sleep(delayMs)`，并允许动态计算（指数退避）。

说明：保持原 API 兼容；不提供 delay 时，行为与现在一致。

### 2) 统一 SQLite busy retrier
在 `apps/core-app/src/main/db/sqlite-retry.ts` 内部改为：
- 基于 `createRetrier` 生成 `sqliteBusyRetrier`
- `shouldRetry` 递归检查 `cause/original/error/AggregateError`
- `delayMs` 使用指数退避 + 抖动
- 日志节流：每个 `label` 限频（如 5s）

### 3) 迁移调用点
- 将 `withSqliteRetry` 包装改为使用 retrier，但保持现有签名（兼容调用方）。
- 不在调用点改业务逻辑，仅替换重试实现。

## 质量约束
- 不改变现有 `withSqliteRetry` 的公共签名与调用方式。
- 同类错误必须在 3~5 次重试内完成或失败，不允许无限重试。
- 日志噪音可控：单 label 5s 以内只输出一次 retry warn。

## 验收标准
- `SQLITE_BUSY` / `SQLITE_BUSY_SNAPSHOT` 触发 retrier，且 delay/抖动生效。
- Drizzle 包装错误（`cause` 链）可以重试。
- 日志量明显下降（同类 busy 错误不刷屏）。
- 不影响非 SQLite 业务功能与主要性能路径。

## 回滚策略
- 保留 `withSqliteRetry` 的旧实现作为回滚分支（或临时函数）。
- 若 retrier 引入行为回归，可快速切回旧版实现。

## 风险与对策
- 风险：`createRetrier` 扩展导致其它模块行为变化  
  对策：新增参数全为可选，默认不启用 delay，保持原逻辑。
- 风险：退避时间过长影响实时性  
  对策：设置最大 delay 上限（例如 2s），并允许局部 override。

## 实施步骤
1. 扩展 `createRetrier` 的 delay/jitter 能力（保证兼容）。
2. `sqlite-retry.ts` 迁移到 retrier 实现，保持 API 不变。
3. 在 analytics / query completion / usage stats 相关路径回归验证。
