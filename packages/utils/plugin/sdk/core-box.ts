import type { IPluginRendererChannel } from './types'

const ensurePluginContext = (): { channel: IPluginRendererChannel; pluginName: string } => {
  const plugin = (window as any)?.$plugin
  if (!plugin?.name) {
    throw new Error('[TouchSDK] Unable to resolve plugin name inside renderer context.')
  }

  const channel = (window as any)?.$channel as IPluginRendererChannel | undefined
  if (!channel) {
    throw new Error('[TouchSDK] Channel bridge is not available for the current plugin renderer.')
  }

  return {
    channel,
    pluginName: plugin.name as string
  }
}

/**
 * Clears all CoreBox items associated with the current plugin.
 */
export async function clearCoreBoxItems(): Promise<void> {
  const { channel, pluginName } = ensurePluginContext()
  await channel.send('core-box:clear-items', { pluginName })
}

