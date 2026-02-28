interface Destroyable {
  isDestroyed?: () => boolean
}

interface UserAgentReadable extends Destroyable {
  userAgent?: string
  getUserAgent?: () => string
}

interface WebContentsHost<T extends UserAgentReadable = UserAgentReadable> {
  webContents?: T | null
}

function readMaybeDestroyed<T>(reader: () => T): T | null {
  try {
    return reader()
  } catch {
    return null
  }
}

function readDestroyedState(target: Destroyable): boolean {
  if (typeof target.isDestroyed !== 'function') return false
  try {
    return target.isDestroyed()
  } catch {
    return true
  }
}

export function useAliveTarget<T extends Destroyable>(target?: T | null): T | null {
  if (!target) return null
  const destroyed = readDestroyedState(target)
  return destroyed ? null : target
}

export function useAliveWebContents<T extends UserAgentReadable>(
  host?: WebContentsHost<T> | T | null
): T | null {
  if (!host) return null
  const hasWebContents = typeof host === 'object' && 'webContents' in host
  if (hasWebContents) {
    const carrier = host as WebContentsHost<T>
    return useAliveTarget(carrier.webContents ?? null)
  }
  return useAliveTarget(host as T)
}

export function useSafeUserAgent(host?: WebContentsHost | UserAgentReadable | null): string | null {
  const webContents = useAliveWebContents(host)
  if (!webContents) return null

  const fromGetter = readMaybeDestroyed(() =>
    typeof webContents.getUserAgent === 'function' ? webContents.getUserAgent() : null
  )
  if (typeof fromGetter === 'string' && fromGetter.length > 0) {
    return fromGetter
  }

  const fromField = readMaybeDestroyed(() => webContents.userAgent)
  if (typeof fromField === 'string' && fromField.length > 0) {
    return fromField
  }
  return null
}
