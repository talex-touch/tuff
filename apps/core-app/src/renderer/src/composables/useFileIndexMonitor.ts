import { touchChannel } from '~/modules/channel/channel-core'

/**
 * 文件索引监控 Composable
 * 提供索引状态查询和手动重建功能
 */
export function useFileIndexMonitor() {
  const channel = touchChannel
  
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
  
  return {
    getIndexStatus,
    handleRebuild
  }
}
