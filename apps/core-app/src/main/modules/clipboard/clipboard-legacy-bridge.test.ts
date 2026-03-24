import { describe, expect, it } from 'vitest'
import {
  buildApplyPayloadFromCopyAndPaste,
  normalizeClipboardWritePayload,
  toLegacyClipboardItem
} from './clipboard-legacy-bridge'

describe('clipboard-legacy-bridge', () => {
  it('copy-and-paste: image 优先映射为 image payload', () => {
    const payload = buildApplyPayloadFromCopyAndPaste({
      image: 'data:image/png;base64,abc',
      files: ['/tmp/a.txt'],
      text: 'hello'
    })

    expect(payload.type).toBe('image')
    expect(payload.item?.type).toBe('image')
  })

  it('copy-and-paste: files 次优先', () => {
    const payload = buildApplyPayloadFromCopyAndPaste({
      files: ['/tmp/a.txt'],
      text: 'fallback'
    })

    expect(payload.type).toBe('files')
    expect(payload.files).toEqual(['/tmp/a.txt'])
  })

  it('write: direct payload 保持原样', () => {
    const payload = normalizeClipboardWritePayload({
      text: 'a',
      html: '<b>a</b>',
      image: 'img',
      files: ['/tmp/a.txt']
    })
    expect(payload).toEqual({
      text: 'a',
      html: '<b>a</b>',
      image: 'img',
      files: ['/tmp/a.txt']
    })
  })

  it('write: value payload 按 type 归一化', () => {
    expect(normalizeClipboardWritePayload({ type: 'image', value: 'img' })).toEqual({
      image: 'img'
    })
    expect(normalizeClipboardWritePayload({ type: 'html', value: '<i>x</i>' })).toEqual({
      html: '<i>x</i>'
    })
    expect(normalizeClipboardWritePayload({ type: 'text', value: 'x' })).toEqual({
      text: 'x'
    })
  })

  it('legacy item timestamp Date -> number', () => {
    const now = new Date('2026-03-24T00:00:00.000Z')
    const item = toLegacyClipboardItem({
      id: 1,
      type: 'text',
      content: 'hello',
      timestamp: now
    })

    expect(item?.timestamp).toBe(now.getTime())
    expect(item?.content).toBe('hello')
  })
})
