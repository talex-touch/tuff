import type { ITuffTransport } from '@talex-touch/utils/transport'
import type { Router } from 'vue-router'
import { PluginEvents } from '@talex-touch/utils/transport/events'
import { createNotificationSdk } from '@talex-touch/utils/transport/sdk/domains/notification'
import { useI18nText } from '~/modules/lang/useI18nText'

let registered = false

function formatTemplate(template: string, params?: Record<string, unknown>): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const value = params[key]
    return value === undefined ? match : String(value)
  })
}

function resolveI18nText(key: string, fallback: string, params?: Record<string, unknown>): string {
  const { t } = useI18nText()
  const value = t(key, params)
  if (value === key) {
    return formatTemplate(fallback, params)
  }
  return value
}

export function registerPluginInstallListener(transport: ITuffTransport, router: Router): void {
  if (registered) return
  registered = true

  const notificationSdk = createNotificationSdk(transport)

  transport.on(PluginEvents.install.completed, async (payload) => {
    const rawName = typeof payload?.name === 'string' ? payload.name.trim() : ''
    const displayName = rawName || resolveI18nText('notifications.pluginInstallUnknown', 'Plugin')
    const status = payload?.status ?? 'success'

    let title = ''
    let message = ''
    let level: 'success' | 'warning' | 'error' = 'success'

    if (status === 'exists') {
      title = resolveI18nText('notifications.pluginInstallExistsTitle', 'Plugin already added', {
        name: displayName
      })
      message = resolveI18nText(
        'notifications.pluginInstallExistsBody',
        'Plugin {name} already exists. Opened details for you.',
        { name: displayName }
      )
      level = 'warning'
    } else if (status === 'error') {
      const error = typeof payload?.error === 'string' ? payload.error.trim() : ''
      title = resolveI18nText('notifications.pluginInstallFailedTitle', 'Plugin install failed', {
        name: displayName
      })
      message = error
        ? resolveI18nText(
            'notifications.pluginInstallFailedBodyWithReason',
            'Failed to add {name}: {error}.',
            { name: displayName, error }
          )
        : resolveI18nText('notifications.pluginInstallFailedBody', 'Failed to add {name}.', {
            name: displayName
          })
      level = 'error'
    } else {
      title = resolveI18nText('notifications.pluginInstallSuccessTitle', 'Plugin added', {
        name: displayName
      })
      message = resolveI18nText(
        'notifications.pluginInstallSuccessBody',
        'Added {name} to your plugin list.',
        { name: displayName }
      )
      level = 'success'
    }

    await notificationSdk.notify({
      channel: 'system',
      level,
      title,
      message
    })

    if (status !== 'error' && rawName) {
      router.push(`/plugin/${encodeURIComponent(rawName)}`).catch(() => {})
    }
  })
}
