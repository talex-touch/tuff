/**
 * Permission Startup Handler
 *
 * Handles permission confirmation requests when plugins are enabled.
 */

import type { PermissionStartupRequestPayload } from '@talex-touch/utils/transport/events/types'
import { usePermissionSdk } from '@talex-touch/utils/renderer'
import type { ElMessageBoxOptions } from 'element-plus'
import { ElButton, ElMessageBox } from 'element-plus'
import { h, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

type PermissionStartupRequest = PermissionStartupRequestPayload

const PERMISSION_TIMEOUT_MS = 30_000

export function usePermissionStartup() {
  const pendingRequests = ref<PermissionStartupRequest[]>([])
  const permissionSdk = usePermissionSdk()
  const { t } = useI18n()
  let unregister: (() => void) | null = null

  const handlePermissionRequest = async (request: PermissionStartupRequest) => {
    // Skip if no required permissions
    if (!request.required || request.required.length === 0) return

    // Build permission list text
    const permList = request.required
      .map((permissionId) => {
        const nameKey = `plugin.permissions.registry.${permissionId}.name`
        const translatedName = t(nameKey)
        const name = translatedName === nameKey ? permissionId : translatedName
        const reason = request.reasons?.[permissionId]
        return reason
          ? t('plugin.permissions.startup.permissionItemWithReason', { name, reason })
          : t('plugin.permissions.startup.permissionItem', { name })
      })
      .join('\n')

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

      timeoutId = setTimeout(() => finish('deny'), PERMISSION_TIMEOUT_MS)

      const options: ElMessageBoxOptions = {
        title: t('plugin.permissions.startup.title'),
        message: h('div', { style: 'white-space: pre-wrap' }, [
          h('p', {}, t('plugin.permissions.startup.requestMessage', { name: request.pluginName })),
          h(
            'pre',
            {
              style:
                'background: var(--el-fill-color); padding: 8px; border-radius: 4px; margin: 8px 0'
            },
            permList
          ),
          h(
            'p',
            {
              style: 'color: var(--el-text-color-secondary); font-size: 12px; margin-top: 12px'
            },
            t('plugin.permissions.startup.timeout', {
              seconds: Math.floor(PERMISSION_TIMEOUT_MS / 1000)
            })
          ),
          h(
            'div',
            {
              style: 'display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px'
            },
            [
              h(ElButton, { onClick: () => finish('deny') }, () =>
                t('plugin.permissions.startup.actions.deny')
              ),
              h(ElButton, { onClick: () => finish('session') }, () =>
                t('plugin.permissions.startup.actions.session')
              ),
              h(ElButton, { type: 'primary', onClick: () => finish('always') }, () =>
                t('plugin.permissions.startup.actions.always')
              )
            ]
          )
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
        }
      }
      ElMessageBox(options).catch(() => {
        finish('deny')
      })
    })

    // Handle user choice
    switch (userChoice) {
      case 'always':
        await permissionSdk.grantMultiple({
          pluginId: request.pluginId,
          permissionIds: request.required,
          grantedBy: 'user'
        })
        break

      case 'session':
        await permissionSdk.grantSession({
          pluginId: request.pluginId,
          permissionIds: request.required
        })
        break

      case 'deny':
      default:
        break
    }
  }

  const setupListener = () => {
    unregister = permissionSdk.onStartupRequest((request) => {
      handlePermissionRequest(request as PermissionStartupRequest)
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
    pendingRequests
  }
}
