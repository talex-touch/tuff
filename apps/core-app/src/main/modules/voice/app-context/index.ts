/**
 * Adaptive dictation formatting — public surface.
 *
 * The wiring point is `formatDictationText`: give it a transcript and the frontmost-application
 * context (`appFormatContextFromActiveApp` over `activeAppService.getActiveApp()`), get back the
 * text for that application plus the list of transforms that changed it.
 */
export type {
  AppFormatContext,
  AppFormatOptions,
  AppFormatProfile,
  AppFormatProfileId,
  AppFormatResult,
  AppTransformId,
  IdentifierCase
} from './types'
export { APP_FORMAT_PROFILES, DEFAULT_FORMAT_PROFILE } from './profiles'
export {
  appFormatContextFromActiveApp,
  formatDictationText,
  resolveAppFormatProfile
} from './formatter'
export {
  TRANSFORM_RUNNERS,
  applyIdentifierCase,
  buildOrdinalList,
  collapseWhitespace,
  dropTrailingSentencePunctuation,
  normalizeChineseNumerals,
  normalizePunctuationToAscii,
  removeSpokenFillers,
  stripSentencePunctuation,
  substituteSpokenSymbols
} from './transforms'
