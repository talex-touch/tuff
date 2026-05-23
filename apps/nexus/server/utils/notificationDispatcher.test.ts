import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listBrowserNotificationInbox } from './browserNotificationInboxStore'
import { dispatchNotificationEvent } from './notificationDispatcher'
import { listPlatformGovernanceEvents, upsertPlatformGovernanceConfig } from './platformGovernanceStore'

const credentialMocks = vi.hoisted(() => ({
  getNotificationCredential: vi.fn(),
  notificationCredentialExists: vi.fn(),
}))

const networkMocks = vi.hoisted(() => ({
  request: vi.fn(),
}))

vi.mock('./cloudflare', () => ({
  readCloudflareBindings: () => undefined,
}))

vi.mock('./authStore', () => ({
  getUserById: vi.fn(async (_event, userId: string) => ({
    id: userId,
    email: `${userId}@example.com`,
    name: userId,
    image: null,
    emailVerified: null,
    emailState: 'verified',
    role: 'user',
    locale: null,
    status: 'active',
    mergedToUserId: null,
    mergedAt: null,
    mergedByUserId: null,
    disabledAt: null,
    allowCliIpMismatch: false,
    createdAt: new Date(0).toISOString(),
  })),
}))

vi.mock('./notificationCredentialStore', () => credentialMocks)
vi.mock('@talex-touch/utils/network', () => ({
  networkClient: {
    request: networkMocks.request,
  },
}))

function event(marker: string) {
  return {
    node: {
      req: {
        headers: {
          'user-agent': 'vitest',
        },
      },
    },
    context: {},
    path: `/test/notification/${marker}`,
  } as any
}

describe('notificationDispatcher', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    credentialMocks.getNotificationCredential.mockResolvedValue(null)
    credentialMocks.notificationCredentialExists.mockResolvedValue(null)
    networkMocks.request.mockResolvedValue({
      status: 202,
      statusText: 'Accepted',
      ok: true,
      url: 'https://api.resend.com/emails',
      headers: {},
      data: { id: 'email_1' },
    })
  })

  it('plans plugin review deliveries for enabled secure notification channels', async () => {
    const marker = crypto.randomUUID()
    const h3Event = event(marker)
    const channel = await upsertPlatformGovernanceConfig(h3Event, {
      configType: 'notification_channel',
      name: `Plugin review email ${marker}`,
      targetId: `plugin-${marker}`,
      channel: 'email',
      provider: 'resend',
      config: {
        credentialRef: `secure://notifications/resend-${marker}`,
        events: ['plugin.version.approved'],
      },
    }, 'admin')

    const deliveries = await dispatchNotificationEvent(h3Event, {
      action: 'plugin.version.approved',
      actorId: 'reviewer@example.com',
      resourceType: 'plugin',
      resourceId: `plugin-${marker}`,
      metadata: {
        pluginId: `plugin-${marker}`,
        versionId: `version-${marker}`,
        ownerEmail: 'developer@example.com',
        credentialRef: `secure://notifications/resend-${marker}`,
      },
    })

    expect(deliveries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        configId: channel.id,
        status: 'planned',
        reason: 'delivery-planned',
        provider: 'resend',
        credentialRequired: true,
        hasCredentialRef: true,
      }),
    ]))

    const events = await listPlatformGovernanceEvents(h3Event, {
      scope: 'notification',
      action: 'notification.delivery.planned',
      resourceType: 'plugin',
      resourceId: `plugin-${marker}`,
      limit: 20,
    })
    const serialized = JSON.stringify(events)
    expect(serialized).toContain(channel.id)
    expect(serialized).not.toContain('reviewer@example.com')
    expect(serialized).not.toContain('developer@example.com')
    expect(serialized).not.toContain(`secure://notifications/resend-${marker}`)
  })

  it('supports multiple provider instances with explicit adapter types', async () => {
    const marker = crypto.randomUUID()
    const h3Event = event(marker)
    const resend = await upsertPlatformGovernanceConfig(h3Event, {
      configType: 'notification_channel',
      name: `Resend primary ${marker}`,
      targetId: `plugin-${marker}`,
      channel: 'email',
      provider: `resend-primary-${marker}`,
      config: {
        providerType: 'resend',
        credentialRef: `secure://notifications/resend-primary-${marker}`,
        events: ['plugin.version.approved'],
      },
    }, 'admin')
    const smtp = await upsertPlatformGovernanceConfig(h3Event, {
      configType: 'notification_channel',
      name: `SMTP ops ${marker}`,
      targetId: `plugin-${marker}`,
      channel: 'email',
      provider: `smtp-ops-${marker}`,
      config: {
        providerType: 'smtp',
        credentialRef: `secure://notifications/smtp-ops-${marker}`,
        events: ['plugin.version.approved'],
      },
    }, 'admin')

    const allDeliveries = await dispatchNotificationEvent(h3Event, {
      action: 'plugin.version.approved',
      resourceType: 'plugin',
      resourceId: `plugin-${marker}`,
    })

    expect(allDeliveries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        configId: resend.id,
        provider: `resend-primary-${marker}`,
        providerType: 'resend',
        adapter: 'email/resend',
        status: 'planned',
      }),
      expect.objectContaining({
        configId: smtp.id,
        provider: `smtp-ops-${marker}`,
        providerType: 'smtp',
        adapter: 'email/smtp',
        status: 'planned',
      }),
    ]))

    const filteredDeliveries = await dispatchNotificationEvent(h3Event, {
      action: 'plugin.version.approved',
      resourceType: 'plugin',
      resourceId: `plugin-${marker}`,
      deliveryProviders: [`smtp-ops-${marker}`],
    })

    expect(filteredDeliveries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        configId: resend.id,
        status: 'skipped',
        reason: 'provider-filter-mismatch',
      }),
      expect.objectContaining({
        configId: smtp.id,
        status: 'planned',
        adapter: 'email/smtp',
      }),
    ]))
  })

  it('skips channels when the configured event list does not match', async () => {
    const marker = crypto.randomUUID()
    const h3Event = event(marker)
    const channel = await upsertPlatformGovernanceConfig(h3Event, {
      configType: 'notification_channel',
      name: `Rejected only ${marker}`,
      targetId: `plugin-${marker}`,
      channel: 'browser',
      provider: 'browser',
      config: {
        events: ['plugin.version.rejected'],
      },
    }, 'admin')

    const deliveries = await dispatchNotificationEvent(h3Event, {
      action: 'plugin.version.approved',
      resourceType: 'plugin',
      resourceId: `plugin-${marker}`,
    })

    expect(deliveries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        configId: channel.id,
        status: 'skipped',
        reason: 'event-mismatch',
        credentialRequired: false,
      }),
    ]))

    const events = await listPlatformGovernanceEvents(h3Event, {
      scope: 'notification',
      action: 'notification.delivery.skipped',
      resourceType: 'plugin',
      resourceId: `plugin-${marker}`,
      limit: 20,
    })
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        channel: 'browser',
        quantity: 0,
      }),
    ]))
  })

  it('fails planned credentialed adapters without secure credential references', async () => {
    const marker = crypto.randomUUID()
    const h3Event = event(marker)
    const channel = await upsertPlatformGovernanceConfig(h3Event, {
      configType: 'notification_channel',
      name: `SMTP missing credential ${marker}`,
      targetId: `plugin-${marker}`,
      channel: 'email',
      provider: 'smtp',
      config: {
        events: ['plugin.version.approved'],
      },
    }, 'admin')

    const deliveries = await dispatchNotificationEvent(h3Event, {
      action: 'plugin.version.approved',
      resourceType: 'plugin',
      resourceId: `plugin-${marker}`,
      metadata: {
        to: 'developer@example.com',
      },
    })

    expect(deliveries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        configId: channel.id,
        status: 'failed',
        reason: 'credential-ref-required',
        credentialRequired: true,
        hasCredentialRef: false,
      }),
    ]))

    const events = await listPlatformGovernanceEvents(h3Event, {
      scope: 'notification',
      action: 'notification.delivery.failed',
      resourceType: 'plugin',
      resourceId: `plugin-${marker}`,
      limit: 20,
    })
    const serialized = JSON.stringify(events)
    expect(serialized).toContain('credential-ref-required')
    expect(serialized).not.toContain('developer@example.com')
  })

  it('fails credentialed adapters when the referenced secure credential is missing', async () => {
    const marker = crypto.randomUUID()
    const h3Event = event(marker)
    const authRef = `secure://notifications/resend-missing-${marker}`
    const channel = await upsertPlatformGovernanceConfig(h3Event, {
      configType: 'notification_channel',
      name: `Resend missing credential ${marker}`,
      targetId: `plugin-${marker}`,
      channel: 'email',
      provider: `resend-primary-${marker}`,
      config: {
        providerType: 'resend',
        credentialRef: authRef,
        events: ['plugin.version.approved'],
      },
    }, 'admin')
    credentialMocks.notificationCredentialExists.mockResolvedValueOnce(false)

    const deliveries = await dispatchNotificationEvent(h3Event, {
      action: 'plugin.version.approved',
      resourceType: 'plugin',
      resourceId: `plugin-${marker}`,
    })

    expect(credentialMocks.notificationCredentialExists).toHaveBeenCalledWith(h3Event, authRef)
    expect(deliveries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        configId: channel.id,
        status: 'failed',
        reason: 'credential-missing',
        credentialRequired: true,
        hasCredentialRef: true,
      }),
    ]))

    const events = await listPlatformGovernanceEvents(h3Event, {
      scope: 'notification',
      action: 'notification.delivery.failed',
      resourceType: 'plugin',
      resourceId: `plugin-${marker}`,
      limit: 20,
    })
    const serialized = JSON.stringify(events)
    expect(serialized).toContain('credential-missing')
    expect(serialized).not.toContain(authRef)
  })

  it('sends Resend notifications only when send mode, runtime recipients, and secure credentials are present', async () => {
    const marker = crypto.randomUUID()
    const h3Event = event(marker)
    const authRef = `secure://notifications/resend-send-${marker}`
    const channel = await upsertPlatformGovernanceConfig(h3Event, {
      configType: 'notification_channel',
      name: `Resend send ${marker}`,
      targetId: `plugin-${marker}`,
      channel: 'email',
      provider: `resend-primary-${marker}`,
      config: {
        mode: 'send',
        providerType: 'resend',
        credentialRef: authRef,
        from: 'Tuff <noreply@example.com>',
        subject: 'Plugin approved',
        events: ['plugin.version.approved'],
      },
    }, 'admin')
    credentialMocks.notificationCredentialExists.mockResolvedValueOnce(true)
    credentialMocks.getNotificationCredential.mockResolvedValueOnce({ apiKey: 're-unit-test-secret' })

    const deliveries = await dispatchNotificationEvent(h3Event, {
      action: 'plugin.version.approved',
      actorId: 'reviewer@example.com',
      resourceType: 'plugin',
      resourceId: `plugin-${marker}`,
      metadata: {
        pluginId: `plugin-${marker}`,
        to: 'developer@example.com',
      },
    })

    expect(deliveries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        configId: channel.id,
        status: 'sent',
        reason: 'delivery-sent',
        adapter: 'email/resend',
      }),
    ]))
    expect(networkMocks.request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'POST',
      url: 'https://api.resend.com/emails',
      headers: expect.objectContaining({
        Authorization: 'Bearer re-unit-test-secret',
      }),
      body: expect.objectContaining({
        from: 'Tuff <noreply@example.com>',
        to: ['developer@example.com'],
        subject: 'Plugin approved',
      }),
    }))

    const events = await listPlatformGovernanceEvents(h3Event, {
      scope: 'notification',
      action: 'notification.delivery.sent',
      resourceType: 'plugin',
      resourceId: `plugin-${marker}`,
      limit: 20,
    })
    const serialized = JSON.stringify(events)
    expect(serialized).toContain('delivery-sent')
    expect(serialized).not.toContain('developer@example.com')
    expect(serialized).not.toContain('reviewer@example.com')
    expect(serialized).not.toContain('re-unit-test-secret')
  })

  it('records sanitized HTTP status codes for failed notification adapter responses', async () => {
    const marker = crypto.randomUUID()
    const h3Event = event(marker)
    const authRef = `secure://notifications/resend-http-${marker}`
    const channel = await upsertPlatformGovernanceConfig(h3Event, {
      configType: 'notification_channel',
      name: `Resend http failure ${marker}`,
      targetId: `plugin-${marker}`,
      channel: 'email',
      provider: `resend-http-${marker}`,
      config: {
        mode: 'send',
        providerType: 'resend',
        credentialRef: authRef,
        from: 'Tuff <noreply@example.com>',
        events: ['plugin.version.approved'],
      },
    }, 'admin')
    credentialMocks.notificationCredentialExists.mockResolvedValueOnce(true)
    credentialMocks.getNotificationCredential.mockResolvedValueOnce({ apiKey: 're-http-unit-test-secret' })
    networkMocks.request.mockResolvedValueOnce({
      status: 503,
      statusText: 'Service Unavailable',
      ok: false,
      url: 'https://api.resend.com/emails',
      headers: {},
      data: { error: 'temporary unavailable' },
    })

    const deliveries = await dispatchNotificationEvent(h3Event, {
      action: 'plugin.version.approved',
      actorId: 'reviewer@example.com',
      resourceType: 'plugin',
      resourceId: `plugin-${marker}`,
      metadata: {
        pluginId: `plugin-${marker}`,
        to: 'developer@example.com',
      },
    })

    expect(deliveries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        configId: channel.id,
        status: 'failed',
        reason: 'adapter-http-error',
        adapter: 'email/resend',
        statusCode: 503,
        durationMs: expect.any(Number),
      }),
    ]))

    const events = await listPlatformGovernanceEvents(h3Event, {
      scope: 'notification',
      action: 'notification.delivery.failed',
      resourceType: 'plugin',
      resourceId: `plugin-${marker}`,
      limit: 20,
    })
    const serialized = JSON.stringify(events)
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        metadata: expect.objectContaining({
          reason: 'adapter-http-error',
          statusCode: 503,
          durationMs: expect.any(Number),
        }),
      }),
    ]))
    expect(serialized).not.toContain('developer@example.com')
    expect(serialized).not.toContain('reviewer@example.com')
    expect(serialized).not.toContain('re-http-unit-test-secret')
    expect(serialized).not.toContain(authRef)
    expect(serialized).not.toContain('temporary unavailable')
  })

  it('sends plugin review email notifications to plugin owner recipients without runtime emails', async () => {
    const marker = crypto.randomUUID()
    const h3Event = event(marker)
    const authRef = `secure://notifications/resend-owner-${marker}`
    const developerId = `developer-${marker}`
    const channel = await upsertPlatformGovernanceConfig(h3Event, {
      configType: 'notification_channel',
      name: `Resend owner ${marker}`,
      targetId: `plugin-${marker}`,
      channel: 'email',
      provider: `resend-owner-${marker}`,
      config: {
        mode: 'send',
        providerType: 'resend',
        credentialRef: authRef,
        from: 'Tuff <noreply@example.com>',
        events: ['plugin.version.approved'],
      },
    }, 'admin')
    credentialMocks.notificationCredentialExists.mockResolvedValueOnce(true)
    credentialMocks.getNotificationCredential.mockResolvedValueOnce({ apiKey: 're-owner-unit-test-secret' })

    const deliveries = await dispatchNotificationEvent(h3Event, {
      action: 'plugin.version.approved',
      actorId: 'reviewer@example.com',
      resourceType: 'plugin',
      resourceId: `plugin-${marker}`,
      metadata: {
        pluginId: `plugin-${marker}`,
        developerId,
      },
    })

    expect(deliveries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        configId: channel.id,
        status: 'sent',
        reason: 'delivery-sent',
        adapter: 'email/resend',
      }),
    ]))
    expect(networkMocks.request).toHaveBeenCalledWith(expect.objectContaining({
      body: expect.objectContaining({
        to: [`${developerId}@example.com`],
      }),
    }))

    const events = await listPlatformGovernanceEvents(h3Event, {
      scope: 'notification',
      action: 'notification.delivery.sent',
      resourceType: 'plugin',
      resourceId: `plugin-${marker}`,
      limit: 20,
    })
    const serialized = JSON.stringify(events)
    expect(serialized).toContain('delivery-sent')
    expect(serialized).not.toContain(`${developerId}@example.com`)
    expect(serialized).not.toContain('reviewer@example.com')
    expect(serialized).not.toContain('re-owner-unit-test-secret')
  })

  it('sends generic HTTP email notifications with secure webhook credentials', async () => {
    const marker = crypto.randomUUID()
    const h3Event = event(marker)
    const authRef = `secure://notifications/generic-email-${marker}`
    const channel = await upsertPlatformGovernanceConfig(h3Event, {
      configType: 'notification_channel',
      name: `Generic email ${marker}`,
      targetId: `plugin-${marker}`,
      channel: 'email',
      provider: `mail-relay-${marker}`,
      config: {
        mode: 'send',
        providerType: 'generic',
        credentialRef: authRef,
        from: 'Tuff <noreply@example.com>',
        subject: 'Plugin approved',
        events: ['plugin.version.approved'],
      },
    }, 'admin')
    credentialMocks.notificationCredentialExists.mockResolvedValueOnce(true)
    credentialMocks.getNotificationCredential.mockResolvedValueOnce({
      url: 'https://mail.example.test/send',
      signingSecret: 'generic-mail-signing-secret',
    })

    const deliveries = await dispatchNotificationEvent(h3Event, {
      action: 'plugin.version.approved',
      actorId: 'reviewer@example.com',
      resourceType: 'plugin',
      resourceId: `plugin-${marker}`,
      metadata: {
        pluginId: `plugin-${marker}`,
        to: ['developer@example.com'],
        credentialRef: authRef,
      },
    })

    expect(deliveries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        configId: channel.id,
        provider: `mail-relay-${marker}`,
        providerType: 'generic',
        adapter: 'email/generic',
        status: 'sent',
        reason: 'delivery-sent',
      }),
    ]))
    expect(networkMocks.request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'POST',
      url: 'https://mail.example.test/send',
      headers: expect.objectContaining({
        'Content-Type': 'application/json',
        'X-Tuff-Signature': expect.any(String),
      }),
    }))

    const request = networkMocks.request.mock.calls[0]?.[0]
    const body = JSON.parse(String(request.body))
    expect(body).toMatchObject({
      action: 'plugin.version.approved',
      from: 'Tuff <noreply@example.com>',
      to: ['developer@example.com'],
      subject: 'Plugin approved',
      resourceType: 'plugin',
      resourceId: `plugin-${marker}`,
    })

    const events = await listPlatformGovernanceEvents(h3Event, {
      scope: 'notification',
      action: 'notification.delivery.sent',
      resourceType: 'plugin',
      resourceId: `plugin-${marker}`,
      limit: 20,
    })
    const serialized = JSON.stringify(events)
    expect(serialized).toContain('delivery-sent')
    expect(serialized).toContain('mail-relay')
    expect(serialized).not.toContain('developer@example.com')
    expect(serialized).not.toContain('reviewer@example.com')
    expect(serialized).not.toContain(authRef)
    expect(serialized).not.toContain('generic-mail-signing-secret')
  })

  it('sends SendGrid, Mailgun, and Postmark notifications as independent secure email adapters', async () => {
    const marker = crypto.randomUUID()
    const h3Event = event(marker)
    const providers = [
      {
        provider: `sendgrid-${marker}`,
        providerType: 'sendgrid',
        credentialRef: `secure://notifications/sendgrid-${marker}`,
        credential: { apiKey: 'sg-unit-test-secret' },
      },
      {
        provider: `mailgun-${marker}`,
        providerType: 'mailgun',
        credentialRef: `secure://notifications/mailgun-${marker}`,
        credential: { apiKey: 'mg-unit-test-secret' },
        extraConfig: {
          domain: 'mg.example.test',
          region: 'eu',
        },
      },
      {
        provider: `postmark-${marker}`,
        providerType: 'postmark',
        credentialRef: `secure://notifications/postmark-${marker}`,
        credential: { apiKey: 'pm-unit-test-secret' },
        extraConfig: {
          messageStream: 'outbound',
        },
      },
    ]

    const configs = []
    for (const item of providers) {
      configs.push(await upsertPlatformGovernanceConfig(h3Event, {
        configType: 'notification_channel',
        name: `${item.providerType} email ${marker}`,
        targetId: `plugin-${marker}`,
        channel: 'email',
        provider: item.provider,
        config: {
          mode: 'send',
          providerType: item.providerType,
          credentialRef: item.credentialRef,
          from: 'Tuff <noreply@example.com>',
          subject: 'Plugin approved',
          events: ['plugin.version.approved'],
          ...item.extraConfig,
        },
      }, 'admin'))
    }

    credentialMocks.notificationCredentialExists.mockResolvedValue(true)
    credentialMocks.getNotificationCredential.mockImplementation(async (_event, authRef: string) => {
      return providers.find(item => item.credentialRef === authRef)?.credential ?? null
    })

    const deliveries = await dispatchNotificationEvent(h3Event, {
      action: 'plugin.version.approved',
      actorId: 'reviewer@example.com',
      resourceType: 'plugin',
      resourceId: `plugin-${marker}`,
      metadata: {
        pluginId: `plugin-${marker}`,
        to: ['developer@example.com'],
      },
    })

    expect(deliveries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        configId: configs[0].id,
        provider: `sendgrid-${marker}`,
        providerType: 'sendgrid',
        adapter: 'email/sendgrid',
        status: 'sent',
      }),
      expect.objectContaining({
        configId: configs[1].id,
        provider: `mailgun-${marker}`,
        providerType: 'mailgun',
        adapter: 'email/mailgun',
        status: 'sent',
      }),
      expect.objectContaining({
        configId: configs[2].id,
        provider: `postmark-${marker}`,
        providerType: 'postmark',
        adapter: 'email/postmark',
        status: 'sent',
      }),
    ]))
    expect(networkMocks.request).toHaveBeenCalledTimes(3)

    const requests = networkMocks.request.mock.calls.map(call => call[0])
    const findRequest = (url: string) => {
      const request = requests.find(item => item.url === url)
      expect(request).toBeDefined()
      return request
    }
    const sendgridRequest = findRequest('https://api.sendgrid.com/v3/mail/send')
    const mailgunRequest = findRequest('https://api.eu.mailgun.net/v3/mg.example.test/messages')
    const postmarkRequest = findRequest('https://api.postmarkapp.com/email')
    expect(sendgridRequest).toEqual(expect.objectContaining({
      method: 'POST',
      url: 'https://api.sendgrid.com/v3/mail/send',
      headers: expect.objectContaining({
        Authorization: 'Bearer sg-unit-test-secret',
      }),
      body: expect.objectContaining({
        personalizations: [
          {
            to: [{ email: 'developer@example.com' }],
          },
        ],
        from: { email: 'Tuff <noreply@example.com>' },
        subject: 'Plugin approved',
      }),
    }))
    expect(mailgunRequest).toEqual(expect.objectContaining({
      method: 'POST',
      url: 'https://api.eu.mailgun.net/v3/mg.example.test/messages',
      headers: expect.objectContaining({
        Authorization: expect.stringMatching(/^Basic /),
        'Content-Type': 'application/x-www-form-urlencoded',
      }),
      body: expect.stringContaining('to=developer%40example.com'),
    }))
    expect(postmarkRequest).toEqual(expect.objectContaining({
      method: 'POST',
      url: 'https://api.postmarkapp.com/email',
      headers: expect.objectContaining({
        'X-Postmark-Server-Token': 'pm-unit-test-secret',
      }),
      body: expect.objectContaining({
        From: 'Tuff <noreply@example.com>',
        To: 'developer@example.com',
        Subject: 'Plugin approved',
        MessageStream: 'outbound',
      }),
    }))

    const events = await listPlatformGovernanceEvents(h3Event, {
      scope: 'notification',
      action: 'notification.delivery.sent',
      resourceType: 'plugin',
      resourceId: `plugin-${marker}`,
      limit: 20,
    })
    const serialized = JSON.stringify(events)
    expect(serialized).toContain(`sendgrid-${marker}`)
    expect(serialized).toContain(`mailgun-${marker}`)
    expect(serialized).toContain(`postmark-${marker}`)
    expect(serialized).toContain('email/sendgrid')
    expect(serialized).toContain('email/mailgun')
    expect(serialized).toContain('email/postmark')
    expect(serialized).not.toContain('developer@example.com')
    expect(serialized).not.toContain('reviewer@example.com')
    expect(serialized).not.toContain('sg-unit-test-secret')
    expect(serialized).not.toContain('mg-unit-test-secret')
    expect(serialized).not.toContain('pm-unit-test-secret')
    for (const item of providers)
      expect(serialized).not.toContain(item.credentialRef)

    networkMocks.request.mockClear()
    const filteredDeliveries = await dispatchNotificationEvent(h3Event, {
      action: 'plugin.version.approved',
      resourceType: 'plugin',
      resourceId: `plugin-${marker}`,
      deliveryProviders: ['mailgun'],
      metadata: {
        to: ['developer@example.com'],
      },
    })

    expect(filteredDeliveries).toEqual(expect.arrayContaining([
      expect.objectContaining({ configId: configs[0].id, status: 'skipped', reason: 'provider-filter-mismatch' }),
      expect.objectContaining({ configId: configs[1].id, status: 'sent', adapter: 'email/mailgun' }),
      expect.objectContaining({ configId: configs[2].id, status: 'skipped', reason: 'provider-filter-mismatch' }),
    ]))
    expect(networkMocks.request).toHaveBeenCalledTimes(1)
    expect(networkMocks.request.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      url: 'https://api.eu.mailgun.net/v3/mg.example.test/messages',
    }))
  })

  it('sends SMTP notifications through an HTTPS relay with secure SMTP credentials', async () => {
    const marker = crypto.randomUUID()
    const h3Event = event(marker)
    const authRef = `secure://notifications/smtp-send-${marker}`
    const channel = await upsertPlatformGovernanceConfig(h3Event, {
      configType: 'notification_channel',
      name: `SMTP send ${marker}`,
      targetId: `plugin-${marker}`,
      channel: 'email',
      provider: `smtp-ops-${marker}`,
      config: {
        mode: 'send',
        providerType: 'smtp',
        credentialRef: authRef,
        endpoint: 'https://smtp-relay.example.test/send',
        subject: 'Plugin approved',
        events: ['plugin.version.approved'],
      },
    }, 'admin')
    credentialMocks.notificationCredentialExists.mockResolvedValueOnce(true)
    credentialMocks.getNotificationCredential.mockResolvedValueOnce({
      host: 'smtp.example.test',
      port: 465,
      username: 'smtp-user',
      password: 'smtp-unit-test-secret',
      secure: true,
      from: 'Tuff Ops <ops@example.com>',
    })

    const deliveries = await dispatchNotificationEvent(h3Event, {
      action: 'plugin.version.approved',
      actorId: 'reviewer@example.com',
      resourceType: 'plugin',
      resourceId: `plugin-${marker}`,
      metadata: {
        pluginId: `plugin-${marker}`,
        to: ['developer@example.com'],
        credentialRef: authRef,
      },
    })

    expect(deliveries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        configId: channel.id,
        provider: `smtp-ops-${marker}`,
        providerType: 'smtp',
        adapter: 'email/smtp',
        status: 'sent',
        reason: 'delivery-sent',
      }),
    ]))
    expect(networkMocks.request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'POST',
      url: 'https://smtp-relay.example.test/send',
      headers: expect.objectContaining({
        'Content-Type': 'application/json',
      }),
    }))

    const request = networkMocks.request.mock.calls[0]?.[0]
    expect(request.body).toEqual(expect.objectContaining({
      adapter: 'smtp',
      action: 'plugin.version.approved',
      from: 'Tuff Ops <ops@example.com>',
      to: ['developer@example.com'],
      subject: 'Plugin approved',
      smtp: expect.objectContaining({
        host: 'smtp.example.test',
        port: 465,
        username: 'smtp-user',
        password: 'smtp-unit-test-secret',
        secure: true,
      }),
    }))

    const events = await listPlatformGovernanceEvents(h3Event, {
      scope: 'notification',
      action: 'notification.delivery.sent',
      resourceType: 'plugin',
      resourceId: `plugin-${marker}`,
      limit: 20,
    })
    const serialized = JSON.stringify(events)
    expect(serialized).toContain('delivery-sent')
    expect(serialized).toContain(`smtp-ops-${marker}`)
    expect(serialized).not.toContain('developer@example.com')
    expect(serialized).not.toContain('reviewer@example.com')
    expect(serialized).not.toContain(authRef)
    expect(serialized).not.toContain('smtp-unit-test-secret')
  })

  it('sends Web Push notifications through a secure relay without storing subscriptions in audit metadata', async () => {
    const marker = crypto.randomUUID()
    const h3Event = event(marker)
    const authRef = `secure://notifications/webpush-send-${marker}`
    const channel = await upsertPlatformGovernanceConfig(h3Event, {
      configType: 'notification_channel',
      name: `Web Push send ${marker}`,
      targetId: `plugin-${marker}`,
      channel: 'browser',
      provider: `webpush-primary-${marker}`,
      config: {
        mode: 'send',
        providerType: 'webpush',
        credentialRef: authRef,
        title: 'Plugin approved',
        body: 'Your plugin version has been approved.',
        tag: 'plugin-review',
        events: ['plugin.version.approved'],
      },
    }, 'admin')
    credentialMocks.notificationCredentialExists.mockResolvedValueOnce(true)
    credentialMocks.getNotificationCredential.mockResolvedValueOnce({
      url: 'https://push-relay.example.test/send',
      signingSecret: 'webpush-signing-secret',
    })

    const deliveries = await dispatchNotificationEvent(h3Event, {
      action: 'plugin.version.approved',
      actorId: 'reviewer@example.com',
      resourceType: 'plugin',
      resourceId: `plugin-${marker}`,
      metadata: {
        pluginId: `plugin-${marker}`,
        webPushSubscriptions: [
          {
            endpoint: `https://push.example.test/subscriptions/${marker}`,
            keys: {
              p256dh: 'p256dh-unit-test-key',
              auth: 'auth-unit-test-key',
            },
          },
        ],
        credentialRef: authRef,
      },
    })

    expect(deliveries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        configId: channel.id,
        provider: `webpush-primary-${marker}`,
        providerType: 'webpush',
        adapter: 'webpush',
        status: 'sent',
        reason: 'delivery-sent',
      }),
    ]))
    expect(networkMocks.request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'POST',
      url: 'https://push-relay.example.test/send',
      headers: expect.objectContaining({
        'Content-Type': 'application/json',
        'X-Tuff-Signature': expect.any(String),
      }),
    }))

    const request = networkMocks.request.mock.calls[0]?.[0]
    const body = JSON.parse(String(request.body))
    expect(body).toEqual(expect.objectContaining({
      action: 'plugin.version.approved',
      notification: expect.objectContaining({
        title: 'Plugin approved',
        body: 'Your plugin version has been approved.',
        tag: 'plugin-review',
      }),
      subscriptions: [
        expect.objectContaining({
          endpoint: `https://push.example.test/subscriptions/${marker}`,
          keys: {
            p256dh: 'p256dh-unit-test-key',
            auth: 'auth-unit-test-key',
          },
        }),
      ],
    }))

    const events = await listPlatformGovernanceEvents(h3Event, {
      scope: 'notification',
      action: 'notification.delivery.sent',
      resourceType: 'plugin',
      resourceId: `plugin-${marker}`,
      limit: 20,
    })
    const serialized = JSON.stringify(events)
    expect(serialized).toContain('delivery-sent')
    expect(serialized).toContain(`webpush-primary-${marker}`)
    expect(serialized).not.toContain(`https://push.example.test/subscriptions/${marker}`)
    expect(serialized).not.toContain('p256dh-unit-test-key')
    expect(serialized).not.toContain('auth-unit-test-key')
    expect(serialized).not.toContain('webpush-signing-secret')
    expect(serialized).not.toContain(authRef)
  })

  it('stores browser send-mode notifications in the user inbox without raw recipients', async () => {
    const marker = crypto.randomUUID()
    const h3Event = event(marker)
    const targetUserId = `developer-${marker}`
    const channel = await upsertPlatformGovernanceConfig(h3Event, {
      configType: 'notification_channel',
      name: `Browser inbox ${marker}`,
      targetId: `plugin-${marker}`,
      channel: 'browser',
      provider: 'browser',
      config: {
        mode: 'send',
        title: 'Plugin approved',
        events: ['plugin.version.approved'],
      },
    }, 'admin')

    const deliveries = await dispatchNotificationEvent(h3Event, {
      action: 'plugin.version.approved',
      actorId: 'reviewer@example.com',
      resourceType: 'plugin',
      resourceId: `plugin-${marker}`,
      metadata: {
        pluginId: `plugin-${marker}`,
        pluginSlug: `plugin-${marker}`,
        userId: targetUserId,
        to: 'developer@example.com',
        credentialRef: `secure://notifications/browser-${marker}`,
      },
    })

    expect(deliveries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        configId: channel.id,
        status: 'sent',
        reason: 'delivery-sent',
        adapter: 'browser',
        credentialRequired: false,
      }),
    ]))

    const inboxItems = await listBrowserNotificationInbox(h3Event, {
      userId: targetUserId,
      status: 'unread',
      limit: 10,
    })
    expect(inboxItems).toEqual([
      expect.objectContaining({
        userId: targetUserId,
        action: 'plugin.version.approved',
        title: 'Plugin approved',
        resourceType: 'plugin',
        resourceId: `plugin-${marker}`,
        status: 'unread',
        metadata: expect.objectContaining({
          pluginId: `plugin-${marker}`,
          pluginSlug: `plugin-${marker}`,
        }),
      }),
    ])

    const serializedInbox = JSON.stringify(inboxItems)
    expect(serializedInbox).not.toContain('developer@example.com')
    expect(serializedInbox).not.toContain('reviewer@example.com')
    expect(serializedInbox).not.toContain(`secure://notifications/browser-${marker}`)
  })
})
