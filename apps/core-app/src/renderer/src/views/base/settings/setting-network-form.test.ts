import { describe, expect, it } from 'vitest'
import {
  createDefaultNetworkSettingsForm,
  splitBypassRules,
  toNetworkConfigUpdateRequest,
  toNetworkSettingsForm
} from './setting-network-form'

describe('setting-network-form', () => {
  it('maps network snapshots to editable settings form', () => {
    const form = toNetworkSettingsForm({
      proxy: {
        mode: 'custom',
        custom: {
          httpProxy: 'http://127.0.0.1:7890',
          httpsProxy: 'http://127.0.0.1:7890',
          socksProxy: 'socks5://127.0.0.1:7891',
          pacUrl: 'http://127.0.0.1/proxy.pac',
          bypass: ['localhost', '127.0.0.1']
        },
        authRef: 'secure://proxy/default'
      },
      timeoutMs: 30000,
      retry: {
        maxRetries: 4,
        baseDelayMs: 200,
        maxDelayMs: 3000,
        backoffFactor: 3,
        retryOnNetworkError: false,
        retryOnTimeout: true
      },
      cooldown: {
        failureThreshold: 2,
        cooldownMs: 10000,
        autoResetOnSuccess: false
      }
    })

    expect(form).toMatchObject({
      proxyMode: 'custom',
      httpProxy: 'http://127.0.0.1:7890',
      socksProxy: 'socks5://127.0.0.1:7891',
      bypassText: 'localhost\n127.0.0.1',
      authRef: 'secure://proxy/default',
      timeoutMs: 30000,
      maxRetries: 4,
      retryOnNetworkError: false,
      autoResetOnSuccess: false
    })
  })

  it('builds a sanitized network update request', () => {
    const form = {
      ...createDefaultNetworkSettingsForm(),
      proxyMode: 'custom' as const,
      httpProxy: ' http://127.0.0.1:7890 ',
      bypassText: 'localhost, 127.0.0.1\nlocalhost\n',
      authRef: 'secure://proxy/default',
      timeoutMs: 80,
      baseDelayMs: 1000,
      maxDelayMs: 200,
      backoffFactor: 0
    }

    const request = toNetworkConfigUpdateRequest(form)

    expect(request.proxy).toEqual({
      mode: 'custom',
      custom: {
        httpProxy: 'http://127.0.0.1:7890',
        // With `separateHttpsProxy` off the HTTP address is mirrored, so the stored config states
        // outright what HTTPS uses instead of leaving the main process to infer it from a blank.
        httpsProxy: 'http://127.0.0.1:7890',
        socksProxy: '',
        pacUrl: '',
        bypass: ['localhost', '127.0.0.1']
      },
      authRef: 'secure://proxy/default'
    })
    expect(request.timeoutMs).toBe(100)
    expect(request.retry?.maxDelayMs).toBe(1000)
    expect(request.retry?.backoffFactor).toBe(1)
  })

  it('keeps a distinct HTTPS address when the separate switch is on', () => {
    const request = toNetworkConfigUpdateRequest({
      ...createDefaultNetworkSettingsForm(),
      proxyMode: 'custom' as const,
      separateHttpsProxy: true,
      httpProxy: 'http://127.0.0.1:7890',
      httpsProxy: ' http://127.0.0.1:7891 '
    })

    expect(request.proxy?.custom?.httpsProxy).toBe('http://127.0.0.1:7891')
  })

  it('maps the instability switch onto the cooldown window', () => {
    const off = toNetworkConfigUpdateRequest({
      ...createDefaultNetworkSettingsForm(),
      pauseOnInstability: false
    })
    // Zero makes the guard's cooldown expire instantly, which is how "never pause" is expressed.
    expect(off.cooldown?.cooldownMs).toBe(0)

    const on = toNetworkConfigUpdateRequest({
      ...createDefaultNetworkSettingsForm(),
      pauseOnInstability: true,
      cooldownMs: 0
    })
    // A stored zero must not survive re-enabling, or the switch would report on while doing nothing.
    expect(on.cooldown?.cooldownMs).toBeGreaterThan(0)
  })

  it('treats an HTTPS address equal to HTTP as not separately configured', () => {
    const form = toNetworkSettingsForm({
      proxy: {
        mode: 'custom',
        custom: { httpProxy: 'http://127.0.0.1:7890', httpsProxy: 'http://127.0.0.1:7890' }
      }
    } as never)

    expect(form.separateHttpsProxy).toBe(false)
  })

  it('deduplicates bypass rules without reordering them', () => {
    expect(splitBypassRules('localhost\n*.local,localhost, 127.0.0.1')).toEqual([
      'localhost',
      '*.local',
      '127.0.0.1'
    ])
  })
})
