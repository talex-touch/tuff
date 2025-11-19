import type { PreviewAbilityResult, PreviewCardPayload } from '@talex-touch/utils'
import type { PreviewAbilityContext } from '../preview-ability'
import { performance } from 'node:perf_hooks'
import { BasePreviewAbility } from '../preview-ability'

interface RateEntry {
  name: string
  rate: number // rate against base USD
}

const CURRENCY_TABLE: Record<string, RateEntry> = {
  usd: { name: '美元', rate: 1 },
  cny: { name: '人民币', rate: 7.25 },
  eur: { name: '欧元', rate: 0.92 },
  jpy: { name: '日元', rate: 151.2 },
  hkd: { name: '港币', rate: 7.81 },
  twd: { name: '新台币', rate: 32.4 },
  gbp: { name: '英镑', rate: 0.79 },
  krw: { name: '韩元', rate: 1364 },
  aud: { name: '澳元', rate: 1.49 },
  cad: { name: '加元', rate: 1.37 },
  sgd: { name: '新加坡元', rate: 1.36 },
  thb: { name: '泰铢', rate: 36.4 },
  vnd: { name: '越南盾', rate: 24840 },
  inr: { name: '印度卢比', rate: 83.2 },
  CHF: { name: '瑞士法郎', rate: 0.86 },
  btc: { name: '比特币', rate: 0.000018 },
  eth: { name: '以太坊', rate: 0.00026 },
}

const SYMBOL_MAP: Record<string, string> = {
  '$': 'usd',
  '¥': 'cny',
  '￥': 'cny',
  '€': 'eur',
  '£': 'gbp',
  '₩': 'krw',
  '₫': 'vnd',
  '฿': 'thb',
  '₿': 'btc',
  'Ξ': 'eth',
}

const CURRENCY_PATTERN
  = /^\s*(?:([$€¥£₩₫฿₿Ξ]|[a-z]{3})\s*)?([-+]?(?:\d+(?:\.\d+)?|\.\d+))\s*(?:([a-z]{3})\s*)?(?:to|in|=|->)\s*([a-z]{3})\s*$/i

function normalizeCurrency(rawSymbol?: string, rawCode?: string): string | null {
  if (rawCode) {
    const code = rawCode.toLowerCase()
    if (CURRENCY_TABLE[code])
      return code
  }
  if (rawSymbol && SYMBOL_MAP[rawSymbol]) {
    return SYMBOL_MAP[rawSymbol]
  }
  return null
}

export class CurrencyPreviewAbility extends BasePreviewAbility {
  readonly id = 'preview.currency'
  readonly priority = 40

  override canHandle(query: { text?: string }): boolean {
    if (!query.text)
      return false
    return CURRENCY_PATTERN.test(query.text)
  }

  async execute(context: PreviewAbilityContext): Promise<PreviewAbilityResult | null> {
    const startedAt = performance.now()
    const text = this.getNormalizedQuery(context.query)
    const match = text.match(CURRENCY_PATTERN)
    if (!match)
      return null

    const [, symbol, amountRaw, sourceCode, targetCodeRaw] = match
    const amount = Number(amountRaw)
    if (Number.isNaN(amount))
      return null

    const source = normalizeCurrency(symbol, sourceCode) ?? 'usd'
    const target = normalizeCurrency(undefined, targetCodeRaw)
    if (!target || !CURRENCY_TABLE[source] || !CURRENCY_TABLE[target]) {
      return null
    }

    this.throwIfAborted(context.signal)

    const sourceRate = CURRENCY_TABLE[source].rate
    const targetRate = CURRENCY_TABLE[target].rate
    const usdValue = amount / sourceRate
    const converted = usdValue * targetRate

    const payload: PreviewCardPayload = {
      abilityId: this.id,
      title: `${amount} ${source.toUpperCase()} -> ${target.toUpperCase()}`,
      subtitle: '汇率换算（内部参考值）',
      primaryLabel: `${CURRENCY_TABLE[source].name} → ${CURRENCY_TABLE[target].name}`,
      primaryValue: converted.toFixed(4),
      secondaryLabel: '折合美元',
      secondaryValue: usdValue.toFixed(4),
      chips: [
        { label: '源汇率', value: `1 ${source.toUpperCase()} = ${(1 / sourceRate).toFixed(4)} USD` },
        { label: '目标汇率', value: `1 ${target.toUpperCase()} = ${(targetRate).toFixed(4)} USD` },
      ],
      sections: [
        {
          rows: [
            { label: '源金额', value: `${amount} ${source.toUpperCase()}` },
            { label: '目标金额', value: `${converted.toFixed(4)} ${target.toUpperCase()}` },
          ],
        },
      ],
    }

    return {
      abilityId: this.id,
      confidence: 0.7,
      payload,
      durationMs: performance.now() - startedAt,
    }
  }
}
