import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getMainConfigMock, saveMainConfigMock, subscribeMainConfigMock, isMainStorageReadyMock } =
  vi.hoisted(() => ({
    getMainConfigMock: vi.fn(() => ({ searchEngine: { logsEnabled: false } })),
    saveMainConfigMock: vi.fn(),
    subscribeMainConfigMock: vi.fn(() => () => {}),
    isMainStorageReadyMock: vi.fn(() => true)
  }))

vi.mock('@talex-touch/utils/common/logger', () => ({
  loggerManager: {
    getLogger: vi.fn()
  }
}))

vi.mock('../../../core/eventbus/touch-event', () => ({
  TalexEvents: {
    ALL_MODULES_LOADED: 'all-modules-loaded'
  },
  touchEventBus: {
    once: vi.fn()
  }
}))

vi.mock('../../storage', () => ({
  getMainConfig: getMainConfigMock,
  saveMainConfig: saveMainConfigMock,
  subscribeMainConfig: subscribeMainConfigMock,
  isMainStorageReady: isMainStorageReadyMock
}))

import { searchLogger } from './search-logger'

describe('search-logger burst', () => {
  beforeEach(async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-22T00:00:00.000Z'))
    getMainConfigMock.mockClear()
    saveMainConfigMock.mockClear()
    subscribeMainConfigMock.mockClear()
    isMainStorageReadyMock.mockClear()
    isMainStorageReadyMock.mockReturnValue(true)

    searchLogger.destroy()
    await searchLogger.setEnabled(false)
  })

  it('默认手动关闭时不开启日志', () => {
    expect(searchLogger.isEnabled()).toBe(false)
  })

  it('支持 burst 临时开启并自动过期', () => {
    searchLogger.enableBurst(30_000, 'test')
    expect(searchLogger.isEnabled()).toBe(true)

    vi.advanceTimersByTime(29_999)
    expect(searchLogger.isEnabled()).toBe(true)

    vi.advanceTimersByTime(1)
    expect(searchLogger.isEnabled()).toBe(false)
  })

  it('burst 不会持久化到设置存储', () => {
    saveMainConfigMock.mockClear()
    searchLogger.enableBurst(5_000, 'ephemeral')
    expect(saveMainConfigMock).not.toHaveBeenCalled()
  })
})
