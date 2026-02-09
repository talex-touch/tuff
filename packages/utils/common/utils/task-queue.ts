type ConsoleLike = Pick<typeof console, 'debug' | 'warn'>

export interface AdaptiveTaskQueueOptions {
  /**
   * 估算单个任务的执行耗时（毫秒）。用于动态计算每批处理量。
   * 若不确定，可传入 1~2 之间的经验值。
   */
  estimatedTaskTimeMs?: number
  /**
   * 每次让出事件循环前的最长时间窗口（毫秒），默认约等于一帧的 17ms。
   */
  yieldIntervalMs?: number
  /**
   * 限制每批最大处理数量，避免估算误差导致批次过大。
   */
  maxBatchSize?: number
  /**
   * 自定义日志输出目标，默认使用 `console`。
   */
  logger?: ConsoleLike
  /**
   * 方便调试的标签，会出现在日志里。
   */
  label?: string
  /**
   * 每次批处理完成后触发，可用于自定义进度上报。
   */
  onYield?: (context: {
    processed: number
    total: number
    batchSize: number
    elapsedMs: number
  }) => void
}

const DEFAULT_YIELD_INTERVAL_MS = 17

async function delay(ms: number): Promise<void> {
  if (ms <= 0)
    return
  await new Promise<void>(resolve => setTimeout(resolve, ms))
}

/**
 * 以“自适应批处理”方式执行一组任务。
 *
 * - 根据传入的任务量与预估耗时动态计算批大小
 * - 每批处理后，会等待（默认 17ms）以释放事件循环，避免主线程卡顿
 * - 支持在批处理完成时回调进度
 */
export async function runAdaptiveTaskQueue<T>(
  items: readonly T[],
  handler: (item: T, index: number) => Promise<void> | void,
  options: AdaptiveTaskQueueOptions = {},
): Promise<void> {
  const total = items.length
  if (total === 0)
    return

  const {
    estimatedTaskTimeMs = 1,
    yieldIntervalMs = DEFAULT_YIELD_INTERVAL_MS,
    maxBatchSize,
    logger = console,
    label = 'AdaptiveTaskQueue',
    onYield,
  } = options

  const safeTaskMs = Math.max(estimatedTaskTimeMs, 0.1)
  const computedBatchSize = Math.max(1, Math.floor(yieldIntervalMs / safeTaskMs))
  const batchSize = maxBatchSize ? Math.min(maxBatchSize, computedBatchSize) : computedBatchSize

  const currentPerformance = typeof globalThis !== 'undefined' ? (globalThis as any)?.performance : undefined
  const now = () => (currentPerformance ? currentPerformance.now() : Date.now())

  const startTime = now()

  logger.debug?.(
    `[${label}] Starting queue for ${total} item(s). batchSize=${batchSize}, estimated=${safeTaskMs.toFixed(2)}ms`,
  )

  for (let index = 0; index < total; index++) {
    const item = items[index]
    if (item === undefined)
      continue
    await handler(item, index)

    const processed = index + 1
    if (processed % batchSize === 0 && processed < total) {
      const beforeYield = now()
      await delay(yieldIntervalMs)
      const afterYield = now()
      const elapsedMs = beforeYield - startTime
      logger.debug?.(
        `[${label}] Yielded after ${processed}/${total} item(s); wait ${(
          afterYield - beforeYield
        ).toFixed(1)}ms`,
      )
      onYield?.({
        processed,
        total,
        batchSize,
        elapsedMs,
      })
    }
  }

  const endTime = now()
  logger.debug?.(
    `[${label}] Completed ${total} item(s) in ${((endTime - startTime) / 1000).toFixed(2)}s`,
  )
}
