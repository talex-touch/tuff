import type {
  CapabilityTestResult,
  IntelligenceInvokeResult,
  IntelligenceUsageInfo
} from '@talex-touch/tuff-intelligence'
import { t } from '../../../utils/i18n-helper'

export interface CapabilityTestPayload {
  providerId?: string
  userInput?: string
  [key: string]: unknown
}

export interface CapabilityTestContext {
  capabilityId: string
  providerId?: string
  allowedProviderIds?: string[]
  modelPreference?: string[]
}

type FormattedCapabilityTestResult = Omit<CapabilityTestResult, 'timestamp'>

function hasTokenUsage(usage: IntelligenceUsageInfo): boolean {
  return usage.promptTokens > 0 || usage.completionTokens > 0 || usage.totalTokens > 0
}

function resolveTokensPerSecond(usage: IntelligenceUsageInfo, latency: number): number | undefined {
  if (latency <= 0) return undefined
  const generatedTokens = usage.completionTokens || usage.totalTokens
  if (generatedTokens <= 0) return undefined
  return Number((generatedTokens / (latency / 1000)).toFixed(2))
}

function analyzeStability(params: {
  success: boolean
  latency: number
  tokensPerSecond?: number
  textPreview?: string
}): NonNullable<CapabilityTestResult['stability']> {
  const signals: string[] = []
  let score = params.success ? 100 : 0

  if (!params.success) {
    signals.push(t('intelligence.capabilityTest.signal.failed'))
    return {
      status: 'unstable',
      score,
      summary: t('intelligence.capabilityTest.summary.failed'),
      signals
    }
  }

  if (params.latency > 15_000) {
    score -= 35
    signals.push(t('intelligence.capabilityTest.signal.latencyHigh', { latency: params.latency }))
  } else if (params.latency > 8_000) {
    score -= 18
    signals.push(
      t('intelligence.capabilityTest.signal.latencyElevated', { latency: params.latency })
    )
  } else {
    signals.push(t('intelligence.capabilityTest.signal.latencyNormal', { latency: params.latency }))
  }

  if (typeof params.tokensPerSecond === 'number') {
    if (params.tokensPerSecond < 5) {
      score -= 22
      signals.push(
        t('intelligence.capabilityTest.signal.tokenSpeedLow', { speed: params.tokensPerSecond })
      )
    } else if (params.tokensPerSecond < 15) {
      score -= 10
      signals.push(
        t('intelligence.capabilityTest.signal.tokenSpeedFair', { speed: params.tokensPerSecond })
      )
    } else {
      signals.push(
        t('intelligence.capabilityTest.signal.tokenSpeedGood', { speed: params.tokensPerSecond })
      )
    }
  } else {
    score -= 6
    signals.push(t('intelligence.capabilityTest.signal.tokenSpeedMissing'))
  }

  if (!params.textPreview?.trim()) {
    score -= 18
    signals.push(t('intelligence.capabilityTest.signal.emptyResponse'))
  }

  const normalizedScore = Math.max(0, Math.min(100, score))
  if (normalizedScore >= 80) {
    return {
      status: 'stable',
      score: normalizedScore,
      summary: t('intelligence.capabilityTest.summary.stable'),
      signals
    }
  }

  if (normalizedScore >= 55) {
    return {
      status: 'slow',
      score: normalizedScore,
      summary: t('intelligence.capabilityTest.summary.slow'),
      signals
    }
  }

  return {
    status: 'unstable',
    score: normalizedScore,
    summary: t('intelligence.capabilityTest.summary.unstable'),
    signals
  }
}

export abstract class BaseCapabilityTester<TPayload = unknown, TResult = unknown> {
  abstract readonly capabilityType: string

  /**
   * 生成测试 payload
   */
  abstract generateTestPayload(input: CapabilityTestPayload): Promise<TPayload>

  /**
   * 格式化测试结果用于展示
   */
  abstract formatTestResult(
    result: IntelligenceInvokeResult<TResult>
  ): FormattedCapabilityTestResult

  protected buildTestResult(
    result: IntelligenceInvokeResult<TResult>,
    options: {
      message: string
      textPreview?: string
      success?: boolean
    }
  ): FormattedCapabilityTestResult {
    const success = options.success ?? true
    const tokensPerSecond = resolveTokensPerSecond(result.usage, result.latency)
    const usage = hasTokenUsage(result.usage) ? result.usage : undefined

    return {
      success,
      message: options.message,
      provider: result.provider,
      model: result.model,
      latency: result.latency,
      stability: analyzeStability({
        success,
        latency: result.latency,
        tokensPerSecond,
        textPreview: options.textPreview
      }),
      ...(options.textPreview ? { textPreview: options.textPreview } : {}),
      ...(usage ? { usage } : {}),
      ...(typeof tokensPerSecond === 'number' ? { tokensPerSecond } : {}),
      ...(result.reasoning ? { reasoning: result.reasoning } : {})
    }
  }

  /**
   * 获取默认测试输入提示
   */
  abstract getDefaultInputHint(): string

  /**
   * 是否需要用户输入
   */
  abstract requiresUserInput(): boolean
}
