import { enMessages, zhMessages } from '@talex-touch/utils/i18n'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import enUS from '../../../../renderer/src/modules/lang/en-US.json'
import zhCN from '../../../../renderer/src/modules/lang/zh-CN.json'
import { readItemActionHint, showItemActionHint } from './item-action-hint'

const host = vi.hoisted(() => ({
  locale: 'zh-CN' as 'zh-CN' | 'en-US',
  show: vi.fn(),
  warn: vi.fn()
}))

vi.mock('../../../utils/i18n-helper', () => {
  const catalogs = { 'zh-CN': zhCN, 'en-US': enUS } as Record<string, unknown>
  return {
    getLocale: () => host.locale,
    t: (key: string, params?: Record<string, string>) => {
      let value: unknown = catalogs[host.locale]
      for (const part of key.split('.')) value = (value as Record<string, unknown>)?.[part]
      if (typeof value !== 'string') throw new Error(`missing catalog key ${key}`)
      return value.replace(/\{(\w+)\}/g, (_, name: string) => params?.[name] ?? '')
    }
  }
})

vi.mock('../../notification', () => ({
  notificationModule: { showInternalSystemNotification: host.show }
}))

vi.mock('@talex-touch/utils/common/logger', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getLogger: () => ({ warn: host.warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() })
}))

beforeEach(() => {
  host.locale = 'zh-CN'
  host.show.mockReset()
  host.warn.mockReset()
})

describe('readItemActionHint', () => {
  it('reads a success message', () => {
    expect(readItemActionHint({ success: true, message: '已处理 3 个窗口' }, false)).toEqual({
      level: 'success',
      message: '已处理 3 个窗口'
    })
  })

  it('reads a failure message at error level', () => {
    expect(readItemActionHint({ success: false, message: '复制失败' }, true)).toEqual({
      level: 'error',
      message: '复制失败'
    })
  })

  it.each([
    ['a void result', undefined],
    ['a null result', null],
    ['a string result', 'copied'],
    ['no message', { success: true }],
    ['an empty message', { message: '' }],
    ['a blank message', { message: '   \n\t ' }],
    ['a number', { message: 42 }],
    ['an object', { message: { default: 'Copied', locales: { 'zh-CN': '已复制' } } }],
    ['an array', { message: ['copied'] }],
    ['a null message', { message: null }]
  ])('shows nothing for %s', (_label, result) => {
    expect(readItemActionHint(result, false)).toBeNull()
  })

  it('strips control characters and folds line breaks into spaces', () => {
    const message = 'line one\r\nline\ttwo\u0000\u001b[31m\u007f\u009f'
    expect(readItemActionHint({ message }, false)?.message).toBe('line one line two [31m')
  })

  it('removes bidi overrides, zero-width marks and lone surrogates', () => {
    const message = 'a\u202eb\u2066c\u200bd\ufeffe\ud800f'
    expect(readItemActionHint({ message }, false)?.message).toBe('abcdef')
  })

  it('shows nothing for text that is invisible once stripped', () => {
    expect(readItemActionHint({ message: '\u200b\u200d\u202e \u0007 \ufeff' }, false)).toBeNull()
  })

  it('cuts long text at 200 characters with an ellipsis', () => {
    const hint = readItemActionHint({ message: 'x'.repeat(5000) }, false)
    expect(hint?.message).toBe(`${'x'.repeat(200)}…`)
  })

  it('keeps text of exactly 200 characters whole', () => {
    const text = 'y'.repeat(200)
    expect(readItemActionHint({ message: text }, false)?.message).toBe(text)
  })

  it('never cuts an astral character in half', () => {
    const hint = readItemActionHint({ message: '😀'.repeat(300) }, false)
    expect(hint?.message).toBe(`${'😀'.repeat(200)}…`)
  })

  it('does not leave a space before the ellipsis', () => {
    const hint = readItemActionHint({ message: `${'z'.repeat(199)} ${'z'.repeat(50)}` }, false)
    expect(hint?.message).toBe(`${'z'.repeat(199)}…`)
  })

  it('resolves a $i18n: message in the host language', () => {
    const message = '$i18n:flowTransfer.copiedToClipboard'
    expect(readItemActionHint({ message }, false)?.message).toBe(
      zhMessages.flowTransfer.copiedToClipboard
    )
    host.locale = 'en-US'
    expect(readItemActionHint({ message }, false)?.message).toBe(
      enMessages.flowTransfer.copiedToClipboard
    )
  })

  it('fills the params of a $i18n: message', () => {
    host.locale = 'en-US'
    const params = JSON.stringify({ plugin: 'Notes', permission: 'fs.read' })
    expect(
      readItemActionHint({ message: `$i18n:permission.requestDesc|${params}` }, false)?.message
    ).toBe('Notes requests fs.read permission')
  })

  it('shows nothing for a $i18n: key the host does not have', () => {
    expect(readItemActionHint({ message: '$i18n:no.such.key' }, false)).toBeNull()
    expect(readItemActionHint({ message: '$i18n:' }, false)).toBeNull()
  })

  it('sanitizes the text a $i18n: message resolves to', () => {
    host.locale = 'en-US'
    const params = JSON.stringify({ plugin: 'A\u202eB\nC', permission: 'p' })
    expect(
      readItemActionHint({ message: `$i18n:permission.requestDesc|${params}` }, false)?.message
    ).toBe('AB C requests p permission')
  })
})

describe('showItemActionHint', () => {
  it('shows a success message once, silently, titled with the plugin name', () => {
    const plugin = { name: 'touch-window-presets', displayName: '窗口预设' }
    showItemActionHint(plugin, { message: '已处理 2 个窗口' }, false)

    expect(host.show).toHaveBeenCalledTimes(1)
    expect(host.show).toHaveBeenCalledWith({
      title: '窗口预设',
      message: '已处理 2 个窗口',
      level: 'success',
      system: { silent: true }
    })
  })

  it('shows a failure message at error level with a failure title, and audibly', () => {
    const plugin = { name: 'touch-dev-utils', displayName: 'Dev Utils' }
    showItemActionHint(plugin, { success: false, message: '复制失败' }, true)

    expect(host.show).toHaveBeenCalledTimes(1)
    expect(host.show).toHaveBeenCalledWith({
      title: 'Dev Utils 操作失败',
      message: '复制失败',
      level: 'error',
      system: { silent: false }
    })
  })

  it('titles a failure in the host language', () => {
    host.locale = 'en-US'
    showItemActionHint(
      { name: 'touch-dev-utils', displayName: 'Dev Utils' },
      { message: 'x' },
      true
    )

    expect(host.show.mock.calls[0]?.[0]).toMatchObject({ title: 'Dev Utils: action failed' })
  })

  it('falls back to the plugin id when there is no display name', () => {
    showItemActionHint({ name: 'touch-text-tools' }, { message: 'ok' }, false)
    showItemActionHint({ name: 'touch-text-tools', displayName: '  ' }, { message: 'ok' }, false)

    expect(host.show.mock.calls.map((call) => call[0].title)).toEqual([
      'touch-text-tools',
      'touch-text-tools'
    ])
  })

  it('sanitizes and caps the plugin name used as the title', () => {
    const plugin = { name: 'p', displayName: `Evil\u202e\nName${'n'.repeat(100)}` }
    showItemActionHint(plugin, { message: 'ok' }, false)

    expect(host.show.mock.calls[0]?.[0].title).toBe(`Evil Name${'n'.repeat(51)}…`)
  })

  it('shows nothing when the result carries no message', () => {
    showItemActionHint({ name: 'p' }, undefined, false)
    showItemActionHint({ name: 'p' }, { success: false, status: 'blocked', reason: 'denied' }, true)
    showItemActionHint({ name: 'p' }, { message: 7 }, false)

    expect(host.show).not.toHaveBeenCalled()
  })

  it('hands the notification only the sanitized, capped text', () => {
    showItemActionHint({ name: 'p' }, { message: `\u001b]0;pwned\u0007${'a'.repeat(400)}` }, false)

    const request = host.show.mock.calls[0]?.[0]
    expect(request.message).toBe(`]0;pwned ${'a'.repeat(191)}…`)
    expect(Array.from(request.message as string)).toHaveLength(201)
  })

  it('does not throw when the notification cannot be shown, and logs no text', () => {
    host.show.mockImplementation(() => {
      throw new Error('secret /Users/someone/file.txt')
    })

    expect(() => showItemActionHint({ name: 'p' }, { message: 'ok' }, false)).not.toThrow()
    expect(host.warn).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(host.warn.mock.calls)).not.toContain('/Users/someone')
  })
})
