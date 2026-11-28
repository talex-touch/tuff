import type {
  PreviewAbilityResult,
  PreviewAbilitySafetyPolicy,
  PreviewCardPayload
} from '@talex-touch/utils'
import type { PreviewAbilityContext } from '../preview-ability'
import { performance } from 'node:perf_hooks'
import { i18nMsg, i18nMsgWithParams } from '@talex-touch/utils/i18n'
import { BasePreviewAbility } from '../preview-ability'
import { fxRateProvider } from '../providers'
import {
  COREBOX_FX_CONVERT_SCENE_ID,
  COREBOX_FX_LATEST_SCENE_ID
} from '../../../../../../shared/events/corebox-scenes'
import {
  extractBoxToolFxConvertFromSceneRun,
  extractBoxToolFxRateSnapshotFromSceneRun,
  runBoxToolCloudScene
} from '../../../ports/cloud-scene-port'

// 有本地化名称（previewCard.currency.names）的货币；其余显示代码
const NAMED_CURRENCIES = new Set([
  'USD',
  'CNY',
  'EUR',
  'JPY',
  'GBP',
  'HKD',
  'TWD',
  'KRW',
  'AUD',
  'CAD',
  'SGD',
  'THB',
  'VND',
  'INR',
  'CHF',
  'BTC',
  'ETH'
])

function currencyName(code: string): string {
  return NAMED_CURRENCIES.has(code) ? i18nMsg(`previewCard.currency.names.${code}`) : code
}

const BUILT_IN_SOURCE_LABEL = i18nMsg('previewCard.currency.builtIn')

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
  readonly label = 'Currency'
  readonly priority = 40
  override readonly safety: PreviewAbilitySafetyPolicy = {
    input: {
      maxLength: 120,
      syntax: 'currency amount conversion, e.g. 10 USD to CNY',
      notes:
        'CoreApp adapter remains responsible for Nexus Scene fallback and local FxRateProvider cache.'
    },
    dependencies: ['parser', 'network', 'cache'],
    usesDynamicExecution: false,
    usesNetwork: true,
    usesCache: true,
    replacementPlan:
      'Keep in CoreApp adapter until Nexus Scene fallback, local fx cache and timeout policy are split behind SDK-safe interfaces.'
  }

  override canHandle(query: { text?: string }): boolean {
    if (!query.text || query.text.length > this.safety.input.maxLength) return false
    return CURRENCY_PATTERN.test(query.text)
  }

  async execute(context: PreviewAbilityContext): Promise<PreviewAbilityResult | null> {
    const startedAt = performance.now()
    const text = this.getNormalizedQuery(context.query)
    if (!this.isInputWithinLimit(context)) return null
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

    // Format update time
    const updateTime = new Date(status.lastRefresh).toLocaleString(context.locale ?? 'zh-CN')
    const sourceLabel =
      conversion.sourceLabel ||
      (status.source === 'nexus'
        ? 'Nexus'
        : status.source === 'ecb'
          ? 'ECB'
          : BUILT_IN_SOURCE_LABEL)
    const subtitle = status.isStale
      ? i18nMsgWithParams('previewCard.currency.subtitleStale', { time: updateTime })
      : i18nMsgWithParams('previewCard.currency.subtitle', {
          source: sourceLabel,
          time: updateTime
        })

    const payload: PreviewCardPayload = {
      abilityId: this.id,
      title: `${amount} ${source} → ${target}`,
      subtitle,
      primaryLabel: i18nMsgWithParams('previewCard.common.conversion', {
        from: currencyName(source),
        to: currencyName(target)
      }),
      primaryValue: converted.toFixed(4),
      secondaryLabel: i18nMsg('previewCard.currency.inUsd'),
      secondaryValue: usdValue.toFixed(4),
      chips: [
        {
          label: i18nMsg('previewCard.currency.rate'),
          value: `1 ${source} = ${rate.rate.toFixed(6)} ${target}`
        },
        { label: i18nMsg('previewCard.currency.source'), value: status.source.toUpperCase() }
      ],
      sections: [
        {
          rows: [
            { label: i18nMsg('previewCard.currency.sourceAmount'), value: `${amount} ${source}` },
            {
              label: i18nMsg('previewCard.currency.targetAmount'),
              value: `${converted.toFixed(4)} ${target}`
            }
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
      sourceLabel:
        status.source === 'nexus'
          ? 'Nexus'
          : status.source === 'ecb'
            ? 'ECB'
            : BUILT_IN_SOURCE_LABEL,
      isStale: status.isStale
    }
  }

  private async tryNexusConvert(
    amount: number,
    target: string
  ): Promise<CurrencyConversionResult | null> {
    const fx = await runBoxToolCloudScene(COREBOX_FX_CONVERT_SCENE_ID, {
      input: {
        base: 'USD',
        target,
        amount
      },
      capability: 'fx.convert',
      timeoutMs: NEXUS_FX_TIMEOUT_MS
    })
      .then(extractBoxToolFxConvertFromSceneRun)
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
    const snapshot = await runBoxToolCloudScene(COREBOX_FX_LATEST_SCENE_ID, {
      capability: 'fx.rate.latest',
      timeoutMs: NEXUS_FX_TIMEOUT_MS
    })
      .then(extractBoxToolFxRateSnapshotFromSceneRun)
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
