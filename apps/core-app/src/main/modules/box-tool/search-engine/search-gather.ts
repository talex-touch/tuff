import {
  TuffQuery,
  withTimeout,
  TimeoutError,
  TuffSearchResult,
  ITuffGatherOptions,
  ISearchProvider,
  TuffAggregatorCallback,
  IGatherController
} from '@talex-touch/utils'
import { ProviderContext } from './types'

/**
 * 扩展源统计接口，添加队列类型
 */
interface ExtendedSourceStat {
  providerId: string
  providerName: string
  duration: number
  resultCount: number
  status: 'success' | 'timeout' | 'error'
  queueType?: 'priority' | 'delayed'
}

/**
 * 聚合器的默认配置选项
 */
const defaultTuffGatherOptions: ITuffGatherOptions = {
  timeout: {
    default: 200,
    fallback: 5000
  },
  concurrent: {
    default: 5,
    fallback: 2
  },
  forcePushDelay: 50
}

/**
 * 创建搜索控制器
 * @param callback 执行搜索的回调函数
 * @returns 搜索控制器接口
 */
function createGatherController(
  callback: (
    signal: AbortSignal,
    resolve: (value: number | PromiseLike<number>) => void
  ) => Promise<number>
) {
  const controller = new AbortController()
  const { signal } = controller

  const promise = new Promise<number>((resolve, reject) => {
    callback(signal, resolve)
      .catch(reject)
      .finally(() => {
        if (!controller.signal.aborted) {
          console.log('[Gather] Search completed.')
        }
      })
  })

  return {
    promise,
    abort: () => {
      if (!controller.signal.aborted) {
        console.debug('[Gather] Aborting search.')
        controller.abort()
      }
    },
    signal
  }
}

/**
 * Tuff 启动器的核心聚合器
 * 实现了双队列搜索机制：优先队列和延迟队列
 * - 优先队列：快速响应，有严格超时限制，达到超时立即推送结果
 * - 延迟队列：继续执行超时的任务，定期批量推送结果
 *
 * @param options - 聚合器的详细配置选项
 * @returns 一个函数，调用时接收 providers 和 query，返回搜索控制器
 */
export function createGatherAggregator(options: ITuffGatherOptions = defaultTuffGatherOptions) {
  const { timeout, concurrent, forcePushDelay } = options

  /**
   * 聚合器核心搜索函数
   * @param providers 搜索提供者列表
   * @param params 搜索参数
   * @param onUpdate - 用于接收实时搜索结果更新的回调函数
   * @returns 搜索控制器
   */
  return function executeSearch(
    providers: ISearchProvider<ProviderContext>[],
    params: TuffQuery,
    onUpdate: TuffAggregatorCallback
  ): IGatherController {
    console.log(`[Gather] Starting search with ${providers.length} providers.`)

    /**
     * 核心搜索实现
     */
    async function handleGather(
      signal: AbortSignal,
      resolve: (value: number | PromiseLike<number>) => void
    ): Promise<number> {
      const allResults: TuffSearchResult[] = []
      const sourceStats: Array<ExtendedSourceStat> = []
      const delayedQueue: ISearchProvider<ProviderContext>[] = []
      const priorityQueue = [...providers]

      let pushBuffer: TuffSearchResult[] = []
      let forcePushTimerId: NodeJS.Timeout | null = null
      let hasFlushedFirstBatch = false

      /**
       * 刷新结果缓冲区并通过onUpdate回调推送结果
       * @param isFinalFlush - 是否为最终刷新。如果为true，将发送额外的`isDone: true`信号
       * @param forcePush - 是否强制推送，即使缓冲区为空
       */
      const flushBuffer = (isFinalFlush = false, forcePush = false): void => {
        if (forcePushTimerId) {
          clearTimeout(forcePushTimerId)
          forcePushTimerId = null
        }

        if (pushBuffer.length > 0 || forcePush) {
          const itemsCount = allResults.reduce((acc, curr) => acc + curr.items.length, 0)
          onUpdate({
            newResults: pushBuffer,
            totalCount: itemsCount,
            isDone: false,
            sourceStats: sourceStats as TuffSearchResult['sources']
          })
          pushBuffer = []
        }

        if (isFinalFlush) {
          const itemsCount = allResults.reduce((acc, curr) => acc + curr.items.length, 0)
          onUpdate({
            newResults: [],
            totalCount: itemsCount,
            isDone: true,
            sourceStats: sourceStats as TuffSearchResult['sources']
          })
          resolve(itemsCount)
        }
      }

      let firstBatchTimeoutId: NodeJS.Timeout | null = null

      /**
       * 执行首次批次刷新，确保只执行一次
       */
      const flushFirstBatchOnce = (): void => {
        if (hasFlushedFirstBatch) return

        hasFlushedFirstBatch = true
        if (firstBatchTimeoutId) {
          clearTimeout(firstBatchTimeoutId)
          firstBatchTimeoutId = null
        }
        console.debug('[Gather] Flushing first batch.')
        flushBuffer(false, true)
      }

      /**
       * 处理来自任何提供者的新结果
       * @param result - 新到达的TuffSearchResult
       * @param providerId - 返回结果的提供者ID
       * @param queueType - 提供者所在的队列类型
       */
      const onNewResultArrived = (
        result: TuffSearchResult,
        providerId: string,
        queueType: 'priority' | 'delayed'
      ): void => {
        console.debug(
          `[Gather] Received ${result.items.length} items from provider: ${providerId} (${queueType} queue)`
        )

        // 为延迟队列的结果添加标记
        if (queueType === 'delayed') {
          result.items = result.items.map((item) => ({
            ...item,
            meta: {
              ...item.meta,
              extension: {
                ...item.meta?.extension,
                isDelayed: true
              }
            }
          }))
        }

        allResults.push(result)
        pushBuffer.push(result)

        // 第一批次刷新后，使用去抖动机制进行后续更新
        if (hasFlushedFirstBatch) {
          if (forcePushTimerId) {
            clearTimeout(forcePushTimerId)
          }
          forcePushTimerId = setTimeout(() => flushBuffer(), forcePushDelay)
        }
      }

      /**
       * 执行并发工作池
       * @param queue - 要处理的提供者队列
       * @param concurrency - 并发工作者数量
       * @param processingTimeout - 单个任务的超时时间
       * @param queueType - 队列类型，优先或延迟
       */
      const runWorkerPool = async (
        queue: ISearchProvider<ProviderContext>[],
        concurrency: number,
        processingTimeout: number,
        queueType: 'priority' | 'delayed'
      ): Promise<void> => {
        const queueName = queueType === 'delayed' ? 'Delayed' : 'Priority'
        console.debug(`[Gather] Running ${queueName} queue with ${concurrency} concurrent workers.`)

        const workers = Array(concurrency)
          .fill(0)
          .map(async () => {
            while (queue.length > 0) {
              const provider = queue.shift()
              if (!provider) continue

              const startTime = performance.now()
              let resultCount = 0
              let status: 'success' | 'timeout' | 'error' = 'success'

              try {
                if (signal.aborted) {
                  status = 'error'
                  return
                }

                // 优先队列使用timeout限制，延迟队列不使用timeout
                const searchPromise = provider.onSearch(params, signal)
                let searchResult: TuffSearchResult

                if (queueType === 'priority') {
                  try {
                    searchResult = await withTimeout(searchPromise, processingTimeout)
                  } catch (e) {
                    if (e instanceof TimeoutError) {
                      status = 'timeout'
                      // 将超时的提供者移至延迟队列继续执行
                      delayedQueue.push(provider)

                      // 继续等待结果，但不阻塞优先队列
                      searchPromise
                        .then((result) => {
                          resultCount = result.items.length
                          onNewResultArrived(result, provider.id, 'delayed')

                          const duration = performance.now() - startTime
                          logProviderCompletion(provider, duration, resultCount, 'delayed')

                          sourceStats.push({
                            providerId: provider.id,
                            providerName: provider.name || provider.constructor.name,
                            duration,
                            resultCount,
                            status: 'success',
                            queueType: 'delayed'
                          })
                        })
                        .catch((err) => {
                          console.error(
                            `Provider [${provider.constructor.name}] encountered an error during delayed search:`,
                            err
                          )
                        })

                      // 跳过当前provider的后续处理
                      continue
                    } else {
                      throw e
                    }
                  }
                } else {
                  // 延迟队列中的provider不使用timeout
                  searchResult = await searchPromise
                }

                resultCount = searchResult.items.length
                onNewResultArrived(searchResult, provider.id, queueType)
              } catch (error) {
                if (signal.aborted) {
                  status = 'error'
                  return
                } else {
                  status = 'error'
                  console.error(
                    `Provider [${provider.constructor.name}] encountered an error during search:`,
                    error
                  )
                }
              } finally {
                const duration = performance.now() - startTime

                if (status === 'success') {
                  logProviderCompletion(provider, duration, resultCount, queueType)

                  sourceStats.push({
                    providerId: provider.id,
                    providerName: provider.name || provider.constructor.name,
                    duration,
                    resultCount,
                    status,
                    queueType
                  })
                }
              }
            }
          })
        await Promise.all(workers)
      }

      /**
       * 记录提供者完成信息
       */
      const logProviderCompletion = (
        provider: ISearchProvider<ProviderContext>,
        duration: number,
        resultCount: number,
        queueType: 'priority' | 'delayed'
      ): void => {
        let durationStr = ''
        if (duration < 50) {
          durationStr = `${duration.toFixed(1)}ms`
        } else if (duration < 200) {
          durationStr = `${duration.toFixed(1)}ms (!)`
        } else {
          durationStr = `${duration.toFixed(1)}ms (!!)`
        }

        const queueLabel = queueType === 'delayed' ? '[延迟队列]' : '[优先队列]'
        console.log(
          `[Gather] ${queueLabel} Provider [${provider.id}] finished in ${durationStr} with ${resultCount} results`
        )
      }

      const run = async (): Promise<number> => {
        // 设置首批结果的超时定时器
        firstBatchTimeoutId = setTimeout(flushFirstBatchOnce, timeout.default)

        // 处理优先队列
        await runWorkerPool(priorityQueue, concurrent.default, timeout.default, 'priority')
        flushFirstBatchOnce()

        // 处理延迟队列中的提供者
        if (delayedQueue.length > 0) {
          console.debug(`[Gather] Starting delayed queue with ${delayedQueue.length} providers.`)
          await runWorkerPool(delayedQueue, concurrent.fallback, timeout.fallback, 'delayed')
        }

        console.debug('[Gather] All search tasks completed.')
        flushBuffer(true)

        // 返回总数
        return allResults.reduce((acc, curr) => acc + curr.items.length, 0)
      }

      return run()
    }

    // 创建搜索控制器
    return createGatherController((signal, resolve) => {
      return handleGather(signal, resolve)
    })
  }
}

export const gatherAggregator = createGatherAggregator()
