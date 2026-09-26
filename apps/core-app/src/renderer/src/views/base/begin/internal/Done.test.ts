// @vitest-environment jsdom

import type { ShortcutBinding } from '~/modules/channel/main/shortcon'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'

// The page listens for keys on `window`. A mounted page left behind by an earlier case would
// answer the next case's key press too, and every save/hide count would be off by one.
enableAutoUnmount(afterEach)

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
  // Key plus params, so a test reads which copy was chosen and which key went into it.
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key} ${JSON.stringify(params)}` : key
  })
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
/** What the main process reports for the CoreBox key, and the platform the page renders for. */
const coreBoxShortcut = ref<ShortcutBinding | null>(null)
const platform = ref('win32')
vi.mock('~/modules/shortcuts/useCoreBoxShortcut', () => ({
  useCoreBoxShortcut: () => ({ binding: coreBoxShortcut, platform })
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
    coreBoxShortcut.value = { configured: 'Alt+Space', effective: 'Alt+Space' }
    platform.value = 'win32'
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

    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', altKey: true }))
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

/**
 * The page teaches the key that opens CoreBox. It used to draw ⌘ + E whatever was bound; now it
 * draws what the main process reports: ⌥Space, or the key the user rebound it to.
 */
describe('onboarding shortcut keys', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.appSetting.beginner.init = false
    mocks.appSetting.beginner.shortcutArmed = false
    mocks.hide.mockResolvedValue(undefined)
    mocks.saveDurable.mockResolvedValue({ success: true, version: 1 })
    coreBoxShortcut.value = { configured: 'Alt+Space', effective: 'Alt+Space' }
    platform.value = 'darwin'
  })

  function mountDone() {
    return mount(Done, { global: { provide: { step: mocks.step } } })
  }

  function caps(wrapper: ReturnType<typeof mountDone>) {
    return wrapper.findAll('.BeginShortcutKey').map((cap) => ({
      label: cap.find('.BeginShortcutKey-Text').text(),
      symbol: cap.find('.BeginShortcutKey-Icon').exists()
        ? cap.find('.BeginShortcutKey-Icon').text()
        : null
    }))
  }

  function hint(wrapper: ReturnType<typeof mountDone>): string {
    return wrapper.find('.Done-Content > p').text()
  }

  it('teaches ⌥Space, and follows a rebind', async () => {
    const wrapper = mountDone()

    expect(caps(wrapper)).toEqual([
      { label: 'beginner.done.shortcut.option', symbol: '⌥' },
      { label: 'Space', symbol: null }
    ])
    expect(hint(wrapper)).toBe('beginner.done.shortcut.hint {"shortcut":"⌥ + Space"}')

    coreBoxShortcut.value = { configured: 'Command+Shift+K', effective: 'Command+Shift+K' }
    await nextTick()

    expect(caps(wrapper)).toEqual([
      { label: 'beginner.done.shortcut.command', symbol: '⌘' },
      { label: 'beginner.done.shortcut.shift', symbol: '⇧' },
      { label: 'K', symbol: null }
    ])
    expect(hint(wrapper)).toBe('beginner.done.shortcut.hint {"shortcut":"⌘ + ⇧ + K"}')
  })

  it('names the keys a PC keyboard prints', async () => {
    platform.value = 'win32'
    const wrapper = mountDone()

    expect(caps(wrapper)).toEqual([
      { label: 'beginner.done.shortcut.alt', symbol: null },
      { label: 'Space', symbol: null }
    ])
    expect(hint(wrapper)).toBe('beginner.done.shortcut.hint {"shortcut":"Alt + Space"}')

    coreBoxShortcut.value = { configured: 'Control+K', effective: 'Control+K' }
    await nextTick()

    expect(caps(wrapper)).toEqual([
      { label: 'beginner.done.shortcut.ctrl', symbol: null },
      { label: 'K', symbol: null }
    ])
  })

  it('names the stored key when no key is live, rather than a default it is not set to', () => {
    coreBoxShortcut.value = { configured: 'Command+K', effective: null }
    const wrapper = mountDone()

    expect(caps(wrapper)).toEqual([
      { label: 'beginner.done.shortcut.command', symbol: '⌘' },
      { label: 'K', symbol: null }
    ])
  })

  it.each(['darwin', 'win32', 'linux'])(
    'warns under the keys on %s that another app may already answer them',
    (os) => {
      // macOS registers the key even while Raycast, Alfred or ChatGPT holds it, so the page is the
      // only place the user hears about it; shown on every platform, whatever the key.
      platform.value = os
      const wrapper = mountDone()

      const hint = wrapper.find('.Done-Shortcut .Done-ShortcutConflict')
      expect(hint.exists()).toBe(true)
      expect(hint.text()).toBe('beginner.done.shortcut.conflictHint')
    }
  )

  it('lights each key while it is held', async () => {
    const wrapper = mountDone()
    const option = () => wrapper.findAll('.BeginShortcutKey')[0]!.attributes('aria-pressed')

    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Alt', code: 'AltLeft', altKey: true })
    )
    await nextTick()
    expect(option()).toBe('true')

    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt', code: 'AltLeft', altKey: false }))
    await nextTick()
    expect(option()).toBe('false')
  })

  it('completes on the key it teaches, and no longer on the old ⌘E', async () => {
    mountDone()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', code: 'KeyE', metaKey: true }))
    // The finish flow is a promise chain; a single tick would pass before it got to saving.
    await flushPromises()
    expect(mocks.saveDurable).not.toHaveBeenCalled()
    expect(mocks.hide).not.toHaveBeenCalled()

    // Option rewrites `key` on a Mac: ⌥Space types a no-break space, so only `code` says Space.
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: '\u00A0', code: 'Space', altKey: true })
    )
    await vi.waitFor(() => expect(mocks.hide).toHaveBeenCalledOnce())
  })
})
