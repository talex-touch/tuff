import { describe, expect, it } from 'vitest'
import {
  hasRegexBacktrackingRisk,
  QuickOpsDeveloperAbility,
} from '../../core-box/preview/abilities/quickops-developer-ability'

describe('QuickOpsDeveloperAbility regex ReDoS guard', () => {
  it('blocks nested quantifiers, overlapping alternations, brace loops, and chained quantifiers quickly', async () => {
    const ability = new QuickOpsDeveloperAbility()
    const target = `${'a'.repeat(400)}!`
    const adversarial = [
      'regex /((a+))+/ ',
      'regex /(a|a)+/ ',
      'regex /(a|ab)+/ ',
      'regex /(a|A)+/i ',
      'regex /(a{1,2})+/ ',
      'regex /a*a*a*a*b/ ',
      'regex /([a-z]+)*/ ',
      'regex /(a?)+/ ',
      'regex /((?=a+)a)+/ ',
      'regex /(a+)(a+)(a+)(a+)b/ ',
      'regex /(?:a*)(?:a*)(?:a*)(?:a*)b/ ',
      'regex /a{0,9}a{0,9}a{0,9}a{0,9}a{0,9}a{0,9}a{0,9}b/ ',
      'regex /a{0,5}a{0,5}a{0,5}a{0,5}b/ ',
      'regex /a{0,9}aa{0,9}aa{0,9}aa{0,9}b/ ',
      `regex /${'(a|a)'.repeat(25)}b/ `,
      `regex /${'(a|ab)'.repeat(12)}c/ `,
      `regex /${'(a|)'.repeat(12)}b/ `,
      `regex /${'(a|a)x'.repeat(12)}!/ `,
    ]

    const start = performance.now()
    for (const prefix of adversarial) {
      const result = await ability.execute({
        query: { text: `${prefix}${target}`, inputs: [] },
        signal: new AbortController().signal,
      })
      expect(result?.payload.primaryLabel, prefix).toBe('错误')
      expect(result?.payload.warnings?.[0], prefix).toContain('too complex')
    }
    expect(performance.now() - start).toBeLessThan(200)
  })

  it('allows ordinary non-backtracking developer regexes', async () => {
    expect(hasRegexBacktrackingRisk('(foo|bar)+')).toBe(false)
    expect(hasRegexBacktrackingRisk('[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}', 'i')).toBe(false)
    expect(hasRegexBacktrackingRisk('\\b\\d{4}-\\d{2}-\\d{2}\\b')).toBe(false)
    expect(hasRegexBacktrackingRisk('(http|https)://(www|web)\\.(com|cn)')).toBe(false)
    expect(hasRegexBacktrackingRisk('^\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}$')).toBe(false)

    const ability = new QuickOpsDeveloperAbility()
    const result = await ability.execute({
      query: { text: 'regex /(foo|bar)+/g foobar baz', inputs: [] },
      signal: new AbortController().signal,
    })
    expect(result?.payload.primaryValue).toBe('匹配')
    expect(result?.payload.secondaryValue).toBe('1')
  })
})
