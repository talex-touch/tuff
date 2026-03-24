import type { IPluginManager } from '@talex-touch/utils/plugin'
import type { ITuffTransportMain } from '@talex-touch/utils/transport/main'
import type { PluginInstallQueue } from '../install-queue'
import type { DevServerHealthMonitor } from '../dev-server-monitor'

type IPluginManagerWithInternals = IPluginManager & {
  __installQueue?: PluginInstallQueue
  healthMonitor?: DevServerHealthMonitor
}

export interface BuildPluginManagerRuntimeOptions {
  pluginRootDir: string
  channel: {
    broadcastPlugin: (pluginName: string, eventName: string, arg?: unknown) => void
  }
  transport: ITuffTransportMain
  mainWindowId: number
  createManager: (
    pluginRootDir: string,
    transport: ITuffTransportMain,
    channel: { broadcastPlugin: (pluginName: string, eventName: string, arg?: unknown) => void },
    mainWindowId: number
  ) => IPluginManagerWithInternals
  createHealthMonitor: (manager: IPluginManager) => DevServerHealthMonitor
}

export function buildPluginManagerRuntime(options: BuildPluginManagerRuntimeOptions): {
  pluginManager: IPluginManagerWithInternals
  installQueue: PluginInstallQueue | undefined
  healthMonitor: DevServerHealthMonitor
} {
  const pluginManager = options.createManager(
    options.pluginRootDir,
    options.transport,
    options.channel,
    options.mainWindowId
  )
  const installQueue = pluginManager.__installQueue
  const healthMonitor = options.createHealthMonitor(pluginManager)
  pluginManager.healthMonitor = healthMonitor

  return {
    pluginManager,
    installQueue,
    healthMonitor
  }
}
