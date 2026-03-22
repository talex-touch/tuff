import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { settingsStore, mockDb } = vi.hoisted(() => {
  const settingsStore = new Map<string, string>()

  const mockDb = {
    prepare(sql: string) {
      let params: unknown[] = []
      return {
        bind(...args: unknown[]) {
          params = args
          return this
        },
        async first<T>() {
          if (/SELECT\s+value/i.test(sql)) {
            const key = String(params[0] || '')
            const value = settingsStore.get(key)
            if (value === undefined) {
              return null
            }
            return { value } as T
          }
          return null
        },
        async run() {
          if (/INSERT\s+INTO\s+pilot_admin_settings/i.test(sql)) {
            const key = String(params[0] || '')
            const value = String(params[1] || '')
            settingsStore.set(key, value)
          }
          return {}
        },
      }
    },
  }

  return {
    settingsStore,
    mockDb,
  }
})

vi.mock('../pilot-store', () => ({
  getPilotDatabase: vi.fn(() => mockDb as any),
  requirePilotDatabase: vi.fn(() => mockDb as any),
}))

import {
  getPilotWebsearchDatasourceConfig,
  resolveWebsearchProviderApiKey,
  toPilotWebsearchDatasourceView,
  updatePilotWebsearchDatasourceConfig,
} from '../pilot-admin-datasource-config'

const ENV_KEY = 'PILOT_CONFIG_ENCRYPTION_KEY'
const ENV_SNAPSHOT = process.env[ENV_KEY]

function createEvent() {
  return {
    context: {},
  } as any
}

describe('pilot-admin-datasource-config', () => {
  beforeEach(() => {
    settingsStore.clear()
    process.env[ENV_KEY] = '0123456789abcdef0123456789abcdef'
    delete process.env.PILOT_WEBSARCH_LEGACY_KEY
  })

  afterEach(() => {
    if (ENV_SNAPSHOT === undefined) {
      delete process.env[ENV_KEY]
    }
    else {
      process.env[ENV_KEY] = ENV_SNAPSHOT
    }
    delete process.env.PILOT_WEBSARCH_LEGACY_KEY
  })

  it('providers 为空时会从 legacy gateway 字段自动映射', async () => {
    settingsStore.set('datasource.websearch', JSON.stringify({
      providers: [],
      gatewayBaseUrl: 'https://legacy-gateway.example.com/',
      timeoutMs: 9_000,
      maxResults: 5,
      crawlEnabled: false,
    }))

    const config = await getPilotWebsearchDatasourceConfig(createEvent())

    expect(config.providers).toHaveLength(1)
    expect(config.providers[0]?.id).toBe('legacy-gateway')
    expect(config.providers[0]?.type).toBe('searxng')
    expect(config.providers[0]?.baseUrl).toBe('https://legacy-gateway.example.com')
    expect(config.providers[0]?.timeoutMs).toBe(9_000)
    expect(config.providers[0]?.maxResults).toBe(5)
  })

  it('provider key 保存时会加密，读取视图时返回 hasApiKey/apiKeyMasked', async () => {
    const event = createEvent()

    const updated = await updatePilotWebsearchDatasourceConfig(event, {
      providers: [
        {
          id: 'serper-backup',
          type: 'serper',
          enabled: true,
          priority: 20,
          baseUrl: 'https://google.serper.dev',
          apiKey: 'serper-secret-key',
          timeoutMs: 8_000,
          maxResults: 5,
        },
      ],
      aggregation: {
        mode: 'hybrid',
        targetResults: 5,
      },
      crawl: {
        enabled: true,
      },
    })

    const provider = updated.providers.find(item => item.id === 'serper-backup')
    expect(provider).toBeTruthy()
    expect(provider?.apiKeyEncrypted.startsWith('enc:v1:')).toBe(true)
    expect(resolveWebsearchProviderApiKey(provider!, updated.apiKeyRef)).toBe('serper-secret-key')

    const view = toPilotWebsearchDatasourceView(updated)
    const viewProvider = view.providers.find(item => item.id === 'serper-backup')
    expect(viewProvider?.hasApiKey).toBe(true)
    expect(viewProvider?.apiKeyMasked).toBe('serp...-key')

    expect(updated.gatewayBaseUrl).toBe('')
    expect(updated.apiKeyRef).toBe('')
  })

  it('provider key 支持留空不变与 clearApiKey 清空', async () => {
    const event = createEvent()

    await updatePilotWebsearchDatasourceConfig(event, {
      providers: [
        {
          id: 'tavily-backup',
          type: 'tavily',
          enabled: true,
          priority: 30,
          baseUrl: 'https://api.tavily.com',
          apiKey: 'tavily-key-1234',
          timeoutMs: 8_000,
          maxResults: 6,
        },
      ],
    })

    const kept = await updatePilotWebsearchDatasourceConfig(event, {
      providers: [
        {
          id: 'tavily-backup',
          type: 'tavily',
          enabled: true,
          priority: 30,
          baseUrl: 'https://api.tavily.com',
          timeoutMs: 8_000,
          maxResults: 6,
        },
      ],
    })

    const keptProvider = kept.providers.find(item => item.id === 'tavily-backup')
    expect(resolveWebsearchProviderApiKey(keptProvider!, kept.apiKeyRef)).toBe('tavily-key-1234')

    const cleared = await updatePilotWebsearchDatasourceConfig(event, {
      providers: [
        {
          id: 'tavily-backup',
          type: 'tavily',
          enabled: true,
          priority: 30,
          baseUrl: 'https://api.tavily.com',
          timeoutMs: 8_000,
          maxResults: 6,
          clearApiKey: true,
        },
      ],
    })

    const clearedProvider = cleared.providers.find(item => item.id === 'tavily-backup')
    expect(resolveWebsearchProviderApiKey(clearedProvider!, cleared.apiKeyRef)).toBe('')

    const view = toPilotWebsearchDatasourceView(cleared)
    const viewProvider = view.providers.find(item => item.id === 'tavily-backup')
    expect(viewProvider?.hasApiKey).toBe(false)
    expect(viewProvider?.apiKeyMasked).toBe('')
  })

  it('legacy provider 仍支持通过 apiKeyRef 环境变量解析 key', async () => {
    process.env.PILOT_WEBSARCH_LEGACY_KEY = 'legacy-secret-key'
    settingsStore.set('datasource.websearch', JSON.stringify({
      providers: [],
      gatewayBaseUrl: 'https://legacy-gateway.example.com',
      apiKeyRef: 'env:PILOT_WEBSARCH_LEGACY_KEY',
      timeoutMs: 8_000,
      maxResults: 6,
      crawlEnabled: true,
    }))

    const config = await getPilotWebsearchDatasourceConfig(createEvent())
    expect(config.providers[0]?.id).toBe('legacy-gateway')

    const view = toPilotWebsearchDatasourceView(config)
    expect(view.providers[0]?.hasApiKey).toBe(true)
    expect(view.providers[0]?.apiKeyMasked).toBe('lega...-key')
  })
})
