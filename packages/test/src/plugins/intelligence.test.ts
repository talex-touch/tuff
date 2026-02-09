import { describe, expect, it } from 'vitest'
import { loadPluginModule } from './plugin-loader'

const intelligencePlugin = loadPluginModule(new URL('../../../../plugins/touch-intelligence/index.js', import.meta.url))
const { __test: intelligenceTest } = intelligencePlugin

describe('intelligence plugin', () => {
  it('normalizes prompt with ai prefix', () => {
    expect(intelligenceTest.normalizePrompt('ai 帮我写总结')).toBe('帮我写总结')
    expect(intelligenceTest.normalizePrompt('/ai: explain this code')).toBe('explain this code')
    expect(intelligenceTest.normalizePrompt('智能，今天做啥')).toBe('今天做啥')
  })

  it('builds invoke payload', () => {
    const payload = intelligenceTest.buildInvokePayload('hello')
    expect(Array.isArray(payload.messages)).toBe(true)
    expect(payload.messages[1]?.content).toBe('hello')
  })

  it('maps invoke result', () => {
    const mapped = intelligenceTest.mapInvokeResult(
      {
        result: '  你好，这是回答  ',
        provider: ' openai ',
        model: ' gpt-4.1 ',
      },
      '测试问题',
      'req-1',
    )

    expect(mapped.requestId).toBe('req-1')
    expect(mapped.prompt).toBe('测试问题')
    expect(mapped.answer).toBe('你好，这是回答')
    expect(mapped.provider).toBe('openai')
    expect(mapped.model).toBe('gpt-4.1')
  })
})
