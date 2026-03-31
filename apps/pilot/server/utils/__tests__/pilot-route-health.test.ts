import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildRouteKey,
  isRouteHealthy,
  markRouteFailure,
  markRouteSuccess,
} from '../pilot-route-health'

describe('pilot-route-health', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  it('keeps route healthy before reaching failure threshold', () => {
    const routeKey = buildRouteKey('channel-a', 'gpt-5.4')
    const policy = {
      failureThreshold: 3,
      cooldownMs: 10_000,
      halfOpenProbeCount: 1,
    }

    expect(isRouteHealthy(routeKey, policy).healthy).toBe(true)
    markRouteFailure(routeKey, policy)
    expect(isRouteHealthy(routeKey, policy).healthy).toBe(true)
    markRouteFailure(routeKey, policy)
    expect(isRouteHealthy(routeKey, policy).healthy).toBe(true)
    markRouteSuccess(routeKey)
    expect(isRouteHealthy(routeKey, policy).state).toBe('closed')
  })

  it('opens route after threshold and allows half-open probe after cooldown', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-17T00:00:00.000Z'))

    const routeKey = buildRouteKey('channel-b', 'gemini-3-pro')
    const policy = {
      failureThreshold: 2,
      cooldownMs: 5_000,
      halfOpenProbeCount: 1,
    }

    markRouteFailure(routeKey, policy)
    markRouteFailure(routeKey, policy)

    expect(isRouteHealthy(routeKey, policy)).toEqual({
      healthy: false,
      state: 'open',
    })

    vi.advanceTimersByTime(5_100)

    const halfOpen = isRouteHealthy(routeKey, policy)
    expect(halfOpen.healthy).toBe(true)
    expect(halfOpen.state).toBe('half-open')

    const secondProbe = isRouteHealthy(routeKey, policy)
    expect(secondProbe.healthy).toBe(true)
    expect(secondProbe.state).toBe('half-open')

    markRouteSuccess(routeKey)
    expect(isRouteHealthy(routeKey, policy)).toEqual({
      healthy: true,
      state: 'closed',
    })
  })

  it('不同 providerTargetType 会生成不同 routeKey', () => {
    const botKey = buildRouteKey('channel-coze', 'target_shared', 'coze_bot')
    const workflowKey = buildRouteKey('channel-coze', 'target_shared', 'coze_workflow')

    expect(botKey).not.toBe(workflowKey)
    expect(botKey).toContain('coze_bot')
    expect(workflowKey).toContain('coze_workflow')
  })
})
