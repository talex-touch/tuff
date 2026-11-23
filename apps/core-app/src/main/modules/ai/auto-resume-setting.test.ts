import { StorageList } from '@talex-touch/utils'
import {
  appSettingOriginData,
  normalizeAutoResumeOnStartup
} from '@talex-touch/utils/common/storage/entity/app-settings'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createMainStorageAutoResumeReader,
  isAutoResumeOnStartupEnabled,
  resolveAutoResumeOnStartupFromSettings,
  setAutoResumeOnStartupReader
} from './auto-resume-setting'

describe('auto-resume-setting', () => {
  afterEach(() => {
    setAutoResumeOnStartupReader(null)
  })

  it('defaults conversation.autoResumeOnStartup to true in appSettingOriginData', () => {
    expect(appSettingOriginData.conversation.autoResumeOnStartup).toBe(true)
    expect(normalizeAutoResumeOnStartup(undefined)).toBe(true)
    expect(normalizeAutoResumeOnStartup(true)).toBe(true)
    expect(normalizeAutoResumeOnStartup(false)).toBe(false)
    expect(normalizeAutoResumeOnStartup('false')).toBe(true)
    expect(normalizeAutoResumeOnStartup(0)).toBe(true)
  })

  it('resolves autoResumeOnStartup from raw settings objects safely', () => {
    expect(resolveAutoResumeOnStartupFromSettings(undefined)).toBe(true)
    expect(resolveAutoResumeOnStartupFromSettings(null)).toBe(true)
    expect(resolveAutoResumeOnStartupFromSettings('invalid')).toBe(true)
    expect(resolveAutoResumeOnStartupFromSettings({})).toBe(true)
    expect(resolveAutoResumeOnStartupFromSettings({ conversation: null })).toBe(true)
    expect(resolveAutoResumeOnStartupFromSettings({ conversation: {} })).toBe(true)
    expect(
      resolveAutoResumeOnStartupFromSettings({ conversation: { autoResumeOnStartup: true } })
    ).toBe(true)
    expect(
      resolveAutoResumeOnStartupFromSettings({ conversation: { autoResumeOnStartup: false } })
    ).toBe(false)
  })

  it('reads from main storage only when ready and fails open to true on errors', () => {
    const getMainConfig = vi.fn().mockReturnValue({
      conversation: { autoResumeOnStartup: false }
    })

    const unreadyReader = createMainStorageAutoResumeReader({
      isMainStorageReady: () => false,
      getMainConfig
    })
    expect(unreadyReader()).toBe(true)
    expect(getMainConfig).not.toHaveBeenCalled()

    const readyReader = createMainStorageAutoResumeReader({
      isMainStorageReady: () => true,
      getMainConfig
    })
    expect(readyReader()).toBe(false)
    expect(getMainConfig).toHaveBeenCalledWith(StorageList.APP_SETTING)

    getMainConfig.mockReturnValueOnce({ conversation: { autoResumeOnStartup: true } })
    expect(readyReader()).toBe(true)

    getMainConfig.mockReturnValueOnce({})
    expect(readyReader()).toBe(true)

    const throwingReadyReader = createMainStorageAutoResumeReader({
      isMainStorageReady: () => {
        throw new Error('storage not initialized')
      },
      getMainConfig
    })
    expect(throwingReadyReader()).toBe(true)

    const throwingConfigReader = createMainStorageAutoResumeReader({
      isMainStorageReady: () => true,
      getMainConfig: () => {
        throw new Error('config read failed')
      }
    })
    expect(throwingConfigReader()).toBe(true)
  })

  it('manages the registered global reader with safe default, error fallback, and reset', () => {
    expect(isAutoResumeOnStartupEnabled()).toBe(true)

    setAutoResumeOnStartupReader(() => false)
    expect(isAutoResumeOnStartupEnabled()).toBe(false)

    setAutoResumeOnStartupReader(() => true)
    expect(isAutoResumeOnStartupEnabled()).toBe(true)

    setAutoResumeOnStartupReader(() => {
      throw new Error('boom')
    })
    expect(isAutoResumeOnStartupEnabled()).toBe(true)

    setAutoResumeOnStartupReader(() => false)
    expect(isAutoResumeOnStartupEnabled()).toBe(false)

    setAutoResumeOnStartupReader(null)
    expect(isAutoResumeOnStartupEnabled()).toBe(true)
  })
})
