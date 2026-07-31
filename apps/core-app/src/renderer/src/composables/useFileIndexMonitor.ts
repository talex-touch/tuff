import type {
  FileIndexFailedFilesResult,
  FileIndexProgress,
  FileIndexRebuildRequest,
  FileIndexRebuildResult
} from '@talex-touch/utils/transport/events/types'
import { useSettingsSdk } from '@talex-touch/utils/renderer'
import { ref } from 'vue'
import { devLog } from '~/utils/dev-log'
import { createRendererLogger } from '~/utils/renderer-log'

const fileIndexMonitorLog = createRendererLogger('FileIndexMonitor')

/**
 * 文件索引监控 Composable
 * 提供索引状态查询和手动重建功能。
 *
 * 公共边界约定（issue #476）：日志只记录稳定的 operation/code/reportId，
 * 绝不记录、展示或上传捕获到的原始 Error 或 transport payload。
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
    } catch {
      fileIndexMonitorLog.error('Failed to get index status', { operation: 'getStatus' })
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
    } catch {
      fileIndexMonitorLog.error('Failed to get battery level', { operation: 'getBatteryLevel' })
      return null
    }
  }

  /**
   * 查询失败文件列表
   */
  const getFailedFiles = async (): Promise<FileIndexFailedFilesResult> => {
    try {
      return await settingsSdk.fileIndex.getFailedFiles()
    } catch {
      fileIndexMonitorLog.error('Failed to get failed files', { operation: 'getFailedFiles' })
      return { files: [] }
    }
  }

  /**
   * 查询索引统计信息
   */
  const getIndexStats = async () => {
    try {
      const stats = await settingsSdk.fileIndex.getStats()
      return stats
    } catch {
      fileIndexMonitorLog.error('Failed to get index stats', { operation: 'getStats' })
      return null
    }
  }

  /**
   * 手动触发重建索引。transport 异常被归一化为稳定 failure 结果，
   * 原始 Error 不会继续向 UI 传播。
   */
  const handleRebuild = async (
    request?: FileIndexRebuildRequest
  ): Promise<FileIndexRebuildResult> => {
    try {
      devLog('[FileIndexMonitor] Triggering manual index rebuild...')
      const result = await settingsSdk.fileIndex.rebuild(request)

      if (result?.requiresConfirm) {
        devLog('[FileIndexMonitor] Rebuild requires confirmation before proceeding')
        return result
      }
      if (result?.success) {
        devLog('[FileIndexMonitor] Rebuild triggered successfully')
        return result
      }
      fileIndexMonitorLog.warn('Rebuild failed', {
        errorCode: result?.errorCode ?? null,
        reportId: result?.reportId ?? null
      })
      return result ?? { success: false, errorCode: 'FILE_INDEX_REBUILD_FAILED' }
    } catch {
      fileIndexMonitorLog.error('Failed to trigger rebuild', { operation: 'rebuild' })
      return { success: false, errorCode: 'FILE_INDEX_REBUILD_TRANSPORT_FAILED' }
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
        onError: () => {
          fileIndexMonitorLog.error('Progress stream error', { operation: 'streamProgress' })
        }
      })
      .then((stream) => {
        if (cancelled) {
          stream.cancel()
          return
        }
        controller = stream
      })
      .catch(() => {
        fileIndexMonitorLog.error('Failed to start progress stream', {
          operation: 'streamProgress'
        })
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
    getFailedFiles,
    handleRebuild,
    onProgressUpdate,
    indexProgress
  }
}
