import type { PreviewAbilityContext } from '../preview-ability'
import { BasePreviewAbility } from '../preview-ability'
import type { PreviewAbilityResult, PreviewCardPayload } from '@talex-touch/utils'
import { performance } from 'perf_hooks'
import {
  findScientificConstant,
  SCIENTIFIC_CONSTANTS
} from '../../../../plugin/providers/scientific-constants'

const CONSTANT_KEYWORDS = /(constant|常量|gravity|光速|普朗克|玻尔兹曼|阿伏伽德罗|π)/i

function formatValue(value: string): { formatted: string; scientific?: string } {
  const scientificMatch = /^-?\d+(\.\d+)?e[+-]?\d+$/i.test(value)
  if (scientificMatch) {
    const [coeff, exp] = value.toLowerCase().split('e')
    const formatted = `${coeff} × 10^${Number(exp)}`
    return { formatted, scientific: value }
  }

  if (value.includes('.')) {
    const trimmed = value.replace(/\.?0+$/, '')
    return {
      formatted: trimmed
    }
  }

  return { formatted: value }
}

export class ScientificConstantsAbility extends BasePreviewAbility {
  readonly id = 'preview.constants.scientific'
  readonly priority = 22

  override canHandle(query: { text?: string }): boolean {
    if (!query.text) return false
    return CONSTANT_KEYWORDS.test(query.text)
  }

  async execute(context: PreviewAbilityContext): Promise<PreviewAbilityResult | null> {
    const startedAt = performance.now()
    const text = this.getNormalizedQuery(context.query)
    if (!text) return null

    const matched = findScientificConstant(text)
    if (!matched) return null

    const value = formatValue(matched.value)

    const payload: PreviewCardPayload = {
      abilityId: this.id,
      title: matched.name,
      subtitle: matched.category,
      primaryLabel: '常量值',
      primaryValue: value.formatted,
      primaryUnit: matched.unit,
      description: matched.description,
      badges: [matched.symbol ?? '', matched.source ?? ''].filter(Boolean),
      chips: matched.aliases
        .filter((alias) => alias !== matched.name)
        .slice(0, 3)
        .map((alias) => ({ label: '别名', value: alias })),
      sections: [
        {
          title: '常量详情',
          rows: [
            { label: '标识', value: matched.id },
            ...(value.scientific ? [{ label: '科学计数法', value: value.scientific }] : []),
            { label: '来源', value: matched.source ?? 'CODATA 2018' }
          ]
        }
      ],
      meta: {
        constantId: matched.id,
        aliases: matched.aliases,
        source: matched.source
      }
    }

    return {
      abilityId: this.id,
      confidence: 0.7,
      payload,
      durationMs: performance.now() - startedAt
    }
  }

  async preload(): Promise<void> {
    void SCIENTIFIC_CONSTANTS
  }
}
