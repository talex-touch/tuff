import { describe, expect, it } from 'vitest'
import {
  buildPilotRedactedRoutingTracePayload,
  redactPilotClientErrorDetail,
  shouldHidePilotClientRuntimeEvent,
} from '../../../shared/pilot-runtime-redaction'

describe('pilot-runtime-redaction', () => {
  it('routing trace 仅保留脱敏摘要', () => {
    const payload = buildPilotRedactedRoutingTracePayload({
      intentType: 'search',
      internet: true,
      thinking: true,
      memoryEnabled: false,
      memoryHistoryMessageCount: 7,
      builtinTools: ['web_search', 'file_search'],
    })

    expect(payload).toEqual({
      redacted: true,
      resolved: true,
      intentType: 'search',
      internet: true,
      thinking: true,
      memoryEnabled: false,
      memoryHistoryMessageCount: 7,
      builtinToolsCount: 2,
    })
    expect(payload).not.toHaveProperty('channelId')
    expect(payload).not.toHaveProperty('providerModel')
  })

  it('error detail 会移除路由敏感字段', () => {
    const detail = redactPilotClientErrorDetail({
      code: 'PILOT_STREAM_ERROR',
      reason: 'provider_unavailable',
      status_code: 503,
      channel_id: 'route-a',
      route_combo_id: 'default-auto',
      provider_model: 'gpt-5.4',
      selection_reason: 'lb_weight',
    })

    expect(detail).toEqual({
      code: 'PILOT_STREAM_ERROR',
      reason: 'provider_unavailable',
      status_code: 503,
    })
  })

  it('routing.selected 默认对前端隐藏', () => {
    expect(shouldHidePilotClientRuntimeEvent('routing.selected')).toBe(true)
    expect(shouldHidePilotClientRuntimeEvent('intent.completed')).toBe(false)
  })
})
