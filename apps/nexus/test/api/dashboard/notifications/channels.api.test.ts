import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { upsertPlatformGovernanceConfig } from '../../../../server/utils/platformGovernanceStore'

const authMocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
}))

vi.mock('../../../../server/utils/auth', () => authMocks)
vi.mock('../../../../server/utils/cloudflare', () => ({
  readCloudflareBindings: () => undefined,
}))

let listChannelsHandler: (event: any) => Promise<any>

beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (fn: any) => fn
  listChannelsHandler = (await import('../../../../server/api/dashboard/notifications/channels.get')).default as (event: any) => Promise<any>
})

function makeEvent() {
  return {
    path: '/api/dashboard/notifications/channels',
    node: {
      req: {
        url: '/api/dashboard/notifications/channels',
        headers: {
          'user-agent': 'vitest',
        },
      },
    },
    context: {},
  }
}

describe('/api/dashboard/notifications/channels', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.requireAdmin.mockResolvedValue({
      userId: 'admin_1',
      user: { role: 'admin' },
    })
  })

  it('returns configurable notification profile templates without credential material', async () => {
    const event = makeEvent()
    const channel = await upsertPlatformGovernanceConfig(event, {
      configType: 'notification_channel',
      name: 'Resend listing',
      channel: 'email',
      provider: 'resend-primary',
      config: {
        mode: 'send',
        providerType: 'resend',
        credentialRef: 'secure://notifications/resend-primary',
        from: 'Tuff <noreply@example.com>',
      },
    }, 'admin')
    const result = await listChannelsHandler(event)
    const serialized = JSON.stringify(result)

    expect(authMocks.requireAdmin).toHaveBeenCalledWith(expect.anything())
    expect(result.profiles).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'browser-inbox',
        channel: 'browser',
        adapter: 'browser',
        credentialType: null,
      }),
      expect.objectContaining({
        id: 'resend-email',
        channel: 'email',
        providerType: 'resend',
        adapter: 'email/resend',
        credentialType: 'api_key',
      }),
      expect.objectContaining({
        id: 'sendgrid-email',
        providerType: 'sendgrid',
        adapter: 'email/sendgrid',
      }),
      expect.objectContaining({
        id: 'mailgun-email',
        providerType: 'mailgun',
        adapter: 'email/mailgun',
      }),
      expect.objectContaining({
        id: 'postmark-email',
        providerType: 'postmark',
        adapter: 'email/postmark',
      }),
      expect.objectContaining({
        id: 'smtp-relay',
        providerType: 'smtp',
        adapter: 'email/smtp',
        credentialType: 'smtp',
      }),
      expect.objectContaining({
        id: 'generic-http-email',
        providerType: 'generic',
        adapter: 'email/generic',
        credentialType: 'webhook',
      }),
      expect.objectContaining({
        id: 'feishu-bot',
        channel: 'feishu',
        adapter: 'feishu',
        credentialType: 'bot_token',
      }),
      expect.objectContaining({
        id: 'lark-bot',
        channel: 'lark',
        adapter: 'lark',
        credentialType: 'bot_token',
      }),
      expect.objectContaining({
        id: 'webhook',
        adapter: 'webhook',
        credentialType: 'webhook',
      }),
      expect.objectContaining({
        id: 'webpush-relay',
        adapter: 'webpush',
        credentialType: 'webhook',
      }),
    ]))
    expect(result.profiles.find((item: any) => item.id === 'resend-email')).toEqual(expect.objectContaining({
      defaultConfig: expect.objectContaining({
        mode: 'send',
        providerType: 'resend',
        credentialRef: 'secure://notifications/resend-primary',
        events: ['plugin.version.approved', 'plugin.version.rejected'],
      }),
      requiredConfigKeys: expect.arrayContaining(['credentialRef', 'from']),
      defaultLimits: expect.objectContaining({
        maxMessagesPerDay: 5000,
        maxFailuresPerHour: 50,
      }),
    }))
    expect(result.evaluations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        configId: channel.id,
        profile: expect.objectContaining({
          adapter: 'email/resend',
          credentialRequired: true,
          supported: true,
        }),
        readiness: expect.objectContaining({
          status: 'ready',
          productionReady: true,
          reasons: [],
        }),
      }),
    ]))
    expect(serialized).not.toContain('apiKey')
    expect(serialized).not.toContain('password')
    expect(serialized).not.toContain('signingSecret')
  })
})
