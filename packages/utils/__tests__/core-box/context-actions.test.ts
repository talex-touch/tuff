import { describe, expect, it } from 'vitest'
import {
  createCoreBoxContextActionsOpenRequest,
  getContextActionInput,
  isContextActionQuery,
  normalizeContextActionInput,
  normalizeCoreBoxContextActionsOpenRequest,
  toContextActionQuery
} from '../../core-box/context-actions'

const capturedAt = 1_752_486_400_000

describe('Context Actions shared contract', () => {
  it('round-trips selected text without moving sensitive content into query context metadata', () => {
    const input = normalizeContextActionInput({
      type: 'text',
      source: 'selected-text',
      content: 'const answer = 42',
      capturedAt,
      available: true,
      diagnostic: {
        supportLevel: 'best_effort',
        issueCode: 'SIMULATED_COPY'
      }
    })

    expect(input).not.toBeNull()
    const request = createCoreBoxContextActionsOpenRequest('context-session-1', input!)
    const query = toContextActionQuery(request)

    expect(isContextActionQuery(query)).toBe(true)
    expect(query.context.contextAction).not.toHaveProperty('content')
    expect(query.inputs).toEqual([{ type: 'text', content: 'const answer = 42' }])
    expect(getContextActionInput(query)).toEqual(input)
  })

  it('accepts an unavailable empty selection only with typed diagnostics', () => {
    const input = normalizeContextActionInput({
      type: 'text',
      source: 'selected-text',
      content: '',
      capturedAt,
      available: false,
      diagnostic: {
        supportLevel: 'unsupported',
        issueCode: 'PLATFORM_UNSUPPORTED',
        issueMessage: 'Selection capture is unsupported.'
      }
    })

    expect(input).toMatchObject({
      type: 'text',
      available: false,
      content: '',
      diagnostic: { issueCode: 'PLATFORM_UNSUPPORTED' }
    })
    const query = toContextActionQuery(
      createCoreBoxContextActionsOpenRequest('context-session-empty', input!)
    )
    expect(getContextActionInput(query)).toEqual(input)
  })

  it('rejects malformed image payloads and mismatched event metadata', () => {
    expect(
      normalizeContextActionInput({
        type: 'image',
        source: 'clipboard-image',
        content: 'not-a-data-url',
        mimeType: 'image/png',
        capturedAt,
        available: true
      })
    ).toBeNull()

    const input = normalizeContextActionInput({
      type: 'image',
      source: 'clipboard-image',
      content: 'data:image/png;base64,aW1hZ2U=',
      mimeType: 'image/png',
      capturedAt,
      available: true
    })!
    const request = createCoreBoxContextActionsOpenRequest('context-session-image', input)

    expect(
      normalizeCoreBoxContextActionsOpenRequest({
        ...request,
        context: { ...request.context, source: 'selected-text' }
      })
    ).toBeNull()
    expect(normalizeCoreBoxContextActionsOpenRequest(request)).toEqual(request)
  })
})
