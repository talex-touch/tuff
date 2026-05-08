import { describe, expect, it } from 'vitest'
import { createTitleSseResponse } from '../pilot-executor-utils'

async function readResponseText(response: Response): Promise<string> {
  return await response.text()
}

describe('pilot-executor-utils', () => {
  it('title SSE emits completion chunks without retired status events', async () => {
    const response = createTitleSseResponse('abcdefghi')
    const text = await readResponseText(response)

    expect(response.headers.get('content-type')).toBe('text/event-stream; charset=utf-8')
    expect(text).toContain('"event":"completion"')
    expect(text).toContain('[DONE]')
    expect(text).not.toContain('status_updated')
  })
})
