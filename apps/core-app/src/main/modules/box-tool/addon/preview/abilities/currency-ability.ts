import type { PreviewAbilityResult, PreviewCardPayload } from '@talex-touch/utils'
import type { PreviewAbilityContext } from '../preview-ability'
import { performance } from 'node:perf_hooks'
import { BasePreviewAbility } from '../preview-ability'
import { fxRateProvider } from '../providers'

// 货币名称映射
const CURRENCY_NAMES: Record<string, string> = {
  USD: '美元',
  CNY: '人民币',
  EUR: '欧元',
  JPY: '日元',
  GBP: '英镑',
  HKD: '港币',
  TWD: '新台币',
  KRW: '韩元',
  AUD: '澳元',
  CAD: '加元',
  SGD: '新加坡元',
  THB: '泰铢',
  VND: '越南盾',
  INR: '印度卢比',
  CHF: '瑞士法郎',
  BTC: '比特币',
  ETH: '以太坊'
}

const CURRENCY_PATTERN =
  /^\s*(?:([$€¥£₩₫฿₿Ξ]|[a-z]{3})\s*)?([-+]?(?:\d+(?:\.\d+)?|\.\d+))\s*(?:([a-z]{3})\s*)?(?:to|in|[=转换]|->)\s*([a-z\u4E00-\u9FA5]{2,})\s*$/i

export class CurrencyPreviewAbility extends BasePreviewAbility {
  readonly id = 'preview.currency'
  readonly priority = 40

  override canHandle(query: { text?: string }): boolean {
    if (!query.text) return false
    return CURRENCY_PATTERN.test(query.text)
  }

  async execute(context: PreviewAbilityContext): Promise<PreviewAbilityResult | null> {
    const startedAt = performance.now()
    const text = this.getNormalizedQuery(context.query)
    const match = text.match(CURRENCY_PATTERN)
    if (!match) return null

    const [, symbol, amountRaw, sourceCode, targetCodeRaw] = match
    const amount = Number(amountRaw)
    if (Number.isNaN(amount)) return null

    // Normalize currencies using FxRateProvider
    const sourceInput = sourceCode || symbol || 'USD'
    const source = fxRateProvider.normalizeCurrency(sourceInput)
    const target = fxRateProvider.normalizeCurrency(targetCodeRaw)

    if (!source || !target) {
      return null
    }

    this.throwIfAborted(context.signal)

    // Get conversion result from provider
    const conversion = fxRateProvider.convert(amount, source, target)
    if (!conversion || !conversion.rate) {
      return null
    }

    const { result: converted, rate } = conversion
    const status = fxRateProvider.getStatus()

    // Get USD equivalent
    const usdConversion = fxRateProvider.convert(amount, source, 'USD')
    const usdValue = usdConversion?.result ?? amount

    const sourceName = CURRENCY_NAMES[source] || source
    const targetName = CURRENCY_NAMES[target] || target

    // Format update time
    const updateTime = new Date(status.lastRefresh).toLocaleString('zh-CN')
    const subtitle = status.isStale
      ? `汇率换算 ⚠️ 数据较旧 (${updateTime})`
      : `汇率换算 · ${status.source === 'ecb' ? 'ECB' : '内置'} · ${updateTime}`

    const payload: PreviewCardPayload = {
      abilityId: this.id,
      title: `${amount} ${source} → ${target}`,
      subtitle,
      primaryLabel: `${sourceName} → ${targetName}`,
      primaryValue: converted.toFixed(4),
      secondaryLabel: '折合美元',
      secondaryValue: usdValue.toFixed(4),
      chips: [
        { label: '汇率', value: `1 ${source} = ${rate.rate.toFixed(6)} ${target}` },
        { label: '数据源', value: status.source.toUpperCase() }
      ],
      sections: [
        {
          rows: [
            { label: '源金额', value: `${amount} ${source}` },
            { label: '目标金额', value: `${converted.toFixed(4)} ${target}` }
          ]
        }
      ]
    }

    return {
      abilityId: this.id,
      confidence: 0.75,
      payload,
      durationMs: performance.now() - startedAt
    }
  }
}
