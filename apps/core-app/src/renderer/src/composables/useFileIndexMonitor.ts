import { ref } from 'vue'
import { touchChannel } from '~/modules/channel/channel-core'

/**
 * 文件索引监控 Composable
 * 提供索引状态查询和手动重建功能
 */
export function useFileIndexMonitor() {
  const channel = touchChannel
  
  const indexProgress = ref<any>(null)
  
  /**
   * 查询当前索引状态
   */
  const getIndexStatus = async () => {
    try {
      const status = await channel.send('file-index:status', {})
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
      const battery = await channel.send('file-index:battery-level', {})
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
      const stats = await channel.send('file-index:stats', {})
      return stats
    } catch (error: any) {
      // Ignore timeout errors during startup - module may not be ready yet
      if (error?.message?.includes('timed out')) {
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
  const handleRebuild = async () => {
    try {
      console.log('[FileIndexMonitor] Triggering manual index rebuild...')
      const result = await channel.send('file-index:rebuild', {})
      
      if (result?.success) {
        console.log('[FileIndexMonitor] Rebuild triggered successfully')
        return true
      } else {
        console.error('[FileIndexMonitor] Rebuild failed:', result?.error)
        throw new Error(result?.error || 'Rebuild failed')
      }
    } catch (error) {
      console.error('[FileIndexMonitor] Failed to trigger rebuild:', error)
      throw error
    }
  }
  
  /**
   * 订阅索引进度更新
   * 返回取消订阅的函数
   */
  const onProgressUpdate = (callback: (progress: any) => void) => {
    const handler = (data: any) => {
      indexProgress.value = data.data
      callback(data.data)
    }
    
    // 使用 regChannel 注册监听器,它会返回取消函数
    const unsubscribe = channel.regChannel('file-index:progress', handler)
    
    // 返回取消订阅函数
    return unsubscribe
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
