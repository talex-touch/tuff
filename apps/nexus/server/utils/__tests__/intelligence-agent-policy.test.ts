import { describe, expect, it, vi } from 'vitest'
import { isRetryableInvokeError } from '../tuffIntelligenceLabService'

vi.mock('nitropack/runtime/internal/storage', () => ({
  useStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
  }),
}))

describe('intelligence invoke retry policy', () => {
  it('超时错误识别为可重试', () => {
    expect(isRetryableInvokeError(new Error('Request timeout after 30000ms'))).toBe(true)
  })

  it('4xx 参数错误不重试', () => {
    const error = Object.assign(new Error('Invalid request body'), { status: 400 })
    expect(isRetryableInvokeError(error)).toBe(false)
  })
})
