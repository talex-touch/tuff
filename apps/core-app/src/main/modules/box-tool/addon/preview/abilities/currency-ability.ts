import type { PreviewAbilityResult, PreviewCardPayload } from '@talex-touch/utils'
import type { PreviewAbilityContext } from '../preview-ability'
import { performance } from 'node:perf_hooks'
import { BasePreviewAbility } from '../preview-ability'
import { fxRateProvider } from '../providers'
import {
  COREBOX_FX_CONVERT_SCENE_ID,
  COREBOX_FX_LATEST_SCENE_ID
} from '../../../../../../shared/events/corebox-scenes'
import {
  extractFxConvertFromSceneRun,
  extractFxRateSnapshotFromSceneRun,
  runNexusScene
} from '../../../../nexus/scene-client'

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
const NEXUS_FX_TIMEOUT_MS = 2_500

type CurrencyConversionResult = {
  result: number
  rate: {
    base: string
    quote: string
    rate: number
    updatedAt: number
    source: string
  }
  sourceLabel: string
  isStale: boolean
}

function parseSceneTimestamp(value?: string | null): number {
  if (!value) return Date.now()
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : Date.now()
}

function normalizeCurrencyInput(input: string): string | null {
  const normalized = fxRateProvider.normalizeCurrency(input)
  if (normalized) return normalized

  const code = input.trim().toUpperCase()
  return /^[A-Z]{3}$/.test(code) ? code : null
}

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
    const source = normalizeCurrencyInput(sourceInput)
    const target = normalizeCurrencyInput(targetCodeRaw)

    if (!source || !target) {
      return null
    }

    this.throwIfAborted(context.signal)

    const conversion = await this.convertWithNexusFallback(amount, source, target)
    if (!conversion) {
      return null
    }

    const { result: converted, rate } = conversion
    const status = {
      lastRefresh: rate.updatedAt,
      source: rate.source,
      isStale: conversion.isStale
    }

    // Get USD equivalent
    const usdConversion = fxRateProvider.convert(amount, source, 'USD')
    const usdValue = usdConversion?.result ?? amount

    const sourceName = CURRENCY_NAMES[source] || source
    const targetName = CURRENCY_NAMES[target] || target

    // Format update time
    const updateTime = new Date(status.lastRefresh).toLocaleString('zh-CN')
    const sourceLabel =
      conversion.sourceLabel ||
      (status.source === 'nexus' ? 'Nexus' : status.source === 'ecb' ? 'ECB' : '内置')
    const subtitle = status.isStale
      ? `汇率换算 ⚠️ 数据较旧 (${updateTime})`
      : `汇率换算 · ${sourceLabel} · ${updateTime}`

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

  private async convertWithNexusFallback(
    amount: number,
    source: string,
    target: string
  ): Promise<CurrencyConversionResult | null> {
    if (source === 'USD') {
      const nexusConversion = await this.tryNexusConvert(amount, target)
      if (nexusConversion) {
        return nexusConversion
      }
    } else {
      await this.tryApplyNexusLatestRates()
    }

    const localConversion = fxRateProvider.convert(amount, source, target)
    if (!localConversion?.rate) {
      return null
    }
    const status = fxRateProvider.getStatus()
    return {
      result: localConversion.result,
      rate: localConversion.rate,
      sourceLabel: status.source === 'nexus' ? 'Nexus' : status.source === 'ecb' ? 'ECB' : '内置',
      isStale: status.isStale
    }
  }

  private async tryNexusConvert(
    amount: number,
    target: string
  ): Promise<CurrencyConversionResult | null> {
    const fx = await runNexusScene(COREBOX_FX_CONVERT_SCENE_ID, {
      input: {
        base: 'USD',
        target,
        amount
      },
      capability: 'fx.convert',
      timeoutMs: NEXUS_FX_TIMEOUT_MS
    })
      .then(extractFxConvertFromSceneRun)
      .catch(() => null)
    if (!fx) {
      return null
    }

    const updatedAt = parseSceneTimestamp(fx.providerUpdatedAt ?? fx.updatedAt ?? fx.fetchedAt)
    return {
      result: fx.converted,
      rate: {
        base: fx.base,
        quote: fx.target,
        rate: fx.rate,
        updatedAt,
        source: 'nexus'
      },
      sourceLabel: 'Nexus',
      isStale: false
    }
  }

  private async tryApplyNexusLatestRates(): Promise<void> {
    const snapshot = await runNexusScene(COREBOX_FX_LATEST_SCENE_ID, {
      capability: 'fx.rate.latest',
      timeoutMs: NEXUS_FX_TIMEOUT_MS
    })
      .then(extractFxRateSnapshotFromSceneRun)
      .catch(() => null)
    if (!snapshot) {
      return
    }

    fxRateProvider.applyExternalRates({
      base: snapshot.base,
      rates: snapshot.rates,
      fetchedAt: parseSceneTimestamp(snapshot.fetchedAt ?? snapshot.asOf),
      providerUpdatedAt:
        snapshot.providerUpdatedAt === null
          ? null
          : parseSceneTimestamp(snapshot.providerUpdatedAt ?? snapshot.asOf),
      source: 'nexus'
    })
  }
}
