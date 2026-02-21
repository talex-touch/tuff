/**
 * Permission Startup Handler
 *
 * Handles permission confirmation requests when plugins are enabled.
 */

import type { PermissionStartupRequestPayload } from '@talex-touch/utils/transport/events/types'
import { usePermissionSdk } from '@talex-touch/utils/renderer'
import { onMounted, onUnmounted, ref } from 'vue'
import { toast } from 'vue-sonner'
import { useI18n } from 'vue-i18n'
import { showSonnerDialog } from '~/modules/notification/sonner-dialog'

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

    const message = [
      t('plugin.permissions.startup.requestMessage', { name: request.pluginName }),
      '',
      permList,
      '',
      t('plugin.permissions.startup.timeout', {
        seconds: Math.floor(PERMISSION_TIMEOUT_MS / 1000)
      })
    ].join('\n')

    const { id, result } = showSonnerDialog<'always' | 'session' | 'deny'>({
      title: t('plugin.permissions.startup.title'),
      message,
      actions: [
        {
          value: 'deny',
          label: t('plugin.permissions.startup.actions.deny'),
          type: 'danger'
        },
        {
          value: 'session',
          label: t('plugin.permissions.startup.actions.session')
        },
        {
          value: 'always',
          label: t('plugin.permissions.startup.actions.always'),
          type: 'primary'
        }
      ],
      onDismiss: () => 'deny'
    })

    const timeoutId = setTimeout(() => {
      toast.dismiss(id)
    }, PERMISSION_TIMEOUT_MS)

    const userChoice = await result
    clearTimeout(timeoutId)

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
