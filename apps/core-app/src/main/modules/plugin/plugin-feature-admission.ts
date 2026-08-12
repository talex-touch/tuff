/**
 * Whether a plugin feature is allowed onto the list.
 *
 * Lifted out of `TouchPlugin.addFeature` for #339. The word list below is a policy -- it stops a
 * plugin from calling its feature 官方 or talex, which is a naming-authority claim, not a
 * spelling rule -- and it had no test of any kind. `addFeature`'s six existing assertions all
 * check the success path; the one rejection covered is the duplicate id, which is checked against
 * plugin state and so stays on the class.
 *
 * A policy that lives inside a method on a 3800-line class can only be exercised by constructing
 * a plugin, which is why nothing did.
 */

/** Feature ids are used in routes and payload keys, so anything outside this is refused. */
const FEATURE_ID_PATTERN = /^[\w-]+$/

/**
 * Words a feature's name or description may not contain.
 *
 * Two groups, and they are not the same kind of rule. `官方` / `touch` / `talex` / `官方认证`
 * claim first-party status. The rest -- `第一`, `首发`, `排行`, `权威性` -- are superlative and
 * ranking claims. Both are substring matches, so `touch` also refuses `touchpad`; that is the
 * existing behaviour and it is asserted below rather than quietly narrowed here.
 */
export const DISALLOWED_FEATURE_WORDS: readonly string[] = Object.freeze([
  '官方',
  'touch',
  'talex',
  '第一',
  '权利',
  '权威性',
  '官方认证',
  '触控',
  '联系',
  '互动',
  '互动式',
  '触控技术',
  '互动体验',
  '互动设计',
  '创意性',
  '创造性',
  '首发',
  '首部',
  '首款',
  '首张',
  '排行',
  '排名系统'
])

export type FeatureAdmissionRefusal = 'invalid-id' | 'disallowed-words' | 'no-commands'

export type FeatureAdmissionResult =
  | { admitted: true }
  | { admitted: false; reason: FeatureAdmissionRefusal; word?: string }

/**
 * Checks a feature against the rules that need nothing but the feature itself.
 *
 * The duplicate-id rule is deliberately not here: it reads `this.features`, so moving it would
 * mean handing plugin state to a pure function purely to keep the checks together.
 */
export function validatePluginFeatureAdmission(feature: {
  id?: unknown
  name?: unknown
  desc?: unknown
  commands?: unknown
}): FeatureAdmissionResult {
  const id = typeof feature.id === 'string' ? feature.id : ''
  if (!FEATURE_ID_PATTERN.test(id)) return { admitted: false, reason: 'invalid-id' }

  // Coerced rather than assumed. `desc` is declared required on IPluginFeature, but the object
  // arrives from a plugin's own manifest, and `undefined.includes` would throw here rather than
  // refuse the feature.
  const name = typeof feature.name === 'string' ? feature.name : ''
  const desc = typeof feature.desc === 'string' ? feature.desc : ''
  const word = DISALLOWED_FEATURE_WORDS.find(
    (entry) => name.includes(entry) || desc.includes(entry)
  )
  if (word !== undefined) return { admitted: false, reason: 'disallowed-words', word }

  if (!Array.isArray(feature.commands) || feature.commands.length < 1)
    return { admitted: false, reason: 'no-commands' }

  return { admitted: true }
}
