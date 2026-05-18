import { describe, expect, it } from 'vitest'
import { resolveCoreBoxCompletionDisplay } from './completion-display'

const t = (key: string, params?: Record<string, unknown>) => {
  if (key === 'corebox.systemActions.screenshotCursorDisplayTitle') {
    return `截图并复制 ${params?.name ?? ''}`.trim()
  }
  return key
}

describe('CoreBox completion display', () => {
  it('resolves i18n completion text before display', () => {
    expect(
      resolveCoreBoxCompletionDisplay(
        '$i18n:corebox.systemActions.screenshotCursorDisplayTitle|{"name":"cursor-display"}',
        'screenshot',
        t
      )
    ).toBe('截图并复制 cursor-display')
  })

  it('keeps prefix trimming for plain completion text', () => {
    expect(resolveCoreBoxCompletionDisplay('screenshot capture', 'screenshot', t)).toBe(' capture')
  })
})
