/**
 * Renderer Sentry final-event sanitizer (issue #476).
 *
 * Kept in a standalone module (no build-info / transport imports) so the
 * final-sink contract can be canary-tested in isolation.
 */
import type * as Sentry from '@sentry/electron/renderer'

const SAFE_EVENT_MESSAGE = 'redacted'
const SAFE_CONTEXT_KEY = /^[a-zA-Z0-9_.:-]{1,96}$/
/**
 * Script URLs stay on the frame so the main process can rewrite them to `app:///…` (its
 * NormalizePaths integration runs on renderer events too) and apply source maps; its own final
 * sanitizer then drops whatever did not resolve under the app bundle. Anything that is not a URL
 * -- a bare path, a module name -- is dropped here already.
 */
const SAFE_FRAME_FILENAME_PATTERN =
  /^(?:app:\/\/\/?|file:\/\/\/|https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/)[^\s"'<>]{1,512}$/
/** Codes this codebase throws as `new Error('NETWORK_TIMEOUT')`; prose stays redacted. */
const STABLE_ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/
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

export function sanitizeRendererSentryEvent<T extends Sentry.Event>(event: T): T {
  delete event.request
  delete event.breadcrumbs
  delete event.extra
  delete event.modules
  delete event.server_name
  delete event.transaction
  delete event.spans
  delete event.logentry
  if (event.message) event.message = SAFE_EVENT_MESSAGE

  if (event.tags) {
    const tags: Record<string, string> = {}
    for (const [key, raw] of Object.entries(event.tags)) {
      if (!SAFE_CONTEXT_KEY.test(key) || SENSITIVE_CONTEXT_KEY.test(key)) continue
      if (typeof raw === 'string' && SAFE_CONTEXT_KEY.test(raw)) tags[key] = raw
    }
    event.tags = tags
  }

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
    value.value =
      typeof value.value === 'string' &&
      value.value.length <= 64 &&
      STABLE_ERROR_CODE_PATTERN.test(value.value)
        ? value.value
        : SAFE_EVENT_MESSAGE
    value.module = undefined
    value.mechanism = undefined
    for (const frame of value.stacktrace?.frames ?? []) {
      if (typeof frame.filename !== 'string' || !SAFE_FRAME_FILENAME_PATTERN.test(frame.filename)) {
        delete frame.filename
      }
      delete frame.abs_path
      delete frame.context_line
      delete frame.pre_context
      delete frame.post_context
      delete frame.vars
    }
  }
  return event
}
