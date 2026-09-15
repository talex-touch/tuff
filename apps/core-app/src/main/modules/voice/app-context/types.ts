/**
 * Adaptive dictation formatting — types.
 *
 * Recognition currently hands `voice-service` one undifferentiated string and it is delivered
 * verbatim. The same utterance, though, is not the same text everywhere: a shell command must not
 * end in a full stop, an editor wants an identifier, a notes app wants Markdown structure, and a
 * chat window wants the sentence the speaker actually said. Formatting therefore has to know the
 * receiving application.
 *
 * Nothing here resolves the receiving application itself. The main process already does that in
 * `modules/system/active-app`, which owns the frontmost-application lookup, its platform branches
 * and its caching; this module consumes the result of that lookup as `AppFormatContext` (see
 * `appFormatContextFromActiveApp`) and stays a pure function of it.
 */

/** The receiving application, as much of it as formatting is allowed to care about. */
export interface AppFormatContext {
  /** macOS bundle identifier, e.g. `com.apple.Terminal`. The strongest signal when present. */
  readonly bundleId?: string
  /** Human-facing application name, e.g. `Terminal`. Used when no bundle id is available. */
  readonly appName?: string
  /** Focused window title. Only a last-resort hint, e.g. a source file name in an editor. */
  readonly windowTitle?: string
}

export type AppFormatProfileId = 'terminal' | 'code' | 'chat' | 'notes' | 'spreadsheet' | 'default'

/**
 * Every transform the pipeline can run, named as `<group>.<effect>`.
 *
 * A profile lists these in execution order, so the identifier doubles as the audit trail reported
 * back in `AppFormatResult.transforms`.
 */
export type AppTransformId =
  | 'filler.remove'
  | 'symbols.spoken'
  | 'punctuation.ascii'
  | 'punctuation.strip'
  | 'punctuation.trailing'
  | 'numerals.chinese'
  | 'list.ordinals'
  | 'identifier.case'
  | 'whitespace.collapse'

export type IdentifierCase = 'camel' | 'snake' | 'pascal'

/**
 * Parameters for transforms whose behaviour is not fully described by being enabled.
 *
 * Enablement lives in `AppFormatProfile.transforms`; anything that needs a *value* lives here, so
 * that a profile stays a declarative data record rather than a function keyed on an application.
 */
export interface AppFormatOptions {
  /** Target case for `identifier.case`. `null` keeps that transform inert even if it is listed. */
  readonly identifierCase: IdentifierCase | null
}

/** One application family's formatting policy. Data only — no per-app code path. */
export interface AppFormatProfile {
  readonly id: AppFormatProfileId
  /** Shown in settings and diagnostics. */
  readonly label: string
  /** Exact bundle identifiers, compared case-insensitively. */
  readonly bundleIds: readonly string[]
  /** Bundle identifier prefixes, for suites whose members share a vendor prefix. */
  readonly bundlePrefixes: readonly string[]
  /** Application names, compared case-insensitively, for platforms without a bundle id. */
  readonly appNames: readonly string[]
  /** Last-resort hint: focused window titles that suggest this profile's editing context. */
  readonly windowTitlePattern: RegExp | null
  /** Transform pipeline, in execution order. */
  readonly transforms: readonly AppTransformId[]
  readonly options: AppFormatOptions
}

export interface AppFormatResult {
  readonly text: string
  readonly profileId: AppFormatProfileId
  /** Transform ids that actually changed the text, in execution order. */
  readonly transforms: readonly string[]
}
