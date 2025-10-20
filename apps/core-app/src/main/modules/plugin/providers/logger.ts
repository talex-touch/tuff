import { PluginProviderType } from '@talex-touch/utils/plugin/providers'
import { createLogger } from '../../../utils/logger'

const providersLog = createLogger('PluginProviders')

export const providerRegistryLog = providersLog.child('Registry')

export function createProviderLogger(namespace: string | PluginProviderType) {
  return providersLog.child(String(namespace))
}

export { providersLog }
