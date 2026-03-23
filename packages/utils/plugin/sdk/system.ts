import type { ActiveAppSnapshot } from './types'
import { createPluginTuffTransport } from '../../transport'
import { AppEvents } from '../../transport/events'
import { useChannel } from './channel'

function normalizeActiveAppSnapshot(value: unknown): ActiveAppSnapshot | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const raw = value as Record<string, unknown>
  return {
    identifier: typeof raw.identifier === 'string' ? raw.identifier : null,
    displayName: typeof raw.displayName === 'string' ? raw.displayName : null,
    bundleId: typeof raw.bundleId === 'string' ? raw.bundleId : null,
    processId: typeof raw.processId === 'number' ? raw.processId : null,
    executablePath: typeof raw.executablePath === 'string' ? raw.executablePath : null,
    platform:
      raw.platform === 'macos' || raw.platform === 'windows' || raw.platform === 'linux'
        ? raw.platform
        : null,
    windowTitle: typeof raw.windowTitle === 'string' ? raw.windowTitle : null,
    url: typeof raw.url === 'string' ? raw.url : null,
    icon: typeof raw.icon === 'string' ? raw.icon : null,
    lastUpdated: typeof raw.lastUpdated === 'number' ? raw.lastUpdated : Date.now(),
  }
}

export async function getActiveAppSnapshot(
  options: { forceRefresh?: boolean } = {},
): Promise<ActiveAppSnapshot | null> {
  const channel = useChannel(
    '[Plugin SDK] System channel requires plugin renderer context with $channel available.',
  )
  const forceRefresh = options.forceRefresh === true

  try {
    const transport = createPluginTuffTransport(channel as any)
    const typed = await transport.send(AppEvents.system.getActiveApp, { forceRefresh })
    return normalizeActiveAppSnapshot(typed)
  } catch {
    const legacy = await channel.send('system:get-active-app', { forceRefresh })
    return normalizeActiveAppSnapshot(legacy)
  }
}
