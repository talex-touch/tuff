import { describe, expect, it } from 'vitest'
import { resolveCoreBoxFlowShortcut } from './key-event'

function shortcutInput(overrides: Partial<Parameters<typeof resolveCoreBoxFlowShortcut>[0]> = {}) {
  return {
    key: 'd',
    meta: false,
    control: false,
    alt: false,
    shift: false,
    isAutoRepeat: false,
    ...overrides
  }
}

describe('resolveCoreBoxFlowShortcut', () => {
  it('maps Command/Ctrl+D to detach', () => {
    expect(resolveCoreBoxFlowShortcut(shortcutInput({ meta: true }))).toBe('detach')
    expect(resolveCoreBoxFlowShortcut(shortcutInput({ control: true }))).toBe('detach')
  })

  it('maps Command/Ctrl+Shift+D to transfer', () => {
    expect(resolveCoreBoxFlowShortcut(shortcutInput({ meta: true, shift: true }))).toBe('transfer')
    expect(resolveCoreBoxFlowShortcut(shortcutInput({ control: true, shift: true }))).toBe(
      'transfer'
    )
  })

  it('rejects non-context combinations and key repeats', () => {
    expect(resolveCoreBoxFlowShortcut(shortcutInput())).toBeNull()
    expect(resolveCoreBoxFlowShortcut(shortcutInput({ meta: true, alt: true }))).toBeNull()
    expect(resolveCoreBoxFlowShortcut(shortcutInput({ meta: true, key: 'x' }))).toBeNull()
    expect(resolveCoreBoxFlowShortcut(shortcutInput({ meta: true, isAutoRepeat: true }))).toBeNull()
  })
})
