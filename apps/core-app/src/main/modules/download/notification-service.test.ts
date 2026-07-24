import { beforeEach, describe, expect, it, vi } from 'vitest'

const electronMocks = vi.hoisted(() => ({
  isSupported: vi.fn(() => true),
  notifications: [] as Array<{
    options: Record<string, unknown>
    listeners: Map<string, (...args: unknown[]) => void>
    show: ReturnType<typeof vi.fn>
  }>
}))

vi.mock('electron', () => ({
  Notification: class NotificationMock {
    static isSupported(): boolean {
      return electronMocks.isSupported()
    }

    private readonly instance: (typeof electronMocks.notifications)[number]

    constructor(options: Record<string, unknown>) {
      this.instance = { options, listeners: new Map(), show: vi.fn() }
      electronMocks.notifications.push(this.instance)
    }

    on(event: string, listener: (...args: unknown[]) => void): void {
      this.instance.listeners.set(event, listener)
    }

    show(): void {
      this.instance.show()
    }
  },
  shell: {
    openPath: vi.fn(async () => ''),
    showItemInFolder: vi.fn()
  }
}))

vi.mock('../../utils/i18n-helper', () => ({
  formatDuration: vi.fn(() => '1s'),
  formatFileSize: vi.fn(() => '1 MB'),
  t: (key: string, values?: Record<string, unknown>) =>
    values?.version ? `${key}:${String(values.version)}` : key
}))

import { NotificationService } from './notification-service'

describe('NotificationService update readiness', () => {
  beforeEach(() => {
    electronMocks.isSupported.mockReturnValue(true)
    electronMocks.notifications.length = 0
  })

  it('shows one platform-specific ready notification and handles a repeated click once', () => {
    const onClick = vi.fn()
    const service = new NotificationService()

    expect(
      service.showUpdateReadyNotification({ version: '2.4.14', platform: 'darwin', onClick })
    ).toBe(true)
    expect(electronMocks.notifications).toHaveLength(1)
    expect(electronMocks.notifications[0]?.options).toMatchObject({
      body: 'notifications.updateReadyBodyMac:2.4.14',
      urgency: 'critical'
    })

    const click = electronMocks.notifications[0]?.listeners.get('click')
    click?.()
    click?.()
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('does not claim a ready notification when native notifications are unavailable', () => {
    electronMocks.isSupported.mockReturnValue(false)
    const service = new NotificationService()

    expect(
      service.showUpdateReadyNotification({
        version: '2.4.14',
        platform: 'linux',
        onClick: vi.fn()
      })
    ).toBe(false)
    expect(electronMocks.notifications).toHaveLength(0)
  })
})
