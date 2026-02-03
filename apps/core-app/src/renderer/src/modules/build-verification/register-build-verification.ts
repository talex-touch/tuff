import { isDevEnv } from '@talex-touch/utils/env'
import type { ITuffTransport } from '@talex-touch/utils/transport'
import type { BuildVerificationStatus } from '@talex-touch/utils/transport/events/types'
import { AppEvents } from '@talex-touch/utils/transport/events'
import { createNotificationSdk } from '@talex-touch/utils/transport/sdk/domains/notification'
import { useI18nText } from '~/modules/lang'

const buildVerificationStatusEvent = AppEvents.build.statusUpdated

let listenerRegistered = false
let notifiedOnce = false

const resolveI18nText = (key: string, fallback: string): string => {
  const { t } = useI18nText((fallbackKey) => (fallbackKey === key ? fallback : fallbackKey))
  const value = t(key)
  return value === key ? fallback : value
}

export function registerBuildVerificationListener(transport: ITuffTransport): () => void {
  if (listenerRegistered) {
    return () => void 0
  }
  listenerRegistered = true

  const notificationSdk = createNotificationSdk(transport)

  const cleanup = transport.on(buildVerificationStatusEvent, (payload) => {
    if (!payload || typeof payload !== 'object') return
    const status = payload as BuildVerificationStatus
    if (!status.verificationFailed || isDevEnv()) return
    if (notifiedOnce) return
    notifiedOnce = true

    void notificationSdk
      .notify({
        channel: 'system',
        level: 'warning',
        title: resolveI18nText(
          'buildSecurity.title.verificationFailed',
          'Build Verification Failed'
        ),
        message: resolveI18nText(
          'buildSecurity.description.verificationFailed',
          'This build failed integrity verification. Please reinstall from the official source.'
        ),
        dedupeKey: 'build-verification-failed',
        app: { presentation: 'toast', duration: 10000 }
      })
      .catch(() => {})
  })

  return () => {
    cleanup()
    listenerRegistered = false
  }
}
