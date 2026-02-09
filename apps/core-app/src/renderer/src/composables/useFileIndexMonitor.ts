import type {
  FileIndexProgress,
  FileIndexRebuildRequest,
  FileIndexRebuildResult
} from '@talex-touch/utils/transport/events/types'
import { useSettingsSdk } from '@talex-touch/utils/renderer'
import { ref } from 'vue'

/**
 * 文件索引监控 Composable
 * 提供索引状态查询和手动重建功能
 */
export function useFileIndexMonitor() {
  const settingsSdk = useSettingsSdk()

  const indexProgress = ref<FileIndexProgress | null>(null)

  /**
   * 查询当前索引状态
   */
  const getIndexStatus = async () => {
    try {
      const status = await settingsSdk.fileIndex.getStatus()
      return status
    } catch (error) {
      console.error('[FileIndexMonitor] Failed to get index status:', error)
      return null
    }
  }

  /**
   * 查询电池电量
   */
  const getBatteryLevel = async () => {
    try {
      const battery = await settingsSdk.fileIndex.getBatteryLevel()
      return battery
    } catch (error) {
      console.error('[FileIndexMonitor] Failed to get battery level:', error)
      return null
    }
  }

  /**
   * 查询索引统计信息
   */
  const getIndexStats = async () => {
    try {
      const stats = await settingsSdk.fileIndex.getStats()
      return stats
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : ''
      // Ignore timeout errors during startup - module may not be ready yet
      if (message.includes('timed out')) {
        console.debug('[FileIndexMonitor] Stats fetch timed out, module may be initializing')
        return null
      }
      console.error('[FileIndexMonitor] Failed to get index stats:', error)
      return null
    }
  }

  /**
   * 手动触发重建索引
   */
  const handleRebuild = async (
    request?: FileIndexRebuildRequest
  ): Promise<FileIndexRebuildResult> => {
    try {
      console.log('[FileIndexMonitor] Triggering manual index rebuild...')
      const result = await settingsSdk.fileIndex.rebuild(request)

      if (result?.requiresConfirm) {
        console.log('[FileIndexMonitor] Rebuild requires confirmation before proceeding')
        return result
      }
      if (result?.success) {
        console.log('[FileIndexMonitor] Rebuild triggered successfully')
        return result
      }
      console.error('[FileIndexMonitor] Rebuild failed:', result?.error)
      throw new Error(result?.error || 'Rebuild failed')
    } catch (error) {
      console.error('[FileIndexMonitor] Failed to trigger rebuild:', error)
      throw error
    }
  }

  /**
   * 订阅索引进度更新
   * 返回取消订阅的函数
   */
  const onProgressUpdate = (callback: (progress: FileIndexProgress) => void) => {
    let cancelled = false
    let controller: { cancel: () => void } | null = null

    settingsSdk.fileIndex
      .streamProgress({
        onData: (data) => {
          indexProgress.value = data as FileIndexProgress
          callback(data as FileIndexProgress)
        },
        onError: (err) => {
          console.error('[FileIndexMonitor] Progress stream error:', err)
        }
      })
      .then((stream) => {
        if (cancelled) {
          stream.cancel()
          return
        }
        controller = stream
      })
      .catch((error) => {
        console.error('[FileIndexMonitor] Failed to start progress stream:', error)
      })

    return () => {
      cancelled = true
      controller?.cancel()
    }
  }

  return {
    getIndexStatus,
    getBatteryLevel,
    getIndexStats,
    handleRebuild,
    onProgressUpdate,
    indexProgress
  }
}
