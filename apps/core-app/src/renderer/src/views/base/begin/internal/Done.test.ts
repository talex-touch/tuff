// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  saveDurable: vi.fn(),
  hide: vi.fn(),
  step: vi.fn(),
  toastError: vi.fn(),
  loggerError: vi.fn(),
  loggerWarn: vi.fn(),
  appSetting: {
    beginner: { init: false, shortcutArmed: false },
    setup: { hideDock: false }
  }
}))

vi.mock('@talex-touch/utils/common/utils', () => ({
  sleep: vi.fn(async () => undefined)
}))

vi.mock('@talex-touch/utils/renderer', () => ({
  useAppSdk: () => ({ hide: mocks.hide })
}))

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({
    send: mocks.send,
    on: vi.fn(() => vi.fn())
  })
}))

vi.mock('@talex-touch/tuffex/button', () => ({
  TxButton: {
    name: 'TxButton',
    emits: ['click'],
    template: '<button type="button"><slot /></button>'
  }
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('vue-sonner', () => ({
  toast: { error: mocks.toastError }
}))

vi.mock('~/assets/lotties/welcome.json', () => ({ default: {} }))
vi.mock('~/components/icon/lotties/LottieFrame.vue', () => ({
  default: { template: '<div />' }
}))
vi.mock('~/modules/storage/app-storage', () => ({
  appSetting: mocks.appSetting,
  appSettingStore: { saveDurable: mocks.saveDurable }
}))
vi.mock('~/modules/platform/renderer-platform', () => ({
  useRendererPlatform: () => ({ isMac: { value: false } })
}))
vi.mock('~/utils/renderer-log', () => ({
  // Both levels: a double missing `warn` turned the retry path into a TypeError swallowed by the
  // component's own catch, which reads exactly like "the retry never happened".
  createRendererLogger: () => ({ error: mocks.loggerError, warn: mocks.loggerWarn })
}))

import Done from './Done.vue'

describe('onboarding completion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.appSetting.beginner.init = false
    mocks.appSetting.beginner.shortcutArmed = false
    mocks.appSetting.setup.hideDock = false
    mocks.hide.mockResolvedValue(undefined)
  })

  function mountDone() {
    return mount(Done, {
      global: {
        provide: { step: mocks.step }
      }
    })
  }

  it('persists completion before closing the guide', async () => {
    mocks.saveDurable.mockResolvedValue({ success: true, version: 1 })
    const wrapper = mountDone()

    wrapper.findComponent({ name: 'TxButton' }).vm.$emit('click')
    await vi.waitFor(() => expect(mocks.hide).toHaveBeenCalledOnce())

    expect(mocks.appSetting.beginner.init).toBe(true)
    // Routed through the store, not a raw transport send, so the store's version stays in
    // step with the server and the next autosave does not open with a stale version.
    expect(mocks.saveDurable).toHaveBeenCalledWith(
      expect.objectContaining({
        beginner: expect.objectContaining({ init: true, shortcutArmed: false })
      })
    )
    expect(mocks.step).toHaveBeenCalledWith({ comp: null })
    expect(mocks.hide).toHaveBeenCalledOnce()
  })

  it('preserves an explicit hide Dock false through shortcut completion', async () => {
    mocks.saveDurable.mockResolvedValue({ success: true, version: 1 })
    mountDone()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', ctrlKey: true }))
    await vi.waitFor(() => expect(mocks.hide).toHaveBeenCalledOnce())

    expect(mocks.appSetting.setup.hideDock).toBe(false)
    expect(mocks.saveDurable).toHaveBeenCalledWith(
      expect.objectContaining({ setup: expect.objectContaining({ hideDock: false }) })
    )
  })

  it('does not mutate the admission flag before durable persistence settles', async () => {
    let resolveSave!: (result: { success: boolean; version: number }) => void
    mocks.saveDurable.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve
        })
    )
    const wrapper = mountDone()

    wrapper.findComponent({ name: 'TxButton' }).vm.$emit('click')
    await vi.waitFor(() => expect(mocks.saveDurable).toHaveBeenCalledOnce())

    expect(mocks.appSetting.beginner.init).toBe(false)
    expect(mocks.hide).not.toHaveBeenCalled()

    resolveSave({ success: true, version: 1 })
    await vi.waitFor(() => expect(mocks.hide).toHaveBeenCalledOnce())
    expect(mocks.appSetting.beginner.init).toBe(true)
  })

  it('keeps onboarding open and restores state when persistence is rejected', async () => {
    mocks.saveDurable.mockResolvedValue({ success: false, version: 0 })
    const wrapper = mountDone()

    wrapper.findComponent({ name: 'TxButton' }).vm.$emit('click')
    await vi.waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith('beginner.done.persistFailed')
    )

    expect(mocks.appSetting.beginner.init).toBe(false)
    expect(mocks.appSetting.beginner.shortcutArmed).toBe(true)
    expect(mocks.step).not.toHaveBeenCalled()
    expect(mocks.hide).not.toHaveBeenCalled()
    expect(mocks.toastError).toHaveBeenCalledWith('beginner.done.persistFailed')
  })

  it('retries a transient failure instead of stranding the user on their first run', async () => {
    // This write has no later tick, so a single contended flush would otherwise put a dead end in
    // front of a first-run user.
    mocks.saveDurable
      .mockResolvedValueOnce({ success: false, version: 0, reason: 'transport' })
      .mockResolvedValueOnce({ success: true, version: 2 })
    const wrapper = mountDone()

    wrapper.findComponent({ name: 'TxButton' }).vm.$emit('click')
    await vi.waitFor(() => expect(mocks.appSetting.beginner.init).toBe(true))

    expect(mocks.saveDurable).toHaveBeenCalledTimes(2)
    expect(mocks.toastError).not.toHaveBeenCalled()
  })

  it('does not retry a conflict, which a newer value already won', async () => {
    // Resending the stale snapshot would only lose again; the user must re-read current state.
    mocks.saveDurable.mockResolvedValue({
      success: false,
      version: 5,
      conflict: true,
      reason: 'conflict'
    })
    const wrapper = mountDone()

    wrapper.findComponent({ name: 'TxButton' }).vm.$emit('click')
    await vi.waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith('beginner.done.persistFailed')
    )

    expect(mocks.saveDurable).toHaveBeenCalledTimes(1)
    expect(mocks.appSetting.beginner.init).toBe(false)
  })

  it('gives up after a bounded number of attempts', async () => {
    mocks.saveDurable.mockResolvedValue({ success: false, version: 0, reason: 'transport' })
    const wrapper = mountDone()

    wrapper.findComponent({ name: 'TxButton' }).vm.$emit('click')
    await vi.waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith('beginner.done.persistFailed')
    )

    // The user is waiting on a button; this must not loop.
    expect(mocks.saveDurable).toHaveBeenCalledTimes(3)
    expect(mocks.appSetting.beginner.init).toBe(false)
  })
})
