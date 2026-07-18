import { describe, expect, it } from 'vitest'
import { evaluateSafeMathExpression } from '../../core-box/preview'

describe('safe math expression parser', () => {
  it.each([
    { expression: '2 + 3 * 4', expected: 14 },
    { expression: '(2 + 3) * 4', expected: 20 },
    { expression: '2 ^ 3 ^ 2', expected: 512 },
    { expression: 'pow(2, 3) + sqrt(9)', expected: 11 },
    { expression: 'sin(pi / 2)', expected: 1 },
    { expression: '10 % 3', expected: 1 },
    { expression: '6 × 7 ÷ 3', expected: 14 }
  ])('preserves arithmetic precedence for $expression', ({ expression, expected }) => {
    expect(evaluateSafeMathExpression(expression)).toBe(expected)
  })

  it.each([
    'unknownIdentifier',
    'Math.max(1, 2)',
    'pi.constructor',
    'value = 1',
    'pow(2, 3, 4)',
    '1 / 0',
    'exp(1000)',
    `${'('.repeat(33)}1${')'.repeat(33)}`,
    '1'.repeat(241)
  ])('rejects unsafe, malformed, over-limit, or non-finite input %s', (expression) => {
    expect(evaluateSafeMathExpression(expression)).toBeNull()
  })
})
