/**
 * Sentry Renderer Process Integration
 *
 * Handles error reporting and analytics in the renderer process
 */

import * as Sentry from '@sentry/electron/renderer'
import { isDevEnv } from '@talex-touch/utils/env'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { SentryEvents } from '@talex-touch/utils/transport/events'
import { getBuildInfo } from '../../utils/build-info'

// Initialize Sentry in renderer process
let isInitialized = false
const transport = useTuffTransport()

/**
 * Initialize Sentry in renderer process
 */
export async function initSentryRenderer(): Promise<void> {
  if (isInitialized) {
    return
  }

  // Skip Sentry in development mode to avoid CSP warnings
  if (isDevEnv()) {
    console.debug('[SentryRenderer] Sentry disabled in development mode')
    return
  }

  try {
    // Check if Sentry is enabled
    const config = (await transport.send(SentryEvents.api.getConfig)) as {
      enabled?: boolean
      anonymous?: boolean
    }

    if (!config?.enabled) {
      console.debug('[SentryRenderer] Sentry is disabled')
      return
    }

    const buildInfo = getBuildInfo()
    const buildType = process.env.BUILD_TYPE || (buildInfo.isRelease ? 'release' : 'dev')
    const channel = buildInfo.isRelease ? 'release' : buildType

    Sentry.init({
      dsn: 'https://f8019096132f03a7a66c879a53462a67@o4508024637620224.ingest.us.sentry.io/4510196503871488',
      environment: buildType,
      release: `${buildInfo.version}@${buildType}`,
      tracesSampleRate: 1.0,
      beforeSend(event) {
        // Always include environment context
        event.contexts = {
          ...event.contexts,
          environment: {
            version: buildInfo.version,
            buildType: buildInfo.buildType,
            channel,
            platform: process.platform,
            userAgent: navigator.userAgent
          }
        }
        return event
      }
    })

    // Set environment context
    Sentry.setContext('environment', {
      version: buildInfo.version,
      buildType: buildInfo.buildType,
      channel,
      platform: process.platform,
      userAgent: navigator.userAgent
    })

    // Listen for user context updates
    watchUserContext()

    isInitialized = true
    console.debug('[SentryRenderer] Sentry initialized')
  } catch (error) {
    console.warn('[SentryRenderer] Failed to initialize Sentry', error)
  }
}

/**
 * Watch for user context changes from auth module
 */
function watchUserContext(): void {
  // Also update user context from current auth state if available
  void (async () => {
    try {
      const { useAuthState } = await import('@talex-touch/utils/renderer')
      const { authState } = useAuthState()
      if (authState.user) {
        updateUserContext(authState.user)
      }
    } catch {
      // Auth module not available
    }
  })()
}

/**
 * Update user context (called from auth module)
 */
export function updateSentryUserContext(user: { id?: string; username?: string } | null): void {
  updateUserContext(user)
}

/**
 * Update user context in Sentry
 */
function updateUserContext(user: { id?: string; username?: string } | null): void {
  if (!isInitialized) {
    return
  }

  // Check if anonymous mode is enabled
  void (async () => {
    try {
      const config = (await transport.send(SentryEvents.api.getConfig)) as {
        anonymous?: boolean
      }

      if (config?.anonymous) {
        // Anonymous mode: no user ID
        Sentry.setUser(null)
        return
      }

      // Non-anonymous mode
      if (user && user.id) {
        Sentry.setUser({
          id: user.id,
          username: user.username || undefined,
          email: undefined // Never send email
        })
      } else {
        Sentry.setUser(null)
      }
    } catch (error) {
      console.debug('[SentryRenderer] Failed to update user context', error)
    }
  })()
}

/**
 * Capture exception in renderer process
 */
export function captureException(error: Error, context?: Record<string, unknown>): void {
  if (!isInitialized) {
    return
  }

  Sentry.withScope((scope) => {
    if (context) {
      scope.setContext('extra', context)
    }
    const buildInfo = getBuildInfo()
    scope.setContext('environment', {
      version: buildInfo.version,
      buildType: buildInfo.buildType,
      platform: process.platform
    })
    Sentry.captureException(error)
  })
}

/**
 * Capture message in renderer process
 */
export function captureMessage(
  message: string,
  level: Sentry.SeverityLevel = 'info',
  context?: Record<string, unknown>
): void {
  if (!isInitialized) {
    return
  }

  Sentry.withScope((scope) => {
    scope.setLevel(level)
    if (context) {
      scope.setContext('extra', context)
    }
    const buildInfo = getBuildInfo()
    scope.setContext('environment', {
      version: buildInfo.version,
      buildType: buildInfo.buildType,
      platform: process.platform
    })
    Sentry.captureMessage(message)
  })
}
