import type { AiInvokeResult } from '@talex-touch/utils'

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

export abstract class BaseCapabilityTester<TPayload = unknown, TResult = unknown> {
  abstract readonly capabilityType: string

  /**
   * 生成测试 payload
   */
  abstract generateTestPayload(input: CapabilityTestPayload): Promise<TPayload>

  /**
   * 格式化测试结果用于展示
   */
  abstract formatTestResult(result: AiInvokeResult<TResult>): {
    success: boolean
    message: string
    textPreview?: string
    provider: string
    model: string
    latency: number
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
