/**
 * Permission Startup Handler
 *
 * Handles permission confirmation requests when plugins are enabled.
 */

import type { PermissionStartupRequestPayload } from '@talex-touch/utils/transport/events/types'
import { usePermissionSdk } from '@talex-touch/utils/renderer'
import { onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  PERMISSION_REQUEST_TIMEOUT_MS,
  showPermissionRequestCard
} from '~/modules/permission/permission-request-card'

type PermissionStartupRequest = PermissionStartupRequestPayload

export function usePermissionStartup() {
  const pendingRequests = ref<PermissionStartupRequest[]>([])
  const permissionSdk = usePermissionSdk()
  const { t } = useI18n()
  let unregister: (() => void) | null = null

  const handlePermissionRequest = async (request: PermissionStartupRequest) => {
    // Skip if no required permissions
    if (!request.required || request.required.length === 0) return

    const { result } = showPermissionRequestCard({
      title: t('plugin.permissions.startup.title'),
      message: t('plugin.permissions.startup.requestMessage', { name: request.pluginName }),
      permissions: request.required.map((permissionId) => ({
        id: permissionId,
        reason: request.reasons?.[permissionId]
      })),
      timeoutText: t('plugin.permissions.startup.timeout', {
        seconds: Math.floor(PERMISSION_REQUEST_TIMEOUT_MS / 1000)
      }),
      timeoutMs: PERMISSION_REQUEST_TIMEOUT_MS,
      actionLabels: {
        deny: t('plugin.permissions.startup.actions.deny'),
        session: t('plugin.permissions.startup.actions.session'),
        always: t('plugin.permissions.startup.actions.always')
      },
      t,
      onDismiss: () => 'deny'
    })

    const userChoice = await result

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
