import { describe, expect, it } from 'vitest'
import { buildPilotSseResponseHeaders } from '../pilot-sse-response'

describe('pilot-sse-response', () => {
  it('chat stream 响应头包含 anti-buffer 配置', () => {
    const headers = buildPilotSseResponseHeaders()

    expect(headers['Content-Type']).toBe('text/event-stream; charset=utf-8')
    expect(headers['Cache-Control']).toBe('no-cache, no-transform')
    expect(headers.Connection).toBe('keep-alive')
    expect(headers['X-Accel-Buffering']).toBe('no')
  })
})
