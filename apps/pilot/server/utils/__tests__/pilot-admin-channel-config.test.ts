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

  it('coze 渠道会自动填充中国区默认地址并保留旧 secret', async () => {
    const { getPilotAdminChannelCatalog, updatePilotAdminChannelCatalog } = await loadTarget()
    const event = createEvent()

    const created = await updatePilotAdminChannelCatalog(event, {
      channels: [
        {
          id: 'channel-coze-main',
          name: 'Coze Main',
          adapter: 'coze',
          oauthClientId: 'client_id_v1',
          oauthClientSecret: 'client_secret_v1',
          models: [
            {
              id: 'target_bot_1',
              targetType: 'coze_bot',
              enabled: true,
            },
          ],
        },
      ],
    })

    expect(created.channels[0]).toMatchObject({
      id: 'channel-coze-main',
      adapter: 'coze',
      cozeAuthMode: 'oauth_client',
      baseUrl: 'https://api.coze.cn',
      oauthTokenUrl: 'https://api.coze.cn/api/permission/oauth2/token',
      oauthClientId: 'client_id_v1',
      oauthClientSecret: 'client_secret_v1',
      model: '',
      defaultModelId: '',
    })

    const updated = await updatePilotAdminChannelCatalog(event, {
      channels: [
        {
          id: 'channel-coze-main',
          adapter: 'coze',
          oauthClientId: 'client_id_v2',
          oauthClientSecret: '',
        },
      ],
    })

    expect(updated.channels[0]).toMatchObject({
      cozeAuthMode: 'oauth_client',
      oauthClientId: 'client_id_v2',
      oauthClientSecret: 'client_secret_v1',
      baseUrl: 'https://api.coze.cn',
      oauthTokenUrl: 'https://api.coze.cn/api/permission/oauth2/token',
    })

    const reloaded = await getPilotAdminChannelCatalog(event)
    expect(reloaded.channels[0]?.oauthClientSecret).toBe('client_secret_v1')
  })

  it('coze 服务身份凭证会持久化并在编辑时保留旧私钥', async () => {
    const { getPilotAdminChannelCatalog, updatePilotAdminChannelCatalog } = await loadTarget()
    const event = createEvent()

    const created = await updatePilotAdminChannelCatalog(event, {
      channels: [
        {
          id: 'channel-coze-jwt',
          name: 'Coze JWT',
          adapter: 'coze',
          cozeAuthMode: 'jwt_service',
          oauthTokenUrl: 'https://api.coze.cn/api/permission/oauth2/token',
          jwtAppId: 'app_id_v1',
          jwtKeyId: 'key_id_v1',
          jwtAudience: 'https://api.coze.cn',
          jwtPrivateKey: '-----BEGIN PRIVATE KEY-----\nkey_v1\n-----END PRIVATE KEY-----',
          models: [
            {
              id: 'bot_jwt_1',
              targetType: 'coze_bot',
              enabled: true,
            },
          ],
        },
      ],
    })

    expect(created.channels[0]).toMatchObject({
      id: 'channel-coze-jwt',
      adapter: 'coze',
      cozeAuthMode: 'jwt_service',
      oauthTokenUrl: 'https://api.coze.cn/api/permission/oauth2/token',
      jwtAppId: 'app_id_v1',
      jwtKeyId: 'key_id_v1',
      jwtAudience: 'https://api.coze.cn',
      jwtPrivateKey: '-----BEGIN PRIVATE KEY-----\nkey_v1\n-----END PRIVATE KEY-----',
    })

    const updated = await updatePilotAdminChannelCatalog(event, {
      channels: [
        {
          id: 'channel-coze-jwt',
          adapter: 'coze',
          cozeAuthMode: 'jwt_service',
          jwtAppId: 'app_id_v2',
          jwtPrivateKey: '',
        },
      ],
    })

    expect(updated.channels[0]).toMatchObject({
      cozeAuthMode: 'jwt_service',
      jwtAppId: 'app_id_v2',
      jwtKeyId: 'key_id_v1',
      jwtAudience: 'https://api.coze.cn',
      jwtPrivateKey: '-----BEGIN PRIVATE KEY-----\nkey_v1\n-----END PRIVATE KEY-----',
    })

    const reloaded = await getPilotAdminChannelCatalog(event)
    expect(reloaded.channels[0]?.jwtPrivateKey).toBe('-----BEGIN PRIVATE KEY-----\nkey_v1\n-----END PRIVATE KEY-----')
  })

  it('coze 渠道允许同一 targetId 以不同 targetType 共存', async () => {
    const { getPilotAdminChannelCatalog, updatePilotAdminChannelCatalog } = await loadTarget()
    const event = createEvent()

    const updated = await updatePilotAdminChannelCatalog(event, {
      channels: [
        {
          id: 'channel-coze-main',
          name: 'Coze Main',
          adapter: 'coze',
          oauthClientId: 'client_id',
          oauthClientSecret: 'client_secret',
          models: [
            {
              id: 'shared_target',
              label: 'Bot Shared',
              targetType: 'coze_bot',
              enabled: true,
            },
            {
              id: 'shared_target',
              label: 'Workflow Shared',
              targetType: 'coze_workflow',
              enabled: true,
            },
          ],
        },
      ],
    })

    expect(updated.channels[0]?.models).toHaveLength(2)
    expect(updated.channels[0]?.models).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'shared_target',
        targetType: 'coze_bot',
      }),
      expect.objectContaining({
        id: 'shared_target',
        targetType: 'coze_workflow',
      }),
    ]))

    const reloaded = await getPilotAdminChannelCatalog(event)
    expect(reloaded.channels[0]?.models).toHaveLength(2)
  })
})
