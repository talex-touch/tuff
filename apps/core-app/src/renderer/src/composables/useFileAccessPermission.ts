import { useTuffTransport } from '@talex-touch/utils/transport'
import { StorageEvents } from '@talex-touch/utils/transport/events'
import { StorageList } from '@talex-touch/utils'
import { computed, ref, toRaw } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { appSetting } from '~/modules/storage/app-storage'
import {
  createRequiredFileAccessRootKey,
  type FileAccessRootCheckResult,
  resolveRequiredFileAccessStatus,
  summarizeRequiredFileAccessStatus,
  systemPermissionFileAccessRoots,
  systemPermissionRequestFileAccessRoots
} from '~/modules/system/system-permission-roots'
import type { SystemPermissionStatus } from '~/modules/system/system-permission-refresh'
import { createRendererLogger } from '~/utils/renderer-log'

/**
 * Module-level state: file access is a single piece of OS-owned state, so the onboarding step
 * and the settings page must observe the same value. Instantiating per-component would let the
 * two drift apart after a grant happens in one of them.
 */
const status = ref<SystemPermissionStatus>('notDetermined')
const roots = ref<FileAccessRootCheckResult[]>([])
const isChecking = ref(false)
const isRequesting = ref(false)
let checkInFlight = false

const fileAccessLog = createRendererLogger('FileAccessPermission')

export function useFileAccessPermission() {
  const transport = useTuffTransport()
  const { t } = useI18n()

  const isGranted = computed(() => status.value === 'granted')

  /** Only TCC-gated roots are actionable; the rest are readable without a prompt. */
  const requiredRoots = computed(() => roots.value.filter((root) => root.required))

  const requiredRootLabels = computed(() => requiredRoots.value.map((root) => resolveLabel(root)))

  function resolveLabel(root: FileAccessRootCheckResult): string {
    const key = `setupPermissions.fileAccessRoots.${root.id}`
    const translated = t(key)
    return translated === key ? root.label : translated
  }

  function apply(next: FileAccessRootCheckResult[]): void {
    const probedStatus = summarizeRequiredFileAccessStatus(next)
    const rootKey = createRequiredFileAccessRootKey(next)

    roots.value = next
    status.value = resolveRequiredFileAccessStatus(
      next,
      appSetting.setup?.fileAccess === true,
      appSetting.setup?.fileAccessRootKey ?? ''
    )

    if (!appSetting.setup) return

    if (probedStatus === 'granted') {
      appSetting.setup.fileAccess = true
      appSetting.setup.fileAccessRootKey = rootKey
    } else if (probedStatus === 'denied') {
      appSetting.setup.fileAccess = false
      appSetting.setup.fileAccessRootKey = ''
    }
  }

  async function persist(): Promise<void> {
    await transport.send(StorageEvents.app.save, {
      key: StorageList.APP_SETTING,
      value: toRaw(appSetting),
      clear: false
    })
  }

  async function check(options: { silent?: boolean } = {}): Promise<void> {
    if (checkInFlight) return
    checkInFlight = true

    if (!options.silent) {
      isChecking.value = true
    }

    try {
      const next = await transport.send(systemPermissionFileAccessRoots)
      apply(Array.isArray(next) ? next : [])
    } catch (error) {
      fileAccessLog.error('Failed to check file access', error)
      if (!options.silent) {
        toast.error(t('setupPermissions.checkFailed'))
      }
    } finally {
      checkInFlight = false
      if (!options.silent) {
        isChecking.value = false
      }
    }
  }

  /**
   * Grants in one shot. The main process reads each protected root, and that read is what makes
   * macOS raise its consent dialogs — TCC cannot be granted silently, so callers should surface a
   * "granting" state to explain the dialogs that are about to appear.
   */
  async function request(): Promise<void> {
    if (isRequesting.value) return
    isRequesting.value = true

    try {
      const next = await transport.send(systemPermissionRequestFileAccessRoots)
      apply(Array.isArray(next) ? next : [])
      await persist()

      if (!isGranted.value) {
        toast.info(t('setupPermissions.fileAccessPrompted'))
      }
    } catch (error) {
      fileAccessLog.error('Failed to request file access', error)
      toast.error(t('setupPermissions.requestFailed'))
    } finally {
      isRequesting.value = false
    }
  }

  return {
    status,
    roots,
    requiredRoots,
    requiredRootLabels,
    isChecking,
    isRequesting,
    isGranted,
    check,
    request
  }
}
