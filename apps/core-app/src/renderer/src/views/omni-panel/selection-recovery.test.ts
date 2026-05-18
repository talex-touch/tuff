import { describe, expect, it } from 'vitest'
import {
  createOmniPanelSelectionPreview,
  resolveOmniPanelSelectionRecovery
} from './selection-recovery'

describe('omni-panel selection recovery', () => {
  it('returns a ready hint when selected text exists', () => {
    expect(
      resolveOmniPanelSelectionRecovery({
        hasSelection: true,
        selectedText: ' selected text '
      })
    ).toEqual({
      tone: 'neutral',
      labelKey: 'corebox.omniPanel.selectionHint.ready',
      fallback: 'Selection ready.',
      detail: 'selected text'
    })
  })

  it('returns unsupported guidance for unsupported selection capture', () => {
    expect(
      resolveOmniPanelSelectionRecovery({
        hasSelection: false,
        selectedText: '',
        issueCode: 'unsupported',
        issueMessage: 'Wayland session'
      })
    ).toEqual({
      tone: 'warning',
      labelKey: 'corebox.omniPanel.selectionHint.unsupported',
      fallback: 'Selected-text capture is not supported here. Paste text or use clipboard input.',
      detail: 'Wayland session'
    })
  })

  it('returns permission guidance for failed selection capture', () => {
    expect(
      resolveOmniPanelSelectionRecovery({
        hasSelection: false,
        selectedText: '',
        issueCode: 'failed'
      })
    ).toEqual({
      tone: 'danger',
      labelKey: 'corebox.omniPanel.selectionHint.failed',
      fallback: 'Selected-text capture failed. Check desktop automation permissions, then retry.',
      detail: null
    })
  })

  it('normalizes and truncates selected text preview', () => {
    expect(createOmniPanelSelectionPreview('a\nb\tc')).toBe('a b c')
    expect(createOmniPanelSelectionPreview('a'.repeat(30), 12)).toBe('aaaaaaaaa...')
  })
})
