/**
 * Sentry Renderer Process Integration
 *
 * Handles error reporting and analytics in the renderer process
 */

import * as Sentry from '@sentry/electron/renderer'
import { isDevEnv } from '@talex-touch/utils/env'
import type { OperationalErrorReport } from '@talex-touch/utils'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { SentryEvents } from '@talex-touch/utils/transport/events'
import { getBuildInfo } from '../../utils/build-info'
import {
  getCurrentRendererPlatformState,
  getCurrentRendererUserAgent
} from '../platform/renderer-platform'
import { devLog } from '~/utils/dev-log'
import { createRendererLogger } from '~/utils/renderer-log'

// Initialize Sentry in renderer process
let isInitialized = false
const transport = useTuffTransport()
const sentryRendererLog = createRendererLogger('SentryRenderer')
const SAFE_EVENT_MESSAGE = 'redacted'
const SAFE_CONTEXT_KEY = /^[a-zA-Z0-9_.:-]{1,96}$/
const SENSITIVE_CONTEXT_KEY =
  /(query|text|keyword|path|file|folder|url|email|token|secret|password|credential|clipboard|content|prompt|response|html|image|screenshot|body|payload|stack|trace|request|headers|cookie|sql|params)/i

function sanitizeRendererContext(
  value: unknown,
  allowedKeys?: ReadonlySet<string>
): Record<string, string | number | boolean> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const output: Record<string, string | number | boolean> = {}
  for (const [key, raw] of Object.entries(value).slice(0, 24)) {
    if (allowedKeys && !allowedKeys.has(key)) continue
    if (!SAFE_CONTEXT_KEY.test(key) || SENSITIVE_CONTEXT_KEY.test(key)) continue
    if (typeof raw === 'boolean') output[key] = raw
    if (typeof raw === 'number' && Number.isFinite(raw)) output[key] = raw
    if (typeof raw === 'string' && SAFE_CONTEXT_KEY.test(raw)) output[key] = raw
  }
  return Object.keys(output).length > 0 ? output : undefined
}

function sanitizeRendererSentryEvent<T extends Sentry.Event>(event: T): T {
  delete event.request
  delete event.breadcrumbs
  delete event.extra
  delete event.modules
  delete event.server_name
  delete event.transaction
  delete event.spans
  delete event.logentry
  if (event.message) event.message = SAFE_EVENT_MESSAGE

  const environment = sanitizeRendererContext(
    event.contexts?.environment,
    new Set(['version', 'buildType', 'channel', 'platform'])
  )
  const operational = sanitizeRendererContext(event.contexts?.operational)
  event.contexts = {
    ...(environment ? { environment } : {}),
    ...(operational ? { operational } : {})
  }
  if (Object.keys(event.contexts).length === 0) event.contexts = undefined

  for (const value of event.exception?.values ?? []) {
    value.value = SAFE_EVENT_MESSAGE
    value.module = undefined
    for (const frame of value.stacktrace?.frames ?? []) {
      delete frame.filename
      delete frame.abs_path
      delete frame.context_line
      delete frame.pre_context
      delete frame.post_context
      delete frame.vars
    }
  }
  return event
}

/**
 * Initialize Sentry in renderer process
 */
export async function initSentryRenderer(): Promise<void> {
  if (isInitialized) {
    return
  }

  // Skip Sentry in development mode to avoid CSP warnings
  if (isDevEnv()) {
    devLog('[SentryRenderer] Sentry disabled in development mode')
    return
  }

  try {
    // Check if Sentry is enabled
    const config = (await transport.send(SentryEvents.api.getConfig)) as {
      enabled?: boolean
      anonymous?: boolean
    }

    if (!config?.enabled) {
      devLog('[SentryRenderer] Sentry is disabled')
      return
    }

    const buildInfo = getBuildInfo()
    const buildType = buildInfo.buildType || (buildInfo.isRelease ? 'release' : 'dev')
    const channel = buildInfo.isRelease ? 'release' : buildType
    const platform = getCurrentRendererPlatformState().platform
    const userAgent = getCurrentRendererUserAgent()

    Sentry.init({
      dsn: 'https://f8019096132f03a7a66c879a53462a67@o4508024637620224.ingest.us.sentry.io/4510196503871488',
      environment: buildType,
      release: `${buildInfo.version}@${buildType}`,
      tracesSampleRate: 1.0,
      beforeSend(event) {
        event.contexts = {
          ...event.contexts,
          environment: {
            version: buildInfo.version,
            buildType: buildInfo.buildType,
            channel,
            platform
          }
        }
        return sanitizeRendererSentryEvent(event)
      }
    })

    // Set environment context
    Sentry.setContext('environment', {
      version: buildInfo.version,
      buildType: buildInfo.buildType,
      channel,
      platform,
      userAgent
    })

    // Listen for user context updates
    watchUserContext()

    isInitialized = true
    devLog('[SentryRenderer] Sentry initialized')
  } catch (error) {
    sentryRendererLog.warn('Failed to initialize Sentry', error)
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

      // Non-anonymous mode: only attach the stable account ID.
      if (user && user.id) {
        Sentry.setUser({
          id: user.id,
          username: undefined,
          email: undefined,
          ip_address: undefined
        })
      } else {
        Sentry.setUser(null)
      }
    } catch (error) {
      devLog('[SentryRenderer] Failed to update user context', error)
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
      platform: getCurrentRendererPlatformState().platform
    })
    Sentry.captureException(error)
  })
}

export function captureOperationalException(error: Error, report: OperationalErrorReport): void {
  if (!isInitialized) return
  Sentry.withScope((scope) => {
    scope.setFingerprint(['operational', report.domain, report.operation, report.code])
    scope.setTag('operational.domain', report.domain)
    scope.setTag('operational.operation', report.operation)
    scope.setTag('operational.code', report.code)
    scope.setTag('operational.retryable', String(report.retryable))
    scope.setTag('operational.user_impact', report.userImpact)
    scope.setContext('operational', {
      reportId: report.id,
      occurrenceCount: report.occurrenceCount,
      ...report.context
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
      platform: getCurrentRendererPlatformState().platform
    })
    Sentry.captureMessage(message)
  })
}
