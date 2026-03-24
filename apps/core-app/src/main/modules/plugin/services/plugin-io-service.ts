import type { ModuleInitContext } from '@talex-touch/utils'
import type { ITuffTransportMain } from '@talex-touch/utils/transport/main'
import type { TalexEvents } from '../../../core/eventbus/touch-event'
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import { resolveRuntimeChannel } from '../../../core/deprecated-global-app'

type PluginLifecycleChannel = {
  broadcastPlugin: (pluginName: string, eventName: string, arg?: unknown) => void
}

export interface PluginModuleIoRuntime {
  channel: PluginLifecycleChannel
  transport: ITuffTransportMain
  mainWindowId: number
}

export function resolvePluginModuleIoRuntime(
  ctx: ModuleInitContext<TalexEvents>
): PluginModuleIoRuntime {
  const appChannel = (ctx.app as { channel?: unknown } | null | undefined)?.channel
  const channel = resolveRuntimeChannel(ctx.runtime?.channel, appChannel, 'PluginModule.onInit')
  if (!channel) {
    throw new Error('[PluginModule] TouchChannel not available on app context')
  }

  const mainWindowId = (ctx.app as { window?: { window?: { id?: unknown } } } | null | undefined)
    ?.window?.window?.id
  if (typeof mainWindowId !== 'number') {
    throw new TypeError('[PluginModule] Main window id is not available')
  }

  const keyManager = (channel as { keyManager?: unknown } | null | undefined)?.keyManager ?? channel
  const transport = getTuffTransportMain(channel, keyManager)
  if (!transport) {
    throw new Error('[PluginModule] Transport not available on channel context')
  }

  return {
    channel: channel as PluginLifecycleChannel,
    transport,
    mainWindowId
  }
}
