import type { MathJsInstance } from 'mathjs'
import { all, create } from 'mathjs'

const math: MathJsInstance = create(all, {
  number: 'BigNumber',
  precision: 64
})

export interface ExpressionResult {
  success: boolean
  value?: string
  numericValue?: number
  error?: string
  expression: string
  formatted?: string
}

const DANGEROUS_PATTERNS = [
  /import\s*\(/i,
  /require\s*\(/i,
  /eval\s*\(/i,
  /Function\s*\(/i,
  /\bprocess\b/i,
  /\bglobal\b/i,
  /\bwindow\b/i,
  /\bdocument\b/i
]

function isSafeExpression(expr: string): boolean {
  return !DANGEROUS_PATTERNS.some((pattern) => pattern.test(expr))
}

/**
 * Normalize expression for evaluation
 * - Replace Chinese operators
 * - Handle percentage syntax
 */
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
function formatResult(value: unknown): string {
  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return value.toString()
    }
    // Round to reasonable precision
    const rounded = Math.round(value * 1e10) / 1e10
    return rounded.toString()
  }

  if (typeof value === 'object' && value !== null) {
    // Handle mathjs BigNumber
    if ('toNumber' in value && typeof (value as any).toNumber === 'function') {
      const num = (value as any).toNumber()
      if (Number.isInteger(num)) {
        return num.toString()
      }
      const rounded = Math.round(num * 1e10) / 1e10
      return rounded.toString()
    }
  }

  return String(value)
}

/**
 * Evaluate a mathematical expression
 */
export function evaluateExpression(expression: string): ExpressionResult {
  const trimmed = expression.trim()

  if (!trimmed) {
    return { success: false, error: 'EMPTY_EXPRESSION', expression }
  }

  if (!isSafeExpression(trimmed)) {
    return { success: false, error: 'UNSAFE_EXPRESSION', expression }
  }

  try {
    const normalized = normalizeExpression(trimmed)
    const result = math.evaluate(normalized)

    if (result === undefined || result === null) {
      return { success: false, error: 'NO_RESULT', expression }
    }

    // Skip if result is a function or complex object
    if (typeof result === 'function') {
      return { success: false, error: 'INVALID_RESULT_TYPE', expression }
    }

    const formatted = formatResult(result)
    const numericValue =
      typeof result === 'number'
        ? result
        : ((result as any)?.toNumber?.() ?? Number.parseFloat(formatted))

    return {
      success: true,
      value: formatted,
      numericValue,
      expression: trimmed,
      formatted: `${trimmed} = ${formatted}`
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'EVALUATION_ERROR',
      expression
    }
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
