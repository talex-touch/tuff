import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CoreBoxEvents } from '../transport/events'

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
}))

vi.mock('../transport', () => ({
  createPluginTuffTransport: vi.fn(() => ({
    send: mocks.send,
  })),
}))

import { createBoxSDK } from '../plugin/sdk/box-sdk'

describe('Plugin Box SDK', () => {
  beforeEach(() => {
    mocks.send.mockReset()
    mocks.send.mockResolvedValue(undefined)
  })

  it('maps CoreBox visibility and expansion to shared typed event objects', async () => {
    const box = createBoxSDK({ send: vi.fn() } as any)

    box.hide()
    box.show()
    await box.expand({ length: 3 })
    await box.shrink()

    expect(mocks.send).toHaveBeenNthCalledWith(1, CoreBoxEvents.ui.hide)
    expect(mocks.send).toHaveBeenNthCalledWith(2, CoreBoxEvents.ui.show)
    expect(mocks.send).toHaveBeenNthCalledWith(
      3,
      CoreBoxEvents.ui.expand,
      { length: 3 },
    )
    expect(mocks.send).toHaveBeenNthCalledWith(
      4,
      CoreBoxEvents.ui.expand,
      { mode: 'collapse' },
    )
  })

  it('maps supported input and clipboard operations to shared typed event objects', async () => {
    mocks.send
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ input: 'hello' })
    const box = createBoxSDK({ send: vi.fn() } as any)

    await box.hideInput()
    await box.showInput()
    await expect(box.getInput()).resolves.toBe('hello')
    await box.setInput('next')
    await box.clearInput()
    await box.allowInput()
    await box.allowClipboard(1)

    expect(mocks.send).toHaveBeenNthCalledWith(1, CoreBoxEvents.ui.hideInput)
    expect(mocks.send).toHaveBeenNthCalledWith(2, CoreBoxEvents.ui.showInput)
    expect(mocks.send).toHaveBeenNthCalledWith(3, CoreBoxEvents.input.get)
    expect(mocks.send).toHaveBeenNthCalledWith(
      4,
      CoreBoxEvents.input.set,
      { value: 'next' },
    )
    expect(mocks.send).toHaveBeenNthCalledWith(5, CoreBoxEvents.input.clear)
    expect(mocks.send).toHaveBeenNthCalledWith(
      6,
      CoreBoxEvents.inputMonitoring.allow,
    )
    expect(mocks.send).toHaveBeenNthCalledWith(
      7,
      CoreBoxEvents.clipboard.allow,
      { types: 1 },
    )
  })

  it('maps CoreBox layout controls to shared typed event objects', async () => {
    mocks.send
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        bounds: { x: 1, y: 2, width: 3, height: 4 },
      })
    const box = createBoxSDK({ send: vi.fn() } as any)

    await box.setHeight(320)
    await box.setPositionOffset(0.36)
    await expect(box.getBounds()).resolves.toEqual({
      x: 1,
      y: 2,
      width: 3,
      height: 4,
    })

    expect(mocks.send).toHaveBeenNthCalledWith(
      1,
      CoreBoxEvents.layout.setHeight,
      { height: 320 },
    )
    expect(mocks.send).toHaveBeenNthCalledWith(
      2,
      CoreBoxEvents.layout.setPositionOffset,
      { topPercent: 0.36 },
    )
    expect(mocks.send).toHaveBeenNthCalledWith(3, CoreBoxEvents.layout.getBounds)
  })
})
