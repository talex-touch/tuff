import { createPluginTuffTransport } from '../../transport'
import { CoreBoxEvents } from '../../transport/events'
import { useChannel } from './channel'
import { usePluginName } from './plugin-info'

function ensurePluginContext(): { channel: ReturnType<typeof useChannel>, pluginName: string } {
  const pluginName = usePluginName('[TouchSDK] Unable to resolve plugin name inside renderer context.')
  const channel = useChannel('[TouchSDK] Channel bridge is not available for the current plugin renderer.')

  return { channel, pluginName }
}

/**
 * Clears all CoreBox items associated with the current plugin.
 */
export async function clearCoreBoxItems(): Promise<void> {
  const { channel, pluginName } = ensurePluginContext()
  const transport = createPluginTuffTransport(channel as any)
  await transport.send(CoreBoxEvents.item.clear, { pluginName })
}
