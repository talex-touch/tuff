// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_HINT_HOLD_DELAY_MS,
  DEFAULT_TYPING_COOLDOWN_MS,
  installMainWindowShortcutCapture,
  isEditableElement,
  isUserTyping,
  mainWindowHintsVisible,
  resetMainWindowShortcutsState
} from './main-window-shortcuts'

describe('mainWindowShortcuts hold delay and typing detection', () => {
  let disposeCapture: (() => void) | null = null

  beforeEach(() => {
    vi.useFakeTimers()
    resetMainWindowShortcutsState()
  })

  afterEach(() => {
    disposeCapture?.()
    disposeCapture = null
    resetMainWindowShortcutsState()
    vi.useRealTimers()
  })

  function pressMeta(): void {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Meta', bubbles: true }))
  }

  function releaseMeta(): void {
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Meta', bubbles: true }))
  }

  function pressControl(): void {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Control', bubbles: true }))
  }

  function releaseControl(): void {
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Control', bubbles: true }))
  }

  it('identifies editable elements correctly', () => {
    const textInput = document.createElement('input')
    textInput.type = 'text'
    expect(isEditableElement(textInput)).toBe(true)

    const textarea = document.createElement('textarea')
    expect(isEditableElement(textarea)).toBe(true)

    const button = document.createElement('input')
    button.type = 'button'
    expect(isEditableElement(button)).toBe(false)

    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    expect(isEditableElement(checkbox)).toBe(false)

    const contentEditable = document.createElement('div')
    contentEditable.contentEditable = 'true'
    expect(isEditableElement(contentEditable)).toBe(true)

    const normalDiv = document.createElement('div')
    expect(isEditableElement(normalDiv)).toBe(false)
  })

  it('does not open hints before 300ms, and opens hints after holding 300ms', () => {
    disposeCapture = installMainWindowShortcutCapture({ isMac: () => true })

    pressMeta()
    expect(mainWindowHintsVisible.value).toBe(false)

    vi.advanceTimersByTime(DEFAULT_HINT_HOLD_DELAY_MS - 1)
    expect(mainWindowHintsVisible.value).toBe(false)

    vi.advanceTimersByTime(1)
    expect(mainWindowHintsVisible.value).toBe(true)

    releaseMeta()
    expect(mainWindowHintsVisible.value).toBe(false)
  })

  it('never opens hints if Meta is released before 300ms', () => {
    disposeCapture = installMainWindowShortcutCapture({ isMac: () => true })

    pressMeta()
    vi.advanceTimersByTime(150)
    releaseMeta()

    vi.advanceTimersByTime(200)
    expect(mainWindowHintsVisible.value).toBe(false)
  })

  it('cancels the hint timer if another key is pressed (chord shortcut)', () => {
    disposeCapture = installMainWindowShortcutCapture({ isMac: () => true })

    pressMeta()
    vi.advanceTimersByTime(100)

    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'c', code: 'KeyC', metaKey: true, bubbles: true })
    )

    vi.advanceTimersByTime(300)
    expect(mainWindowHintsVisible.value).toBe(false)

    releaseMeta()
  })

  it('immediately hides visible hints if a key is pressed while holding', () => {
    disposeCapture = installMainWindowShortcutCapture({ isMac: () => true })

    pressMeta()
    vi.advanceTimersByTime(DEFAULT_HINT_HOLD_DELAY_MS)
    expect(mainWindowHintsVisible.value).toBe(true)

    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'n', code: 'KeyN', metaKey: true, bubbles: true })
    )
    expect(mainWindowHintsVisible.value).toBe(false)

    releaseMeta()
  })

  it('does not trigger hints when user is typing in an editable element', () => {
    disposeCapture = installMainWindowShortcutCapture({ isMac: () => true })

    const textarea = document.createElement('textarea')
    document.body.appendChild(textarea)
    textarea.focus()

    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }))
    textarea.dispatchEvent(new Event('input', { bubbles: true }))

    expect(isUserTyping()).toBe(true)

    pressMeta()
    vi.advanceTimersByTime(DEFAULT_HINT_HOLD_DELAY_MS)
    expect(mainWindowHintsVisible.value).toBe(false)

    document.body.removeChild(textarea)
  })

  it('allows hints after the typing cooldown window has elapsed', () => {
    disposeCapture = installMainWindowShortcutCapture({ isMac: () => true })

    const textarea = document.createElement('textarea')
    document.body.appendChild(textarea)
    textarea.focus()

    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }))
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    expect(isUserTyping()).toBe(true)

    vi.advanceTimersByTime(DEFAULT_TYPING_COOLDOWN_MS + 1)
    expect(isUserTyping()).toBe(false)

    pressMeta()
    vi.advanceTimersByTime(DEFAULT_HINT_HOLD_DELAY_MS)
    expect(mainWindowHintsVisible.value).toBe(true)

    releaseMeta()
    document.body.removeChild(textarea)
  })

  it('suppresses hints during active IME composition', () => {
    disposeCapture = installMainWindowShortcutCapture({ isMac: () => true })

    window.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    expect(isUserTyping()).toBe(true)

    pressMeta()
    vi.advanceTimersByTime(DEFAULT_HINT_HOLD_DELAY_MS)
    expect(mainWindowHintsVisible.value).toBe(false)

    window.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))

    vi.advanceTimersByTime(DEFAULT_TYPING_COOLDOWN_MS + 1)
    expect(isUserTyping()).toBe(false)
  })

  it('hides hints on window blur', () => {
    disposeCapture = installMainWindowShortcutCapture({ isMac: () => true })

    pressMeta()
    vi.advanceTimersByTime(DEFAULT_HINT_HOLD_DELAY_MS)
    expect(mainWindowHintsVisible.value).toBe(true)

    window.dispatchEvent(new Event('blur'))
    expect(mainWindowHintsVisible.value).toBe(false)
  })

  it('supports Windows/Linux Control modifier key', () => {
    disposeCapture = installMainWindowShortcutCapture({ isMac: () => false })

    pressControl()
    vi.advanceTimersByTime(DEFAULT_HINT_HOLD_DELAY_MS - 1)
    expect(mainWindowHintsVisible.value).toBe(false)

    vi.advanceTimersByTime(1)
    expect(mainWindowHintsVisible.value).toBe(true)

    releaseControl()
    expect(mainWindowHintsVisible.value).toBe(false)
  })
})
