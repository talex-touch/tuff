import type { PreviewAbilityResult, PreviewCardPayload, TuffQuery } from '@talex-touch/utils'
import type { PreviewAbilityContext } from '../preview-ability'
import { performance } from 'node:perf_hooks'
import { BasePreviewAbility } from '../preview-ability'

const EXPRESSION_REGEX = /^[\d+\-*/().%\s]+$/u

function formatNumber(value: number): string {
  if (Number.isNaN(value) || !Number.isFinite(value)) {
    return ''
  }
  if (Number.isInteger(value)) {
    return value.toString()
  }
  return value.toFixed(6).replace(/\.?0+$/, '')
}

function evaluateExpression(expression: string): number | null {
  if (!expression || !EXPRESSION_REGEX.test(expression)) {
    return null
  }
  try {
    // eslint-disable-next-line no-new-func
    const evaluator = new Function(`return (${expression})`)
    const result = evaluator()
    return typeof result === 'number' && Number.isFinite(result) ? result : null
  }
  catch {
    return null
  }
}

export class BasicExpressionAbility extends BasePreviewAbility {
  readonly id = 'preview.expression.basic'
  readonly priority = 10

  override canHandle(query: TuffQuery): boolean {
    const normalized = query.text?.trim() ?? ''
    if (normalized.length < 2)
      return false
    if (!/[+\-*/%]/.test(normalized))
      return false
    return EXPRESSION_REGEX.test(normalized)
  }

  async execute(context: PreviewAbilityContext): Promise<PreviewAbilityResult | null> {
    const startedAt = performance.now()
    const expression = this.getNormalizedQuery(context.query)
    if (!expression)
      return null

    const sanitized = expression.replace(/[^0-9+\-*/().%\s]/g, '')
    this.throwIfAborted(context.signal)
    const evaluated = evaluateExpression(sanitized)
    if (evaluated === null) {
      return null
    }

    const payload: PreviewCardPayload = {
      abilityId: this.id,
      title: expression,
      subtitle: '快速算式',
      primaryLabel: '结果',
      primaryValue: formatNumber(evaluated),
      sections: [
        {
          rows: [
            { label: '表达式', value: expression },
            { label: '算式（安全）', value: sanitized },
          ],
        },
      ],
      meta: {
        expression,
        sanitized,
      },
    }

    return {
      abilityId: this.id,
      confidence: 0.6,
      payload,
      durationMs: performance.now() - startedAt,
    }
  }
}
