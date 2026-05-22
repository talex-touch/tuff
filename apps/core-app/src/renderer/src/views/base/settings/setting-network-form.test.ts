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
        httpsProxy: '',
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

  it('deduplicates bypass rules without reordering them', () => {
    expect(splitBypassRules('localhost\n*.local,localhost, 127.0.0.1')).toEqual([
      'localhost',
      '*.local',
      '127.0.0.1'
    ])
  })
})
