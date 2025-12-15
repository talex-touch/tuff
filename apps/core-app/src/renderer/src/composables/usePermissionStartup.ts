/**
 * Permission Startup Handler
 *
 * Handles permission confirmation requests when plugins are enabled.
 */

import { ref, onMounted, onUnmounted, h } from 'vue'
import { ElMessageBox, ElButton } from 'element-plus'
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

const PERMISSION_TIMEOUT_MS = 30_000

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

    const userChoice = await new Promise<'always' | 'session' | 'deny'>((resolve) => {
      let timeoutId: ReturnType<typeof setTimeout> | null = null
      let resolved = false

      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId)
      }

      const finish = (choice: 'always' | 'session' | 'deny') => {
        if (resolved) return
        resolved = true
        cleanup()
        ElMessageBox.close()
        resolve(choice)
      }

      timeoutId = setTimeout(() => {
        console.log(`[PermissionStartup] Auto-rejected due to timeout for ${request.pluginId}`)
        finish('deny')
      }, PERMISSION_TIMEOUT_MS)

      ElMessageBox({
        title: '权限请求',
        message: h('div', { style: 'white-space: pre-wrap' }, [
          h('p', {}, `插件「${request.pluginName}」请求以下权限：`),
          h(
            'pre',
            {
              style:
                'background: var(--el-fill-color); padding: 8px; border-radius: 4px; margin: 8px 0',
            },
            permList,
          ),
          h(
            'p',
            {
              style:
                'color: var(--el-text-color-secondary); font-size: 12px; margin-top: 12px',
            },
            `⏱ 如无操作，将在 ${Math.floor(PERMISSION_TIMEOUT_MS / 1000)} 秒后自动拒绝`,
          ),
          h(
            'div',
            {
              style:
                'display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px',
            },
            [
              h(ElButton, { onClick: () => finish('deny') }, () => '拒绝'),
              h(ElButton, { onClick: () => finish('session') }, () => '仅本次允许'),
              h(ElButton, { type: 'primary', onClick: () => finish('always') }, () => '始终允许'),
            ],
          ),
        ]),
        showConfirmButton: false,
        showCancelButton: false,
        closeOnClickModal: false,
        closeOnPressEscape: false,
        showClose: false,
        type: 'warning',
        beforeClose: (_action, _instance, done) => {
          finish('deny')
          done()
        },
      } as any).catch(() => {
        finish('deny')
      })
    })

    // Handle user choice
    switch (userChoice) {
      case 'always':
        await touchChannel.send('permission:grant-multiple', {
          pluginId: request.pluginId,
          permissionIds: request.required,
          grantedBy: 'user',
        })
        console.log(`[PermissionStartup] Permanently granted permissions for ${request.pluginId}`)
        break

      case 'session':
        await touchChannel.send('permission:grant-session', {
          pluginId: request.pluginId,
          permissionIds: request.required,
        })
        console.log(`[PermissionStartup] Session-granted permissions for ${request.pluginId}`)
        break

      case 'deny':
      default:
        console.log(`[PermissionStartup] Denied permissions for ${request.pluginId}`)
        break
    }
  }

  const setupListener = () => {
    if (!touchChannel.regChannel) return

    unregister = touchChannel.regChannel('permission:startup-request', (message) => {
      const request = (message as any).data as PermissionStartupRequest
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
