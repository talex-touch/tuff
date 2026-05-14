import { describe, expect, it } from 'vitest'
import {
  createDesktopContextCapsule,
  resolveDesktopContextInput,
  summarizeDesktopContextCapsule
} from './desktop-context-capsule'

describe('desktop context capsule', () => {
  it('normalizes transient desktop context fields', () => {
    const capsule = createDesktopContextCapsule({
      selectionText: ' selected ',
      clipboardText: ' clipboard ',
      ocrText: ' ',
      appName: ' Editor ',
      windowTitle: ' Draft ',
      capturedAt: 123,
      source: 'omni-panel'
    })

    expect(capsule).toEqual({
      selectionText: 'selected',
      clipboardText: 'clipboard',
      appName: 'Editor',
      windowTitle: 'Draft',
      capturedAt: 123,
      source: 'omni-panel'
    })
  })

  it('resolves explicit text before capsule fallback text', () => {
    const capsule = createDesktopContextCapsule({
      clipboardText: 'clipboard',
      ocrText: 'ocr',
      source: 'workflow'
    })

    expect(resolveDesktopContextInput(' selected ', capsule)).toBe('selected')
    expect(resolveDesktopContextInput('', capsule)).toBe('clipboard')
  })

  it('summarizes available context kinds without raw text', () => {
    const capsule = createDesktopContextCapsule({
      selectionText: 'secret selection',
      clipboardText: 'secret clipboard',
      appName: 'Editor',
      windowTitle: 'Draft',
      capturedAt: 123,
      source: 'corebox'
    })

    const summary = summarizeDesktopContextCapsule(capsule)

    expect(summary).toEqual({
      contextKinds: ['selection', 'clipboard', 'activeApp'],
      source: 'corebox',
      capturedAt: 123
    })
    expect(JSON.stringify(summary)).not.toContain('secret')
  })
})
