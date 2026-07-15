import { describe, expect, it } from 'vitest'
import { estimateContextTokens, normalizeContextTokenBudget } from './intelligence-token-estimate'

describe('estimateContextTokens', () => {
  it.each([
    { name: 'whitespace', content: ' \n\t ', expected: 1 },
    { name: 'four ASCII code points', content: 'abcd', expected: 1 },
    { name: 'five ASCII code points', content: 'abcde', expected: 2 },
    { name: 'CJK code points', content: '中文', expected: 2 },
    { name: 'one emoji', content: '😀', expected: 2 },
    { name: 'joined emoji with variation selector', content: '👩‍💻️', expected: 6 },
    { name: 'mixed ASCII CJK and emoji content', content: 'abcd中😀', expected: 4 }
  ])('estimates $name conservatively', ({ content, expected }) => {
    expect(estimateContextTokens(content)).toBe(expected)
  })

  it.each([
    { name: 'positive fraction', value: 9.8, fallback: 7, expected: 9 },
    { name: 'zero', value: 0, fallback: 7, expected: 1 },
    { name: 'negative number', value: -3, fallback: 7, expected: 1 },
    { name: 'omitted value', value: undefined, fallback: 7, expected: 7 },
    { name: 'null value', value: null, fallback: 7, expected: 7 },
    { name: 'runtime string', value: '8', fallback: 7, expected: 7 },
    { name: 'NaN', value: Number.NaN, fallback: 7, expected: 7 },
    { name: 'positive infinity', value: Number.POSITIVE_INFINITY, fallback: 7, expected: 7 },
    { name: 'negative infinity', value: Number.NEGATIVE_INFINITY, fallback: 7, expected: 7 }
  ])('normalizes $name to a finite token budget', ({ value, fallback, expected }) => {
    expect(normalizeContextTokenBudget(value, fallback)).toBe(expected)
  })
})
