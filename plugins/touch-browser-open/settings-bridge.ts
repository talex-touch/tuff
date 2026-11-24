import { getLogger } from '../../packages/utils/common/logger'
import { createPluginTuffTransport } from '../../packages/utils/transport'
import { defineRawEvent } from '../../packages/utils/transport/event/builder'

export { communicateWithPlugin } from '../../packages/utils/plugin/sdk/common'
export { usePluginStorage } from '../../packages/utils/plugin/sdk/storage'
export { initializePluginTheme } from '../../packages/utils/plugin/theme'

const preloadLog = getLogger('plugin-preload')
const crashEvent = defineRawEvent<Record<string, string | number | boolean | undefined>, void>('crash')

interface TuffPluginWindow extends Window {
  $plugin?: {
    name?: string
    path?: object
    version?: string
    sdkapi?: number
  }
  $channel?: unknown
  $transport?: ReturnType<typeof createPluginTuffTransport>
  $crash?: (message: string, extraData?: Record<string, string | number | boolean | undefined>) => void
}

export function initTuff(targetWindow: Window): void {
  const win = targetWindow as TuffPluginWindow
  const plugin = win.$plugin
  if (!plugin)
    throw new Error('Plugin has a fatal error! Please check your plugin!')

  if (!win.$transport && win.$channel) {
    win.$transport = createPluginTuffTransport(win.$channel as any)
  }
  if (win.$transport) {
    win.addEventListener?.('beforeunload', () => {
      win.$transport?.destroy()
    }, { once: true })
  }

  win.$crash = function (message, extraData) {
    if (win.$transport) {
      void win.$transport.send(crashEvent, { message, ...extraData })
      return
    }
    const channel = win.$channel as { send?: (event: string, payload: unknown) => void } | undefined
    channel?.send?.('crash', { message, ...extraData })
  }

  preloadLog.info(`[Plugin] ${plugin.name ?? 'touch-browser-open'} loaded`)
}
