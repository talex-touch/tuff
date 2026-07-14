import { describe, expect, it } from 'vitest'
import { extractDeepAgentUsage } from './deepagent-engine'

describe('extractDeepAgentUsage', () => {
  it('normalizes root Responses API usage', () => {
    expect(extractDeepAgentUsage({
      usage: {
        input_tokens: 13,
        output_tokens: 8,
        total_tokens: 21,
      },
    })).toEqual({
      promptTokens: 13,
      completionTokens: 8,
      totalTokens: 21,
    })
  })

  it('sums direct and kwargs AIMessage usage once per message', () => {
    expect(extractDeepAgentUsage({
      messages: [
        {
          type: 'ai',
          usage_metadata: {
            input_tokens: 5,
            output_tokens: 2,
            total_tokens: 7,
          },
          kwargs: {
            usage_metadata: {
              input_tokens: 5,
              output_tokens: 2,
              total_tokens: 7,
            },
          },
        },
        {
          kwargs: {
            type: 'ai',
            usage_metadata: {
              input_tokens: 11,
              output_tokens: 4,
              total_tokens: 15,
            },
          },
        },
      ],
    })).toEqual({
      promptTokens: 16,
      completionTokens: 6,
      totalTokens: 22,
    })
  })

  it('normalizes response_metadata tokenUsage camel-case aliases', () => {
    expect(extractDeepAgentUsage({
      response_metadata: {
        tokenUsage: {
          promptTokens: 9,
          completionTokens: 4,
          totalTokens: 13,
        },
      },
    })).toEqual({
      promptTokens: 9,
      completionTokens: 4,
      totalTokens: 13,
    })
  })

  it.each([
    {
      name: 'usage is absent',
      payload: {},
    },
    {
      name: 'all usage values are malformed or negative',
      payload: {
        usage: {
          input_tokens: Number.NaN,
          output_tokens: -4,
          total_tokens: 'invalid',
        },
      },
    },
  ])('returns undefined when $name', ({ payload }) => {
    expect(extractDeepAgentUsage(payload)).toBeUndefined()
  })
})
