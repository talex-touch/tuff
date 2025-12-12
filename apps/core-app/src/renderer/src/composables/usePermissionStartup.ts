/**
 * Permission Startup Handler
 *
 * Handles permission confirmation requests when plugins are enabled.
 */

import { ref, onMounted, onUnmounted } from 'vue'
import { ElMessageBox } from 'element-plus'
import { touchChannel } from '~/modules/channel/channel-core'

interface PermissionStartupRequest {
  pluginId: string
  pluginName: string
  sdkapi?: number
  required: string[]
  optional: string[]
  reasons: Record<string, string>
}

// Permission name translations
const permissionNames: Record<string, string> = {
  'fs.read': '读取文件',
  'fs.write': '写入文件',
  'fs.execute': '执行文件',
  'clipboard.read': '读取剪贴板',
  'clipboard.write': '写入剪贴板',
  'network.local': '本地网络',
  'network.internet': '互联网访问',
  'network.download': '下载文件',
  'system.shell': '执行命令',
  'system.notification': '系统通知',
  'system.tray': '托盘交互',
  'ai.basic': '基础 AI',
  'ai.advanced': '高级 AI',
  'ai.agents': '智能体',
  'storage.plugin': '插件存储',
  'storage.shared': '共享存储',
  'window.create': '创建窗口',
  'window.capture': '屏幕截图',
}

export function usePermissionStartup() {
  const pendingRequests = ref<PermissionStartupRequest[]>([])
  let unregister: (() => void) | null = null

  const handlePermissionRequest = async (request: PermissionStartupRequest) => {
    // Skip if no required permissions
    if (!request.required || request.required.length === 0) return

    // Build permission list text
    const permList = request.required.map(p => {
      const name = permissionNames[p] || p
      const reason = request.reasons[p]
      return reason ? `• ${name}：${reason}` : `• ${name}`
    }).join('\n')

    try {
      await ElMessageBox.confirm(
        `插件「${request.pluginName}」需要以下权限：\n\n${permList}\n\n授予权限后插件可正常使用这些功能。您也可以稍后在插件详情中管理权限。`,
        '权限请求',
        {
          confirmButtonText: '授予权限',
          cancelButtonText: '稍后再说',
          type: 'info',
          distinguishCancelAndClose: true,
        }
      )

      // User confirmed - grant all required permissions
      await touchChannel.send('permission:grant-multiple', {
        pluginId: request.pluginId,
        permissionIds: request.required,
        grantedBy: 'user',
      })

      console.log(`[PermissionStartup] Granted permissions for ${request.pluginId}`)
    } catch (action) {
      // User cancelled or closed - that's fine, permissions can be granted later
      if (action === 'cancel') {
        console.log(`[PermissionStartup] User deferred permission grant for ${request.pluginId}`)
      }
    }
  }

  const setupListener = () => {
    if (!touchChannel.regChannel) return

    unregister = touchChannel.regChannel('permission:startup-request', (data) => {
      const request = data as unknown as PermissionStartupRequest
      console.log('[PermissionStartup] Received permission request:', request)
      handlePermissionRequest(request)
    })
  }

  onMounted(() => {
    setupListener()
  })

  onUnmounted(() => {
    if (unregister) {
      unregister()
    }
  })

  return {
    pendingRequests,
  }
}
