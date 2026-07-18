import { describe, expect, it } from 'vitest'
import { evaluateExpression } from './expression-evaluator'

describe('main expression evaluator', () => {
  it.each([
    { expression: '2 + 3 * 4', value: 14 },
    { expression: '(2 + 3) * 4', value: 20 },
    { expression: '2 ^ 3 ^ 2', value: 512 },
    { expression: 'sqrt(81) + pow(2, 3)', value: 17 },
    { expression: 'sin(pi / 2)', value: 1 },
    { expression: '200 + 10%', value: 220 },
    { expression: '20% of 250', value: 50 }
  ])('evaluates $expression using the allowlisted math grammar', ({ expression, value }) => {
    const result = evaluateExpression(expression)

    expect(result.success).toBe(true)
    expect(result.numericValue).toBeCloseTo(value, 10)
    expect(result.value).toBe(String(value))
    expect(result.formatted).toBe(`${expression} = ${value}`)
  })

  it.each([
    'Math.max(1, 2)',
    'process.exit()',
    'pi.constructor',
    'total = 1',
    '1 / 0',
    'exp(1000)'
  ])('rejects non-allowlisted or non-finite expression %s', (expression) => {
    expect(evaluateExpression(expression)).toEqual({
      success: false,
      error: 'UNSAFE_EXPRESSION',
      expression
    })
  })
})
