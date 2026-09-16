/**
 * Adaptive dictation formatting — profile resolution and the pipeline.
 *
 * `resolveAppFormatProfile` is the only place that answers "which app is this"; it is fed by the
 * existing frontmost-application service rather than owning a lookup of its own (see
 * `appFormatContextFromActiveApp`). `formatDictationText` is then pure, synchronous, and never
 * returns an empty string for input that had content — a dictation that lost every character to a
 * filler-strip would otherwise paste nothing at all, which is indistinguishable from a broken
 * microphone.
 */
import type { ActiveAppInfo } from '../../system/active-app'
import type { AppFormatContext, AppFormatProfile, AppFormatResult, AppTransformId } from './types'
import { APP_FORMAT_PROFILES, DEFAULT_FORMAT_PROFILE } from './profiles'
import { TRANSFORM_RUNNERS } from './transforms'

/**
 * Adapter from the frontmost-application record to the context this module formats against.
 *
 * `identifier` is the platform identity the active-app service uses on Windows and Linux, where a
 * bundle id does not exist, so it is accepted as a stand-in; `displayName` is the readable name
 * people and, therefore, the registry's `appNames` entries use.
 */
export function appFormatContextFromActiveApp(
  info: ActiveAppInfo | null | undefined
): AppFormatContext | null {
  if (!info) return null
  return {
    bundleId: info.bundleId ?? info.identifier ?? undefined,
    appName: info.displayName ?? undefined,
    windowTitle: info.windowTitle ?? undefined
  }
}

/**
 * Picks the profile for a context.
 *
 * Signals are tried in order of how much they can be trusted: an exact bundle id, then a bundle id
 * prefix (an editor family ships a bundle id per channel), then the application name, and only then
 * the focused window title. Each pass runs over the whole registry before the next one starts, so a
 * strongly-identified chat app can never be lost to a weakly-identified code profile that merely
 * appears earlier in the list.
 */
export function resolveAppFormatProfile(ctx?: AppFormatContext | null): AppFormatProfile {
  const bundleId = ctx?.bundleId?.trim().toLowerCase() ?? ''
  const appName = ctx?.appName?.trim().toLowerCase() ?? ''
  const windowTitle = ctx?.windowTitle?.trim() ?? ''

  if (bundleId) {
    const exact = APP_FORMAT_PROFILES.find((profile) =>
      profile.bundleIds.some((candidate) => candidate.toLowerCase() === bundleId)
    )
    if (exact) return exact

    const byPrefix = APP_FORMAT_PROFILES.find((profile) =>
      profile.bundlePrefixes.some((prefix) => bundleId.startsWith(prefix.toLowerCase()))
    )
    if (byPrefix) return byPrefix
  }

  if (appName) {
    const byName = APP_FORMAT_PROFILES.find((profile) =>
      profile.appNames.some((candidate) => candidate.toLowerCase() === appName)
    )
    if (byName) return byName
  }

  if (windowTitle) {
    const byTitle = APP_FORMAT_PROFILES.find((profile) =>
      profile.windowTitlePattern ? profile.windowTitlePattern.test(windowTitle) : false
    )
    if (byTitle) return byTitle
  }

  return DEFAULT_FORMAT_PROFILE
}

/**
 * Runs the profile's transform pipeline over a transcript.
 *
 * `transforms` reports the steps that actually changed the text, in order, so a caller (and a test)
 * can tell "the terminal profile did nothing because the text was already clean" apart from "the
 * terminal profile was never selected".
 *
 * The pipeline can legitimately consume everything — an utterance that is nothing but fillers, or
 * whitespace punctuation — and the guard walks back to the last step that still had content instead
 * of returning it. When that is the input itself, nothing is reported as changed, which is true of
 * the string the caller receives.
 */
export function formatDictationText(text: string, ctx?: AppFormatContext | null): AppFormatResult {
  const profile = resolveAppFormatProfile(ctx)
  const input = typeof text === 'string' ? text : ''

  // Whitespace-only input carries nothing to shape; there is no non-empty result to preserve.
  if (input.trim() === '') {
    return { text: '', profileId: profile.id, transforms: [] }
  }

  let current = input
  let lastNonEmptyText = input
  let lastNonEmptyCount = 0
  const applied: AppTransformId[] = []

  for (const id of profile.transforms) {
    const next = TRANSFORM_RUNNERS[id](current, profile.options)
    if (next !== current) applied.push(id)
    current = next
    if (current.trim() !== '') {
      lastNonEmptyText = current
      lastNonEmptyCount = applied.length
    }
  }

  if (current.trim() !== '') {
    return { text: current, profileId: profile.id, transforms: applied }
  }
  return {
    text: lastNonEmptyText,
    profileId: profile.id,
    transforms: applied.slice(0, lastNonEmptyCount)
  }
}
