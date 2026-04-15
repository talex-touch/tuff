import type { ModuleInitContext } from '@talex-touch/utils'
import type { ITuffTransportMain } from '@talex-touch/utils/transport/main'
import type { TalexEvents } from '../../../core/eventbus/touch-event'
import { resolveMainRuntime } from '../../../core/runtime-accessor'

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
  const runtime = resolveMainRuntime(ctx, 'PluginModule.onInit')
  const channel = runtime.channel as PluginLifecycleChannel

  const mainWindowId = (ctx.app as { window?: { window?: { id?: unknown } } } | null | undefined)
    ?.window?.window?.id
  if (typeof mainWindowId !== 'number') {
    throw new TypeError('[PluginModule] Main window id is not available')
  }

  return {
    channel,
    transport: runtime.transport,
    mainWindowId
  }
}
