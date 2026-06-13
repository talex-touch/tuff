import type {
  CapabilityTestResult,
  IntelligenceInvokeResult,
  IntelligenceUsageInfo
} from '@talex-touch/tuff-intelligence'

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
    signals.push('调用失败')
    return {
      status: 'unstable',
      score,
      summary: '测试调用未成功，当前渠道或模型不可作为稳定路径。',
      signals
    }
  }

  if (params.latency > 15_000) {
    score -= 35
    signals.push(`耗时较高（${params.latency}ms）`)
  } else if (params.latency > 8_000) {
    score -= 18
    signals.push(`耗时偏高（${params.latency}ms）`)
  } else {
    signals.push(`耗时正常（${params.latency}ms）`)
  }

  if (typeof params.tokensPerSecond === 'number') {
    if (params.tokensPerSecond < 5) {
      score -= 22
      signals.push(`Token 速度偏低（${params.tokensPerSecond}/s）`)
    } else if (params.tokensPerSecond < 15) {
      score -= 10
      signals.push(`Token 速度一般（${params.tokensPerSecond}/s）`)
    } else {
      signals.push(`Token 速度良好（${params.tokensPerSecond}/s）`)
    }
  } else {
    score -= 6
    signals.push('未返回可计算的 token 速度')
  }

  if (!params.textPreview?.trim()) {
    score -= 18
    signals.push('响应内容为空或不可展示')
  }

  const normalizedScore = Math.max(0, Math.min(100, score))
  if (normalizedScore >= 80) {
    return {
      status: 'stable',
      score: normalizedScore,
      summary: '本次测试响应稳定，耗时和输出质量符合预期。',
      signals
    }
  }

  if (normalizedScore >= 55) {
    return {
      status: 'slow',
      score: normalizedScore,
      summary: '本次测试可用，但延迟或 token 速度存在优化空间。',
      signals
    }
  }

  return {
    status: 'unstable',
    score: normalizedScore,
    summary: '本次测试表现不稳定，建议检查渠道网络、模型配置或限流状态。',
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
