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

const ENV_KEY = 'PILOT_CONFIG_ENCRYPTION_KEY'
const ENV_SNAPSHOT = process.env[ENV_KEY]

function createEvent() {
  return {
    context: {},
  } as any
}

async function loadTarget() {
  return await import('../pilot-admin-channel-config')
}

describe('pilot-admin-channel-config', () => {
  beforeEach(() => {
    settingsStore.clear()
    process.env[ENV_KEY] = '0123456789abcdef0123456789abcdef'
  })

  afterEach(() => {
    if (ENV_SNAPSHOT === undefined) {
      delete process.env[ENV_KEY]
    }
    else {
      process.env[ENV_KEY] = ENV_SNAPSHOT
    }
  })

  it('channel enabled=false 可持久化保存', async () => {
    const { getPilotAdminChannelCatalog, updatePilotAdminChannelCatalog } = await loadTarget()
    const event = createEvent()

    await updatePilotAdminChannelCatalog(event, {
      channels: [
        {
          id: 'channel-main',
          name: 'Main',
          baseUrl: 'https://api.openai.com/v1',
          apiKey: 'sk-test-main',
          model: 'gpt-5.2',
          enabled: true,
        },
      ],
    })

    const updated = await updatePilotAdminChannelCatalog(event, {
      channels: [
        {
          id: 'channel-main',
          enabled: false,
        },
      ],
    })

    expect(updated.channels).toHaveLength(1)
    expect(updated.channels[0]?.enabled).toBe(false)

    const reloaded = await getPilotAdminChannelCatalog(event)
    expect(reloaded.channels[0]?.enabled).toBe(false)
  })

  it('channel model enabled=false 可持久化保存', async () => {
    const { getPilotAdminChannelCatalog, updatePilotAdminChannelCatalog } = await loadTarget()
    const event = createEvent()

    const updated = await updatePilotAdminChannelCatalog(event, {
      channels: [
        {
          id: 'channel-main',
          name: 'Main',
          baseUrl: 'https://api.openai.com/v1',
          apiKey: 'sk-test-main',
          model: 'gpt-5.2',
          defaultModelId: 'gpt-5.2',
          models: [
            {
              id: 'gpt-5.2',
              enabled: false,
              thinkingSupported: false,
              thinkingDefaultEnabled: false,
            },
          ],
        },
      ],
    })

    expect(updated.channels[0]?.models?.[0]?.enabled).toBe(false)
    expect(updated.channels[0]?.models?.[0]?.thinkingSupported).toBe(false)
    expect(updated.channels[0]?.models?.[0]?.thinkingDefaultEnabled).toBe(false)

    const reloaded = await getPilotAdminChannelCatalog(event)
    expect(reloaded.channels[0]?.models?.[0]?.enabled).toBe(false)
    expect(reloaded.channels[0]?.models?.[0]?.thinkingSupported).toBe(false)
    expect(reloaded.channels[0]?.models?.[0]?.thinkingDefaultEnabled).toBe(false)
  })
})
