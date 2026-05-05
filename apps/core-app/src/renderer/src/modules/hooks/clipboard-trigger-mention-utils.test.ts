import { describe, expect, it } from 'vitest'
import { resolveClipboardTriggerMention } from './clipboard-trigger-mention-utils'

const dictionary: Record<string, string> = {
  'tagSection.copiedText': 'Copied Text',
  'tagSection.copiedImage': 'Copied Image',
  'tagSection.copiedHtml': 'Copied Html',
  'notifications.clipboardTextEmpty': 'Clipboard text is empty.',
  'notifications.clipboardImageBody': 'Image content is ready to use.',
  'notifications.clipboardHtmlBody': 'HTML content is ready to use.'
}

const t = (key: string): string => dictionary[key] ?? key

describe('resolveClipboardTriggerMention', () => {
  it('escapes clipboard text and keeps readable line breaks', () => {
    expect(
      resolveClipboardTriggerMention(
        {
          type: 'text',
          data: '<b>Hello</b>\nWorld'
        },
        t
      )
    ).toEqual({
      title: 'Copied Text',
      message: '&lt;b&gt;Hello&lt;/b&gt;<br />World'
    })
  })

  it('uses a fallback body for empty clipboard text', () => {
    expect(
      resolveClipboardTriggerMention(
        {
          type: 'text',
          data: '   '
        },
        t
      )
    ).toEqual({
      title: 'Copied Text',
      message: 'Clipboard text is empty.'
    })
  })

  it('maps image and html clipboard triggers to generic readable copy', () => {
    expect(
      resolveClipboardTriggerMention(
        {
          type: 'image',
          data: 'data:image/png;base64,abc'
        },
        t
      )
    ).toEqual({
      title: 'Copied Image',
      message: 'Image content is ready to use.'
    })

    expect(
      resolveClipboardTriggerMention(
        {
          type: 'html',
          data: '<div>Hello</div>'
        },
        t
      )
    ).toEqual({
      title: 'Copied Html',
      message: 'HTML content is ready to use.'
    })
  })

  it('returns null for unsupported clipboard payload types', () => {
    expect(
      resolveClipboardTriggerMention(
        {
          type: 'files',
          data: '[]'
        },
        t
      )
    ).toBeNull()
  })
})
