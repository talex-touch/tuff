import { describe, expect, it, vi } from 'vitest'

const sendMock = vi.fn(async () => ({ success: true }))

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({
    send: sendMock
  })
}))

describe('device-attest', () => {
  it('sends attest event', async () => {
    sendMock.mockClear()
    const { attestCurrentDevice } = await import('./device-attest')

    await attestCurrentDevice()

    expect(sendMock).toHaveBeenCalledTimes(1)
  })
})
