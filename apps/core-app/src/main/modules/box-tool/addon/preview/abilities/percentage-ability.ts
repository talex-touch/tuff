import type { PreviewAbilityResult, PreviewCardPayload } from '@talex-touch/utils'
import type { PreviewAbilityContext } from '../preview-ability'
import { performance } from 'node:perf_hooks'
import { BasePreviewAbility } from '../preview-ability'

const PERCENT_PATTERNS = [
  /^\s*([-+]?(?:\d+(?:\.\d+)?|\.\d+))\s*([-+])\s*([-+]?(?:\d+(?:\.\d+)?|\.\d+))%\s*$/,
  /^\s*([-+]?(?:\d+(?:\.\d+)?|\.\d+))\s*\+\s*\(([-+]?(?:\d+(?:\.\d+)?|\.\d+))%\)\s*$/,
  /^\s*([-+]?(?:\d+(?:\.\d+)?|\.\d+))\s*-\s*\(([-+]?(?:\d+(?:\.\d+)?|\.\d+))%\)\s*$/,
  /^\s*([-+]?(?:\d+(?:\.\d+)?|\.\d+))\s*(?:的|的?)+\s*([-+]?(?:\d+(?:\.\d+)?|\.\d+))%\s*$/,
  /^\s*([-+]?(?:\d+(?:\.\d+)?|\.\d+))\s*% of\s*([-+]?(?:\d+(?:\.\d+)?|\.\d+))\s*$/i,
  /^\s*([-+]?(?:\d+(?:\.\d+)?|\.\d+))%\s*([-+])\s*([-+]?(?:\d+(?:\.\d+)?|\.\d+))%\s*$/
]

export class PercentageAbility extends BasePreviewAbility {
  readonly id = 'preview.percent'
  readonly priority = 45

  override canHandle(query: { text?: string }): boolean {
    if (!query.text) return false
    return PERCENT_PATTERNS.some((regex) => regex.test(query.text!))
  }

  async execute(context: PreviewAbilityContext): Promise<PreviewAbilityResult | null> {
    const startedAt = performance.now()
    const query = this.getNormalizedQuery(context.query)
    let base = 0
    let percent = 0
    const isOf = false
    let operation: 'add' | 'sub' | 'of' = 'of'

    let purePercent = false
    for (const regex of PERCENT_PATTERNS) {
      const match = query.match(regex)
      if (!match) continue
      if (regex === PERCENT_PATTERNS[0]) {
        base = Number(match[1])
        percent = Number(match[3])
        operation = match[2] === '-' ? 'sub' : 'add'
      } else if (regex === PERCENT_PATTERNS[1]) {
        base = Number(match[1])
        percent = Number(match[2])
        operation = 'add'
      } else if (regex === PERCENT_PATTERNS[2]) {
        base = Number(match[1])
        percent = Number(match[2])
        operation = 'sub'
      } else if (regex === PERCENT_PATTERNS[4]) {
        percent = Number(match[1])
        base = Number(match[2])
        operation = 'of'
      } else {
        base = Number(match[1])
        percent = Number(match[3])
        operation = match[2] === '-' ? 'sub' : 'add'
        purePercent = true
      }
      break
    }

    if (Number.isNaN(base) || Number.isNaN(percent)) return null

    this.throwIfAborted(context.signal)

    const delta = purePercent ? percent : (base * percent) / 100
    const result = purePercent
      ? operation === 'add'
        ? base + percent
        : base - percent
      : operation === 'add'
        ? base + delta
        : operation === 'sub'
          ? base - delta
          : (percent * base) / 100

    const payload: PreviewCardPayload = {
      abilityId: this.id,
      title: query,
      subtitle: purePercent ? '百分比运算' : isOf ? '百分比计算' : '百分比增减',
      primaryLabel: purePercent ? '百分比结果' : '结果',
      primaryValue: purePercent ? `${result}%` : result.toString(),
      secondaryLabel: purePercent ? '运算' : '变化量',
      secondaryValue: purePercent
        ? `${base}% ${operation === 'add' ? '+' : '-'} ${percent}%`
        : delta.toString(),
      sections: [
        {
          rows: [
            { label: purePercent ? '基准百分比' : '基准', value: base.toString() },
            { label: '百分比', value: `${percent}%` }
          ]
        }
      ]
    }

    return {
      abilityId: this.id,
      confidence: 0.7,
      payload,
      durationMs: performance.now() - startedAt
    }
  }
}
