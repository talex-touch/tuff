import type { AppSetting } from '@talex-touch/utils/common/storage/entity/app-settings'
import type { IntelligenceProviderConfig } from '@talex-touch/tuff-intelligence'
import { StorageList } from '@talex-touch/utils/common/storage/constants'
import { getMainConfig } from '../storage'
import { CustomProvider } from './providers/custom-provider'
import { LocalProvider } from './providers/local-provider'
import { isNexusProviderConfig, NexusProvider } from './providers/nexus-provider'
import { PiCliProvider } from './providers/pi-cli-provider'
import { isCliAgentProviderConfig } from './providers/pi-cli-runtime'
import type { IntelligenceProvider } from './runtime/base-provider'

export function createCustomProvider(config: IntelligenceProviderConfig): IntelligenceProvider {
  return isNexusProviderConfig(config) ? new NexusProvider(config) : new CustomProvider(config)
}

/**
 * Both local backends register under `IntelligenceProviderType.LOCAL`, so the concrete class is
 * picked by config identity — the same way `createCustomProvider` chooses between Nexus and Custom.
 * A dedicated provider type would mean changing the `@talex-touch/tuff-intelligence` enum and every
 * exhaustive list built from it.
 */
/** The `localAiCli.enabled` master switch, read on each call so a change applies without a restart. */
function localAiCliMasterSwitchOn(): boolean {
  const settings = getMainConfig(StorageList.APP_SETTING) as AppSetting | undefined
  return settings?.localAiCli?.enabled === true
}

export function createLocalProvider(config: IntelligenceProviderConfig): IntelligenceProvider {
  return isCliAgentProviderConfig(config)
    ? new PiCliProvider(config, localAiCliMasterSwitchOn)
    : new LocalProvider(config)
}
