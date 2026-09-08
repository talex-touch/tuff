import { describe, expect, it } from 'vitest'
import {
  CLIPBOARD_NOTE_MAX_LENGTH,
  CLIPBOARD_TAGS_MAX_COUNT,
  CLIPBOARD_TAG_MAX_LENGTH,
  normalizeClipboardNote,
  normalizeClipboardTags,
  readClipboardAnnotation,
} from '../clipboard/annotation'

/**
 * These caps are shared rather than enforced only where the write happens, because the plugin's
 * input fields have to agree with them. A limit that only the main process knows about is a field
 * that lets you type 300 characters and then silently keeps 200.
 */
describe('normalizeClipboardNote', () => {
  it('collapses whitespace and treats blank as absent', () => {
    expect(normalizeClipboardNote('  ego lite  ')).toBe('ego lite')
    // 备注在列表和摘要里是单行渲染的，留着换行会让同一条记录在不同位置显示成半句话。
    expect(normalizeClipboardNote('ego\n  lite')).toBe('ego lite')
    expect(normalizeClipboardNote('   ')).toBeNull()
    expect(normalizeClipboardNote('')).toBeNull()
    expect(normalizeClipboardNote(undefined)).toBeNull()
    expect(normalizeClipboardNote(42)).toBeNull()
  })

  it('caps the length', () => {
    const note = normalizeClipboardNote('x'.repeat(CLIPBOARD_NOTE_MAX_LENGTH + 50))
    expect(note).toHaveLength(CLIPBOARD_NOTE_MAX_LENGTH)
  })
})

describe('normalizeClipboardTags', () => {
  it('drops blanks and non-strings', () => {
    expect(normalizeClipboardTags(['prod', '  ', '', null, 7, 'staging'])).toEqual([
      'prod',
      'staging',
    ])
    expect(normalizeClipboardTags('prod')).toEqual([])
    expect(normalizeClipboardTags(undefined)).toEqual([])
  })

  it('de-duplicates case-insensitively, keeping the spelling that was typed first', () => {
    // 用户先打了 Prod 再打 prod，留下的该是他自己第一次写的形态，而不是被后来的输入改写。
    expect(normalizeClipboardTags(['Prod', 'prod', 'PROD'])).toEqual(['Prod'])
  })

  it('caps each tag and the number of tags', () => {
    const [long] = normalizeClipboardTags(['y'.repeat(CLIPBOARD_TAG_MAX_LENGTH + 10)])
    expect(long).toHaveLength(CLIPBOARD_TAG_MAX_LENGTH)

    const many = normalizeClipboardTags(
      Array.from({ length: CLIPBOARD_TAGS_MAX_COUNT + 5 }, (_, index) => `tag-${index}`),
    )
    expect(many).toHaveLength(CLIPBOARD_TAGS_MAX_COUNT)
    expect(many[0]).toBe('tag-0')
  })
})

describe('readClipboardAnnotation', () => {
  it('reads the metadata keys and survives junk in them', () => {
    expect(readClipboardAnnotation({ user_note: ' hi ', user_tags: ['a', 'a'] })).toEqual({
      note: 'hi',
      tags: ['a'],
    })
    // 一条从没被标注过的记录，和一条 metadata 被写坏的记录，读出来必须是同一个"没有标注"。
    expect(readClipboardAnnotation({ user_note: 12, user_tags: 'nope' })).toEqual({
      note: null,
      tags: [],
    })
    expect(readClipboardAnnotation(null)).toEqual({ note: null, tags: [] })
    expect(readClipboardAnnotation(undefined)).toEqual({ note: null, tags: [] })
  })
})
