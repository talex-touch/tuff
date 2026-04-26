import { afterEach, describe, expect, it, vi } from 'vitest'

const forTouchTipMock = vi.fn()

vi.mock('../mention/dialog-mention', () => ({
  forTouchTip: forTouchTipMock
}))

vi.mock('~/modules/lang', () => ({
  useI18nText: () => ({
    t: (key: string) => key
  })
}))

afterEach(() => {
  forTouchTipMock.mockReset()
})

describe('confirmExternalLinkOpen', () => {
  it('resolves false when the cancel action is chosen', async () => {
    forTouchTipMock.mockImplementationOnce(async (_title, _message, buttons) => {
      await buttons[0].onClick()
    })

    const { confirmExternalLinkOpen } = await import('./confirm-external-link')
    await expect(confirmExternalLinkOpen('https://example.com')).resolves.toBe(false)
    expect(forTouchTipMock).toHaveBeenCalledWith(
      'notifications.externalLinkConfirmTitle',
      'https://example.com',
      expect.any(Array)
    )
  })

  it('resolves true when the open action is chosen', async () => {
    forTouchTipMock.mockImplementationOnce(async (_title, _message, buttons) => {
      await buttons[1].onClick()
    })

    const { confirmExternalLinkOpen } = await import('./confirm-external-link')
    await expect(confirmExternalLinkOpen('https://example.com')).resolves.toBe(true)
  })

  it('resolves false when the dialog closes without choosing open', async () => {
    forTouchTipMock.mockResolvedValueOnce(undefined)

    const { confirmExternalLinkOpen } = await import('./confirm-external-link')
    await expect(confirmExternalLinkOpen('https://example.com')).resolves.toBe(false)
  })
})
