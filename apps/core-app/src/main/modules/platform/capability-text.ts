import type { PlatformCapability } from '@talex-touch/utils'
import { t } from '../../utils/i18n-helper'

/**
 * The capabilities the app defines, by their entry under
 * `settings.settingPlatformCapabilities.items`, which names and describes them.
 */
const CAPABILITY_TEXT_KEYS: Record<string, string> = {
  'platform.permission-center': 'permissionCenter',
  'platform.storage': 'storage',
  'platform.download-center': 'downloadCenter',
  'platform.temp-file': 'tempFile',
  'platform.flow-transfer': 'flowTransfer',
  'platform.division-box': 'divisionBox',
  'platform.intelligence-agents': 'intelligenceAgents',
  'platform.tuff-cli': 'tuffCli',
  'platform.active-app': 'activeApp',
  'platform.selection-capture': 'selectionCapture',
  'platform.auto-paste': 'autoPaste',
  'platform.native-share': 'nativeShare',
  'platform.terminal': 'terminal',
  'platform.permission-deep-link': 'permissionDeepLink',
  'platform.everything-search': 'everythingSearch'
}

/** Reasons that come with a capability's definition rather than from a runtime probe. */
const DEFINED_ISSUE_KEYS: Record<string, { reason: string; limitations: string[] }> = {
  TARGET_HANDLER_REQUIRED: {
    reason: 'settings.settingPlatformCapabilities.items.flowTransfer.handlerRequired',
    limitations: ['settings.settingPlatformCapabilities.items.flowTransfer.unhandledRejected']
  }
}

/**
 * A capability in the interface language, read each time the list is built so that a language
 * switch applies to the next list. The definitions keep their English, which a capability missing
 * from the table shows as it is. A runtime probe words its own reasons when it runs.
 */
export function localizePlatformCapability(capability: PlatformCapability): PlatformCapability {
  const key: string | undefined = CAPABILITY_TEXT_KEYS[capability.id]
  const issue = capability.issueCode ? DEFINED_ISSUE_KEYS[capability.issueCode] : undefined
  if (!key && !issue) return capability

  return {
    ...capability,
    ...(key
      ? {
          name: t(`settings.settingPlatformCapabilities.items.${key}.name`),
          description: t(`settings.settingPlatformCapabilities.items.${key}.description`)
        }
      : {}),
    ...(issue
      ? {
          reason: t(issue.reason),
          limitations: issue.limitations.map((limitation) => t(limitation))
        }
      : {})
  }
}
