import { networkClient } from '@talex-touch/utils/network'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getPilotAdminChannelCatalog,
  updatePilotAdminChannelCatalog,
} from '../pilot-admin-channel-config'
import { mergeDiscoveredModelsIntoCatalog } from '../pilot-admin-routing-config'
import { syncPilotChannelModels } from '../pilot-channel-model-sync'

vi.mock('@talex-touch/utils/network', () => ({
  networkClient: {
    request: vi.fn(),
  },
}))

vi.mock('../pilot-admin-channel-config', () => ({
  getPilotAdminChannelCatalog: vi.fn(),
  updatePilotAdminChannelCatalog: vi.fn(),
}))

vi.mock('../pilot-admin-routing-config', () => ({
  mergeDiscoveredModelsIntoCatalog: vi.fn(),
}))

describe('pilot-channel-model-sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('同步渠道模型时不再自动写入 modelCatalog', async () => {
    vi.mocked(getPilotAdminChannelCatalog).mockResolvedValue({
      defaultChannelId: 'openai-main',
      channels: [
        {
          id: 'openai-main',
          name: 'OpenAI Main',
          baseUrl: 'https://api.openai.com',
          apiKey: 'sk-test',
          model: 'legacy-model',
          defaultModelId: '',
          timeoutMs: 90_000,
          transport: 'responses',
          enabled: true,
          models: [
            {
              id: 'legacy-model',
              label: 'legacy-model',
              enabled: true,
              priority: 10,
              thinkingSupported: true,
              thinkingDefaultEnabled: false,
            },
          ],
        },
        {
          id: 'disabled-channel',
          name: 'Disabled Channel',
          baseUrl: 'https://api.example.com',
          apiKey: 'sk-disabled',
          model: 'skip-model',
          defaultModelId: '',
          timeoutMs: 90_000,
          transport: 'responses',
          enabled: false,
          models: [],
        },
      ],
    } as any)

    vi.mocked(networkClient.request).mockResolvedValue({
      status: 200,
      data: {
        data: [
          { id: 'gpt-4o' },
          { id: 'gpt-4o-mini' },
        ],
      },
    } as any)

    vi.mocked(updatePilotAdminChannelCatalog).mockResolvedValue(undefined as any)

    const result = await syncPilotChannelModels({} as any)

    expect(result.totalChannels).toBe(2)
    expect(result.successChannels).toBe(1)
    expect(result.failedChannels).toBe(0)
    expect(result.discoveredModelCount).toBe(2)

    expect(networkClient.request).toHaveBeenCalledTimes(1)
    expect(updatePilotAdminChannelCatalog).toHaveBeenCalledTimes(1)

    const updatePayload = vi.mocked(updatePilotAdminChannelCatalog).mock.calls[0]?.[1] as any
    const syncedChannel = (updatePayload?.channels || []).find(
      (item: any) => item.id === 'openai-main',
    )
    expect(syncedChannel).toBeTruthy()
    expect(syncedChannel.models.map((item: { id: string }) => item.id)).toEqual(
      expect.arrayContaining(['legacy-model', 'gpt-4o', 'gpt-4o-mini']),
    )

    expect(mergeDiscoveredModelsIntoCatalog).not.toHaveBeenCalled()
  })

  it('coze 渠道在第一版会被明确跳过自动发现', async () => {
    vi.mocked(getPilotAdminChannelCatalog).mockResolvedValue({
      defaultChannelId: 'coze-main',
      channels: [
        {
          id: 'coze-main',
          name: 'Coze Main',
          baseUrl: 'https://api.coze.cn',
          apiKey: '',
          adapter: 'coze',
          oauthClientId: 'client_id',
          oauthClientSecret: 'client_secret',
          oauthTokenUrl: 'https://api.coze.cn/api/permission/oauth2/token',
          model: '',
          defaultModelId: '',
          timeoutMs: 90_000,
          transport: 'coze.openapi',
          enabled: true,
          models: [
            {
              id: 'bot_1',
              targetType: 'coze_bot',
              enabled: true,
              priority: 10,
              thinkingSupported: true,
              thinkingDefaultEnabled: false,
            },
          ],
        },
      ],
    } as any)

    vi.mocked(updatePilotAdminChannelCatalog).mockResolvedValue(undefined as any)

    const result = await syncPilotChannelModels({} as any)

    expect(result.totalChannels).toBe(1)
    expect(result.successChannels).toBe(0)
    expect(result.failedChannels).toBe(0)
    expect(result.discoveredModelCount).toBe(0)
    expect(result.channels).toEqual([
      {
        channelId: 'coze-main',
        status: 'skipped',
        discoveredModels: [],
        error: 'coze_manual_targets_only',
      },
    ])
    expect(networkClient.request).not.toHaveBeenCalled()

    const updatePayload = vi.mocked(updatePilotAdminChannelCatalog).mock.calls[0]?.[1] as any
    expect(updatePayload.channels).toEqual([
      expect.objectContaining({
        id: 'coze-main',
        modelsSyncError: 'COZE_MANUAL_TARGETS_ONLY',
      }),
    ])
  })
})
