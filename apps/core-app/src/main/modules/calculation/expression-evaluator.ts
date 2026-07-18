import { evaluateSafeMathExpression } from '@talex-touch/utils/core-box'

/**
 * Normalize expression for evaluation
 * - Replace Chinese operators
 * - Handle percentage syntax
 */
export interface ExpressionResult {
  success: boolean
  value?: string
  numericValue?: number
  error?: string
  expression: string
  formatted?: string
}

function normalizeExpression(expr: string): string {
  let normalized = expr
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/\s+/g, ' ')
    .trim()

  // Handle "X% of Y" → Y * (X/100)
  normalized = normalized.replace(
    /(\d+(?:\.\d+)?)\s*%\s*of\s*(\d+(?:\.\d+)?)/gi,
    (_, pct, base) => `${base} * (${pct}/100)`
  )

  // Handle "X + Y%" → X * (1 + Y/100)
  normalized = normalized.replace(
    /(\d+(?:\.\d+)?)\s*([+\-])\s*(\d+(?:\.\d+)?)\s*%/g,
    (_, base, op, pct) => {
      const sign = op === '+' ? '+' : '-'
      return `${base} * (1 ${sign} ${pct}/100)`
    }
  )

  return normalized
}

/**
 * Format result for display
 */
function formatResult(value: number): string {
  if (Number.isInteger(value)) {
    return value.toString()
  }
  const rounded = Math.round(value * 1e10) / 1e10
  return rounded.toString()
}

/**
 * Evaluate a mathematical expression
 */
export function evaluateExpression(expression: string): ExpressionResult {
  const trimmed = expression.trim()

  if (!trimmed) {
    return { success: false, error: 'EMPTY_EXPRESSION', expression }
  }

  const normalized = normalizeExpression(trimmed)
  const result = evaluateSafeMathExpression(normalized)
  if (result === null) {
    return { success: false, error: 'UNSAFE_EXPRESSION', expression }
  }

  const formatted = formatResult(result)
  return {
    success: true,
    value: formatted,
    numericValue: result,
    expression: trimmed,
    formatted: `${trimmed} = ${formatted}`
  }
}

/**
 * Check if a string looks like a mathematical expression
 */
export function looksLikeExpression(query: string): boolean {
  const trimmed = query.trim()

  // Must contain at least one digit
  if (!/\d/.test(trimmed)) {
    return false
  }

  // Must contain an operator or function
  const hasOperator = /[+\-*/%^×÷]/.test(trimmed)
  const hasFunction = /\b(sqrt|sin|cos|tan|log|ln|abs|round|ceil|floor|pow|exp)\s*\(/i.test(trimmed)
  const hasParens = /\(.*\)/.test(trimmed)
  const hasPercent = /%/.test(trimmed)

  // Exclude file paths and URLs
  if (/^[/~]/.test(trimmed) || /^https?:\/\//i.test(trimmed)) {
    return false
  }

  // Exclude things that look like version numbers (1.2.3)
  if (/^\d+\.\d+\.\d+/.test(trimmed)) {
    return false
  }

  return hasOperator || hasFunction || hasParens || hasPercent
}
