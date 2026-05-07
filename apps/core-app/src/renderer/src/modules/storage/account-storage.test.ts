import { describe, expect, it, vi } from 'vitest'

const save = vi.fn()

vi.mock('@talex-touch/utils/renderer', () => ({
  useStorageSdk: () => ({
    app: {
      save
    }
  })
}))

describe('AccountStorage', () => {
  it('does not persist historical token payloads to account.ini', async () => {
    vi.useFakeTimers()
    save.mockClear()
    const { AccountStorage } = await import('./account-storage')
    const storage = new AccountStorage({
      user: {
        id: 1,
        username: 'demo',
        email: 'demo@example.test',
        createdAt: '2026-05-03T00:00:00.000Z',
        updatedAt: '2026-05-03T00:00:00.000Z'
      },
      token: {
        access_token: 'access-secret',
        refresh_token: 'refresh-secret'
      }
    })

    vi.runAllTimers()

    expect(storage.saveToStr()).not.toContain('access-secret')
    expect(storage.saveToStr()).not.toContain('refresh-secret')
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'account.ini',
        content: expect.not.stringContaining('access-secret')
      })
    )
    vi.useRealTimers()
  })
})
