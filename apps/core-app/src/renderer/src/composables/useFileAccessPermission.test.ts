import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  toastError: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
  appSetting: {
    setup: {
      fileAccess: false,
      fileAccessRootKey: ''
    }
  }
}))

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({ send: mocks.send })
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('vue-sonner', () => ({
  toast: {
    error: mocks.toastError,
    info: vi.fn()
  }
}))

vi.mock('~/modules/storage/app-storage', () => ({
  appSetting: mocks.appSetting
}))

vi.mock('~/utils/renderer-log', () => ({
  createRendererLogger: () => ({
    warn: mocks.loggerWarn,
    error: mocks.loggerError
  })
}))

import { useFileAccessPermission } from './useFileAccessPermission'

describe('useFileAccessPermission openSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reports a handled open-settings failure', async () => {
    mocks.send.mockResolvedValue(false)

    await useFileAccessPermission().openSettings()

    expect(mocks.loggerWarn).toHaveBeenCalledWith('System settings did not open')
    expect(mocks.toastError).toHaveBeenCalledWith('setupPermissions.requestFailed')
  })

  it('does not report an error when settings opened', async () => {
    mocks.send.mockResolvedValue(true)

    await useFileAccessPermission().openSettings()

    expect(mocks.loggerWarn).not.toHaveBeenCalled()
    expect(mocks.toastError).not.toHaveBeenCalled()
  })
})
