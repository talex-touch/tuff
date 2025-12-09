import type { PreviewAbilityResult, PreviewCardPayload, TuffQuery } from '@talex-touch/utils'
import type { PreviewAbilityContext } from '../preview-ability'
import { performance } from 'node:perf_hooks'
import { BasePreviewAbility } from '../preview-ability'

let mathjs: any = null

async function getMathJs() {
  if (!mathjs) {
    try {
      const m = await import('mathjs')
      mathjs = m.create(m.all, { number: 'BigNumber', precision: 64 })
    }
    catch {
      return null
    }
  }
  return mathjs
}

function formatNumber(value: unknown): string {
  if (typeof value === 'number') {
    if (Number.isNaN(value) || !Number.isFinite(value)) return ''
    if (Number.isInteger(value)) return value.toString()
    return (Math.round(value * 1e10) / 1e10).toString()
  }
  if (typeof value === 'object' && value !== null && 'toNumber' in value) {
    const num = (value as any).toNumber()
    if (Number.isInteger(num)) return num.toString()
    return (Math.round(num * 1e10) / 1e10).toString()
  }
  return String(value)
}

const DANGEROUS_PATTERNS = [
  /import\s*\(/i,
  /require\s*\(/i,
  /eval\s*\(/i,
  /Function\s*\(/i,
  /\bprocess\b/i,
  /\bglobal\b/i,
]

function isSafe(expr: string): boolean {
  return !DANGEROUS_PATTERNS.some((p) => p.test(expr))
}

function normalizeExpression(expr: string): string {
  let normalized = expr
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .trim()

  // "X% of Y" → Y * (X/100)
  normalized = normalized.replace(
    /(\d+(?:\.\d+)?)\s*%\s*of\s*(\d+(?:\.\d+)?)/gi,
    (_, pct, base) => `${base} * (${pct}/100)`
  )

  // "X + Y%" → X * (1 + Y/100)
  normalized = normalized.replace(
    /(\d+(?:\.\d+)?)\s*([+\-])\s*(\d+(?:\.\d+)?)\s*%$/,
    (_, base, op, pct) => `${base} * (1 ${op} ${pct}/100)`
  )

  return normalized
}

/**
 * Advanced Expression Ability using mathjs
 * Supports functions like sqrt, sin, cos, log, etc.
 */
export class AdvancedExpressionAbility extends BasePreviewAbility {
  readonly id = 'preview.expression.advanced'
  readonly priority = 15 // Higher than BasicExpressionAbility (10)

  override canHandle(query: TuffQuery): boolean {
    const text = query.text?.trim() ?? ''
    if (text.length < 2) return false
    if (!/\d/.test(text)) return false

    // Must have operator or function
    const hasOperator = /[+\-*/%^×÷]/.test(text)
    const hasFunction = /\b(sqrt|sin|cos|tan|log|ln|abs|round|ceil|floor|pow|exp|pi|e)\s*\(/i.test(text)
    const hasPower = /\^/.test(text)

    // Exclude paths and URLs
    if (/^[\/~]/.test(text) || /^https?:\/\//i.test(text)) return false
    // Exclude version numbers
    if (/^\d+\.\d+\.\d+/.test(text)) return false

    return hasOperator || hasFunction || hasPower
  }

  async execute(context: PreviewAbilityContext): Promise<PreviewAbilityResult | null> {
    const startedAt = performance.now()
    const text = this.getNormalizedQuery(context.query)
    if (!text || !isSafe(text)) return null

    const math = await getMathJs()
    if (!math) return null

    this.throwIfAborted(context.signal)

    try {
      const normalized = normalizeExpression(text)
      const result = math.evaluate(normalized)

      if (result === undefined || result === null || typeof result === 'function') {
        return null
      }

      const formatted = formatNumber(result)
      if (!formatted) return null

      const payload: PreviewCardPayload = {
        abilityId: this.id,
        title: text,
        subtitle: '高级计算',
        primaryLabel: '结果',
        primaryValue: formatted,
        sections: [
          {
            rows: [
              { label: '表达式', value: text },
              { label: '标准化', value: normalized },
            ],
          },
        ],
        badges: ['mathjs'],
      }

      return {
        abilityId: this.id,
        confidence: 0.75,
        payload,
        durationMs: performance.now() - startedAt,
      }
    }
    catch {
      return null
    }
  }
}
