import type { TuffItem } from '@talex-touch/utils'
import { describe, expect, it } from 'vitest'
import { resolveCoreBoxFooterTitle } from './coreBoxFooterDisplay'

const t = (key: string, params?: Record<string, unknown>) => {
  if (key === 'corebox.systemActions.screenshotCursorDisplayTitle') {
    return `截图并复制 ${params?.name ?? ''}`.trim()
  }
  return key
}

function itemWithTitle(title: string): TuffItem {
  return {
    id: 'footer-item',
    kind: 'app',
    render: {
      mode: 'default',
      basic: {
        title
      }
    }
  } as TuffItem
}

describe('CoreBox footer display', () => {
  it('resolves i18n item titles before rendering footer labels', () => {
    expect(
      resolveCoreBoxFooterTitle(
        itemWithTitle(
          '$i18n:corebox.systemActions.screenshotCursorDisplayTitle|{"name":"cursor-display"}'
        ),
        t
      )
    ).toBe('截图并复制 cursor-display')
  })

  it('keeps plain titles and falls back to CoreBox when item is empty', () => {
    expect(resolveCoreBoxFooterTitle(itemWithTitle('Calendar'), t)).toBe('Calendar')
    expect(resolveCoreBoxFooterTitle(null, t)).toBe('CoreBox')
  })
})
