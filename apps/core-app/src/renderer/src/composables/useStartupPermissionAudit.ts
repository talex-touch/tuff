import { useTuffTransport } from '@talex-touch/utils/transport'
import { StorageEvents } from '@talex-touch/utils/transport/events'
import { appSettings } from '@talex-touch/utils/renderer/storage'
import { StorageList } from '@talex-touch/utils'
import { toast } from 'vue-sonner'
import { useI18n } from 'vue-i18n'
import { toRaw } from 'vue'
import { appSetting } from '~/modules/storage/app-storage'
import {
  createRequiredFileAccessRootKey,
  resolveRequiredFileAccessStatus,
  summarizeRequiredFileAccessStatus,
  systemPermissionFileAccessRoots
} from '~/modules/system/system-permission-roots'
import { useStartupInfo } from '~/modules/hooks/useStartupInfo'
import { createRendererLogger } from '~/utils/renderer-log'

const STARTUP_PERMISSION_AUDIT_DELAY_MS = 6500

const startupPermissionAuditLog = createRendererLogger('StartupPermissionAudit')
let auditStarted = false

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function useStartupPermissionAudit() {
  const transport = useTuffTransport()
  const { t } = useI18n()
  const { startupInfo, ensureStartupInfo } = useStartupInfo()

  async function runAudit(): Promise<void> {
    if (auditStarted) return
    auditStarted = true

    await appSettings.whenHydrated()
    await delay(STARTUP_PERMISSION_AUDIT_DELAY_MS)
    const auditStartupInfo = await ensureStartupInfo().catch(() => startupInfo.value)

    const missing: string[] = []

    try {
      const roots = await transport.send(systemPermissionFileAccessRoots)
      const rootResults = Array.isArray(roots) ? roots : []
      const fileAccessRootKey = createRequiredFileAccessRootKey(rootResults)
      const probedFileAccessStatus = summarizeRequiredFileAccessStatus(rootResults)
      const fileAccessStatus = resolveRequiredFileAccessStatus(
        rootResults,
        appSetting.setup?.fileAccess === true,
        appSetting.setup?.fileAccessRootKey ?? ''
      )
      if (fileAccessStatus !== 'granted') {
        missing.push(t('setupPermissions.fileAccess'))
      }
      if (probedFileAccessStatus === 'granted' && appSetting.setup) {
        appSetting.setup.fileAccess = true
        appSetting.setup.fileAccessRootKey = fileAccessRootKey
      } else if (probedFileAccessStatus === 'denied' && appSetting.setup) {
        appSetting.setup.fileAccess = false
        appSetting.setup.fileAccessRootKey = ''
      }

      // Accessibility, notifications, microphone and admin privileges are requested
      // just-in-time by the features that use them. Auditing them here would nag about
      // permissions the user was never asked for during onboarding.

      appSetting.setup = {
        ...(appSetting.setup ?? {}),
        lastPermissionAudit: {
          at: Date.now(),
          version: auditStartupInfo?.version ?? '',
          appUpdate: Boolean(auditStartupInfo?.appUpdate),
          missing
        }
      }

      await transport.send(StorageEvents.app.save, {
        key: StorageList.APP_SETTING,
        value: toRaw(appSetting),
        clear: false
      })

      if (missing.length > 0 && appSetting?.beginner?.init) {
        toast.warning(
          t('setupPermissions.startupAuditMissing', { permissions: missing.join(', ') })
        )
      }
    } catch (error) {
      startupPermissionAuditLog.warn('Startup permission audit failed', error)
    }
  }

  return {
    runAudit
  }
}
