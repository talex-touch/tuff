import { describe, expect, it } from 'vitest'
import {
  DISALLOWED_FEATURE_WORDS,
  validatePluginFeatureAdmission
} from './plugin-feature-admission'

/**
 * The rules a plugin feature has to clear before it reaches the list (#339).
 *
 * `addFeature` had six assertions and all of them checked the success path; the only rejection
 * covered was the duplicate id. The word list in particular — which stops a plugin from calling
 * its feature 官方 or talex — had no test of any kind, because reaching it meant constructing a
 * plugin against a 3800-line class.
 */
function feature(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'demo-feature',
    name: 'Demo',
    desc: 'A demo feature',
    commands: [{ type: 'over', value: ['demo'] }],
    ...overrides
  }
}

describe('feature id', () => {
  it('admits word characters and hyphens', () => {
    for (const id of ['demo', 'demo-feature', 'demo_feature', 'Demo123', '_x', '9'])
      expect(validatePluginFeatureAdmission(feature({ id })), id).toEqual({ admitted: true })
  })

  /**
   * Ids end up in routes and payload keys. A dot or a slash would be read as structure by
   * something downstream, and an empty id matches every lookup that uses `startsWith`.
   */
  it('refuses anything that would be read as structure', () => {
    for (const id of ['demo.feature', 'demo/feature', 'demo feature', '', '../escape', 'a:b'])
      expect(validatePluginFeatureAdmission(feature({ id })), id).toEqual({
        admitted: false,
        reason: 'invalid-id'
      })
  })

  it('refuses a missing or non-string id rather than coercing it', () => {
    for (const id of [undefined, null, 42, {}])
      expect(validatePluginFeatureAdmission(feature({ id }))).toEqual({
        admitted: false,
        reason: 'invalid-id'
      })
  })
})

describe('disallowed words', () => {
  it('refuses every word on the list, in the name and in the description', () => {
    for (const word of DISALLOWED_FEATURE_WORDS) {
      for (const field of ['name', 'desc'] as const) {
        const result = validatePluginFeatureAdmission(feature({ [field]: `A ${word} thing` }))
        expect(result.admitted, `${field}: ${word}`).toBe(false)
        // The reported word is the first entry the text contains, which is not always the one
        // written -- see the redundancy case below.
        expect(result, `${field}: ${word}`).toMatchObject({ reason: 'disallowed-words' })
      }
    }
  })

  /**
   * Five entries can never be reported, because a shorter entry earlier in the list already
   * matches everything they do. Recorded rather than removed: the list is a policy statement and
   * trimming it is the owner's call, but a test that expected each entry to report itself would
   * have been wrong about five of them.
   */
  it('has entries that a shorter entry already covers', () => {
    const shadowed = DISALLOWED_FEATURE_WORDS.filter((word, index) =>
      DISALLOWED_FEATURE_WORDS.some(
        (other, otherIndex) => otherIndex < index && word.includes(other)
      )
    )

    expect(shadowed).toEqual(['官方认证', '互动式', '触控技术', '互动体验', '互动设计'])
    expect(validatePluginFeatureAdmission(feature({ name: '官方认证' }))).toEqual({
      admitted: false,
      reason: 'disallowed-words',
      word: '官方'
    })
  })

  /**
   * The two kinds of claim the list exists to stop, spelled out so a future edit that drops one
   * group fails here rather than silently allowing it.
   */
  it('covers first-party claims and superlative claims alike', () => {
    for (const word of ['官方', 'talex', 'touch', '官方认证'])
      expect(DISALLOWED_FEATURE_WORDS).toContain(word)
    for (const word of ['第一', '首发', '排行', '权威性'])
      expect(DISALLOWED_FEATURE_WORDS).toContain(word)
  })

  /**
   * Substring matching, so `touch` also refuses `touchpad`. That is the existing behaviour rather
   * than an intent, and it is written down here so a change to word-boundary matching is a
   * deliberate decision with a failing test, not a quiet one.
   */
  it('matches as a substring, so ordinary words containing one are refused too', () => {
    expect(validatePluginFeatureAdmission(feature({ name: 'Touchpad settings' }))).toEqual({
      admitted: true
    })
    expect(validatePluginFeatureAdmission(feature({ name: 'touchpad settings' }))).toEqual({
      admitted: false,
      reason: 'disallowed-words',
      word: 'touch'
    })
  })

  it('admits a name and description with none of them', () => {
    expect(
      validatePluginFeatureAdmission(feature({ name: 'Weather', desc: 'Shows weather' }))
    ).toEqual({ admitted: true })
  })

  /**
   * `desc` is declared required on `IPluginFeature`, but the object comes from a plugin's own
   * manifest. The original read `desc.includes(...)` directly, which throws on an absent one —
   * a plugin omitting it crashed the check instead of failing it.
   */
  it('treats a missing name or description as empty rather than throwing', () => {
    expect(() => validatePluginFeatureAdmission(feature({ desc: undefined }))).not.toThrow()
    expect(validatePluginFeatureAdmission(feature({ desc: undefined }))).toEqual({ admitted: true })
    expect(validatePluginFeatureAdmission(feature({ name: undefined, desc: undefined }))).toEqual({
      admitted: true
    })
    expect(validatePluginFeatureAdmission(feature({ name: 42, desc: null }))).toEqual({
      admitted: true
    })
  })
})

describe('commands', () => {
  it('refuses a feature with nothing to trigger it', () => {
    for (const commands of [[], undefined, null, 'over', {}])
      expect(validatePluginFeatureAdmission(feature({ commands }))).toEqual({
        admitted: false,
        reason: 'no-commands'
      })
  })

  it('admits a feature with at least one', () => {
    expect(validatePluginFeatureAdmission(feature({ commands: [{ type: 'over' }] }))).toEqual({
      admitted: true
    })
  })
})

/**
 * The id is checked before the words, and the words before the commands. Order is asserted
 * because the refusal reason is what `addFeature` logs, and a feature failing three rules should
 * report the first one every time rather than whichever check happened to run.
 */
describe('refusal order', () => {
  it('reports the id first when several rules fail', () => {
    expect(
      validatePluginFeatureAdmission({ id: 'bad id', name: '官方', desc: '', commands: [] })
    ).toEqual({ admitted: false, reason: 'invalid-id' })
  })

  it('reports the words before the missing commands', () => {
    expect(
      validatePluginFeatureAdmission({ id: 'ok', name: '官方', desc: '', commands: [] })
    ).toEqual({ admitted: false, reason: 'disallowed-words', word: '官方' })
  })
})
