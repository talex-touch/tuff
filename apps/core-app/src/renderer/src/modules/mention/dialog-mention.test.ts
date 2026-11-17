// @vitest-environment jsdom
/* eslint-disable vue/one-component-per-file */

import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, inject, nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import AppUpgradationView from '~/components/base/AppUpgradationView.vue'
import RebuildConfirmDialog from '~/views/base/settings/components/RebuildConfirmDialog.vue'
import { useDialogManager } from './dialog-manager'
import {
  blowMention,
  captureAppContext,
  forApplyMention,
  forTouchTip,
  popperMention
} from './dialog-mention'

const coreBoxState = vi.hoisted(() => ({ active: false }))

vi.mock('@talex-touch/utils/renderer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@talex-touch/utils/renderer')>()
  return {
    ...actual,
    isCoreBox: () => coreBoxState.active
  }
})

vi.mock('~/components/base/input/FlatMarkdown.vue', () => ({
  default: defineComponent({
    name: 'FlatMarkdown',
    props: { modelValue: { type: String, default: '' } },
    setup(props) {
      return () => h('div', { class: 'flat-markdown-stub' }, props.modelValue)
    }
  })
}))

vi.mock('~/modules/lang/useI18nText', () => ({
  useI18nText: () => ({
    t: (key: string) =>
      ({
        'common.confirm': 'Confirm',
        'common.close': 'Close'
      })[key] ?? key
  })
}))

const matchMediaMock = vi.hoisted(() =>
  vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => true)
  }))
)

let hostWrapper: { unmount: () => void } | null = null

function installCapturedAppContext(): void {
  const i18n = createI18n({
    legacy: false,
    locale: 'en-US',
    messages: {
      'en-US': {
        common: { confirm: 'Confirm', cancel: 'Cancel', close: 'Close' },
        settings: {
          updateModal: {
            title: 'Release Notes',
            publishedAt: 'Published {time}',
            skip: 'Skip',
            remindLater: 'Later',
            updateNow: 'Update Now'
          },
          settingFileIndex: {
            rebuildTitle: 'Rebuild Index',
            batteryStatus: '{level}%',
            warningBatterySimple: 'Battery {min} / {critical} {hint}',
            warningBatteryCritical: 'Critical {critical}',
            warningSearchSimple: 'Search paused',
            warningPerformanceSimple: 'CPU usage'
          }
        }
      }
    }
  })
  const Host = defineComponent({
    setup() {
      captureAppContext()
      return () => h('div', { id: 'app' })
    }
  })
  hostWrapper = mount(Host, { attachTo: document.body, global: { plugins: [i18n] } })
}

function resetBodyScrollLock(): void {
  document.body.style.overflow = ''
  document.body.style.paddingRight = ''
  delete document.body.dataset.txFlipOverlayLockCount
  delete document.body.dataset.txFlipOverlayLockOverflow
  delete document.body.dataset.txFlipOverlayLockPaddingRight
}

describe('dialog-mention with TuffEx dialogs', () => {
  beforeEach(() => {
    coreBoxState.active = false
    vi.useFakeTimers()
    vi.stubGlobal('matchMedia', matchMediaMock)
    document.body.innerHTML = ''
    resetBodyScrollLock()
    installCapturedAppContext()
  })

  afterEach(() => {
    if (!coreBoxState.active) {
      useDialogManager().clearAll()
    }
    hostWrapper?.unmount()
    hostWrapper = null
    vi.useRealTimers()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
    resetBodyScrollLock()
  })

  it('forTouchTip mounts TxTouchTip without a fixed host overlay, maps danger/default buttons, and resolves on close', async () => {
    let settled = false
    const onStay = vi.fn(async () => false)
    const onOpen = vi.fn(async () => true)

    const rawPending = forTouchTip(
      'External Link',
      'https://example.com',
      [
        { content: 'Cancel', type: 'default', onClick: onStay },
        { content: 'Open', type: 'danger', onClick: onOpen }
      ],
      'ext-link-1'
    )
    const pending = rawPending.then(() => {
      settled = true
    })

    // Repeated call with same atomicKey returns the same pending promise without creating another dialog.
    const duplicate = forTouchTip('External Link', 'https://example.com', undefined, 'ext-link-1')
    expect(duplicate).toBe(rawPending)
    expect(document.body.querySelectorAll('.tx-touch-tip')).toHaveLength(1)

    const hostRoot = document.body.querySelector<HTMLElement>('[id^="touch-tip-"]')
    expect(hostRoot).toBeTruthy()
    expect(hostRoot?.style.position).toBe('')
    expect(useDialogManager().getStackSize()).toBe(1)

    const tip = document.body.querySelector<HTMLElement>('.tx-touch-tip')
    expect(tip).toBeTruthy()
    expect(tip?.querySelector('.tx-base-surface--refraction')).toBeTruthy()

    const buttons = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>('.tx-touch-tip__btn')
    )
    expect(buttons).toHaveLength(2)
    expect(buttons[1]?.classList.contains('tone-danger')).toBe(true)

    buttons[0]?.click()
    await vi.advanceTimersByTimeAsync(120)
    expect(onStay).toHaveBeenCalledTimes(1)
    expect(settled).toBe(false)

    buttons[1]?.click()
    await vi.advanceTimersByTimeAsync(400)
    await pending

    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(settled).toBe(true)
    expect(useDialogManager().getStackSize()).toBe(0)
    expect(document.body.querySelector('[id^="touch-tip-"]')).toBeNull()
    expect(document.body.querySelector('.tx-touch-tip')).toBeNull()
  })

  it('forTouchTip resolves and cleans up when dismissed via Escape', async () => {
    const pending = forTouchTip('Notice', 'Press escape')

    const dialog = document.body.querySelector<HTMLElement>('.tx-touch-tip__container')
    expect(dialog).toBeTruthy()

    dialog?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await vi.advanceTimersByTimeAsync(280)
    await pending

    expect(useDialogManager().getStackSize()).toBe(0)
    expect(document.body.querySelector('.tx-touch-tip')).toBeNull()
  })

  it('forApplyMention mounts TxBottomDialog with localized closeLabel and awaits close', async () => {
    let settled = false
    const onConfirm = vi.fn(() => true)

    const pending = forApplyMention('Apply Update', 'Ready to apply', [
      { content: 'Delete', type: 'error', onClick: onConfirm }
    ]).then(() => {
      settled = true
    })

    const closeBtn = document.body.querySelector<HTMLButtonElement>('.tx-bottom-dialog__close')
    expect(closeBtn?.getAttribute('aria-label')).toBe('Close')
    expect(
      document.body.querySelector('.tx-bottom-dialog .tx-base-surface--refraction')
    ).toBeTruthy()

    const rows = document.body.querySelectorAll<HTMLButtonElement>('.tx-bottom-dialog__row')
    expect(rows[0]?.classList.contains('is-danger')).toBe(true)

    expect(settled).toBe(false)
    closeBtn?.click()
    await vi.advanceTimersByTimeAsync(150)
    await pending

    expect(settled).toBe(true)
    expect(onConfirm).not.toHaveBeenCalled()
    expect(useDialogManager().getStackSize()).toBe(0)
    expect(document.body.querySelector('[id^="bottom-dialog-"]')).toBeNull()
  })

  it('blowMention mounts TxBlowDialog for message, render, and comp payloads and resolves prop name on close', async () => {
    const messagePromise = blowMention('Heads up', 'Plain text message')
    const confirmBtn = document.body.querySelector<HTMLButtonElement>('.tx-blow-dialog__confirm')
    expect(confirmBtn?.textContent?.trim()).toBe('Confirm')
    expect(document.getElementById('app')?.style.transform).toBe('scale(1.25)')

    confirmBtn?.click()
    await vi.advanceTimersByTimeAsync(550)
    await expect(messagePromise).resolves.toBe('message')
    expect(document.getElementById('app')?.style.transform).toBe('')

    const RenderChild = defineComponent({
      setup() {
        const destroy = inject<() => void>('destroy')
        return () =>
          h(
            'button',
            { type: 'button', class: 'custom-blow-close', onClick: () => destroy?.() },
            'Close custom'
          )
      }
    })

    const renderPromise = blowMention('Custom render', () => h(RenderChild))
    await nextTick()
    const customBlowBtn = document.body.querySelector<HTMLButtonElement>('.custom-blow-close')
    expect(customBlowBtn).toBeTruthy()
    customBlowBtn?.click()
    await vi.advanceTimersByTimeAsync(550)
    await expect(renderPromise).resolves.toBe('render')

    const compPromise = blowMention('Custom comp', RenderChild)
    await nextTick()
    const compBlowBtn = document.body.querySelector<HTMLButtonElement>('.custom-blow-close')
    expect(compBlowBtn).toBeTruthy()
    compBlowBtn?.click()
    await vi.advanceTimersByTimeAsync(550)
    await expect(compPromise).resolves.toBe('comp')
    expect(useDialogManager().getStackSize()).toBe(0)
  })

  it('popperMention mounts TxPopperDialog, supports inject("destroy"), Escape, and awaits close', async () => {
    let closed = false
    const CustomPopperBody = defineComponent({
      setup() {
        const destroy = inject<() => void>('destroy')
        return () =>
          h(
            'button',
            { type: 'button', class: 'custom-popper-close', onClick: () => destroy?.() },
            'Done'
          )
      }
    })

    const customPromise = popperMention('Rebuild', () => h(CustomPopperBody)).then(() => {
      closed = true
    })

    await nextTick()
    expect(closed).toBe(false)
    expect(
      document.body.querySelector('.tx-popper-dialog .tx-base-surface--refraction')
    ).toBeTruthy()
    const customPopperBtn = document.body.querySelector<HTMLButtonElement>('.custom-popper-close')
    expect(customPopperBtn).toBeTruthy()
    customPopperBtn?.click()
    await vi.advanceTimersByTimeAsync(250)
    await customPromise
    expect(closed).toBe(true)

    const escPromise = popperMention('Notice', 'Press escape to dismiss')
    const dialog = document.body.querySelector<HTMLElement>('.tx-popper-dialog')
    expect(
      document.body
        .querySelector<HTMLButtonElement>('.tx-popper-dialog__confirm')
        ?.textContent?.trim()
    ).toBe('Confirm')

    dialog?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await vi.advanceTimersByTimeAsync(250)
    await escPromise

    expect(useDialogManager().getStackSize()).toBe(0)
    expect(document.body.querySelector('[id^="popper-dialog-"]')).toBeNull()
  })

  it('cleans up host container and rejects when invoked inside CoreBox', async () => {
    coreBoxState.active = true

    await expect(forTouchTip('Blocked', 'Not allowed')).rejects.toThrow('CoreBox')
    expect(document.body.querySelector('[id^="touch-tip-"]')).toBeNull()
    expect(document.body.querySelector('.tx-touch-tip')).toBeNull()
  })

  it('migrated caller AppUpgradationView closes TxBlowDialog via inject("destroy") and emits action', async () => {
    const onUpdateNow = vi.fn()
    const pending = blowMention('Update Available', () =>
      h(AppUpgradationView, {
        release: { published_at: '2026-11-17T00:00:00Z', body: 'Bug fixes' },
        onUpdateNow
      })
    )

    await nextTick()
    const updateBtn = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>('.AppUpgradation-Content .tx-button')
    ).find((btn) => btn.textContent?.includes('Update Now'))
    expect(updateBtn).toBeTruthy()

    updateBtn?.click()
    await vi.advanceTimersByTimeAsync(550)
    await expect(pending).resolves.toBe('render')
    expect(onUpdateNow).toHaveBeenCalledTimes(1)
    expect(document.getElementById('app')?.style.transform).toBe('')
  })

  it('migrated caller RebuildConfirmDialog works inside TxPopperDialog for both confirm and Escape', async () => {
    const onConfirm = vi.fn()
    const confirmPromise = popperMention('Rebuild Index', () =>
      h(RebuildConfirmDialog, {
        onConfirm
      })
    )

    await nextTick()
    // Advance 3 seconds for the confirmation countdown inside RebuildConfirmDialog.
    await vi.advanceTimersByTimeAsync(3000)

    const confirmBtn = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>('.rebuild-confirm-dialog .tx-button')
    ).find((btn) => btn.textContent?.trim() === 'Confirm')
    expect(confirmBtn?.disabled).toBe(false)
    confirmBtn?.click()

    await vi.advanceTimersByTimeAsync(250)
    await confirmPromise
    expect(onConfirm).toHaveBeenCalledTimes(1)

    const escapePromise = popperMention('Rebuild Index', () =>
      h(RebuildConfirmDialog, {
        onConfirm
      })
    )
    await nextTick()
    document.body
      .querySelector<HTMLElement>('.tx-popper-dialog')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await vi.advanceTimersByTimeAsync(250)
    await escapePromise

    expect(useDialogManager().getStackSize()).toBe(0)
    expect(document.body.querySelector('.tx-popper-dialog')).toBeNull()
  })
})
