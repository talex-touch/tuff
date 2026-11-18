import type { ClipboardCaptureSource } from '@talex-touch/utils/transport/events/types'
import { clipboard } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ClipboardFreshnessStore,
  ClipboardHelper,
  detectClipboardFormatFlags,
  hasClipboardImageFormat
} from './clipboard-capture-freshness'
import { createClipboardFreshnessState } from './clipboard-freshness'

vi.mock('electron', () => ({
  clipboard: {
    read: vi.fn(() => Buffer.from('')),
    readText: vi.fn(() => ''),
    availableFormats: vi.fn(() => []),
    readImage: vi.fn(() => ({ isEmpty: () => true }))
  }
}))

describe('clipboard-capture-freshness file authorization evidence', () => {
  const content = JSON.stringify(['/captured/截图.png'])

  it.each<{ source: ClipboardCaptureSource; authorized: boolean }>([
    { source: 'native-watch', authorized: true },
    { source: 'background-poll', authorized: true },
    { source: 'visible-poll', authorized: true },
    { source: 'corebox-show-baseline', authorized: true },
    { source: 'startup-bootstrap', authorized: false },
    { source: 'manual-write', authorized: false },
    { source: 'history-apply', authorized: false }
  ])('admits file proof only for genuine capture source $source', ({ source, authorized }) => {
    const store = new ClipboardFreshnessStore()
    store.remember(
      { id: 41, type: 'files', content },
      createClipboardFreshnessState({
        source,
        observedAt: 100,
        previousScanAt: 90
      })
    )
    // This output is the preview resolver's security evidence, not capture_source DB metadata.
    expect(store.getCapturedFilesContent(41)).toBe(authorized ? content : undefined)
  })

  it.each(['text', 'image'] as const)(
    'cannot turn a captured %s item into file proof by later mutating the caller object',
    (type) => {
      const store = new ClipboardFreshnessStore()
      const item = { id: 41, type: type as string, content }
      store.remember(
        item,
        createClipboardFreshnessState({
          source: 'native-watch',
          observedAt: 100,
          previousScanAt: null
        })
      )
      item.type = 'files'
      expect(store.getCapturedFilesContent(41)).toBeUndefined()
    }
  )

  it('revokes previous file proof when the same history identity is replaced by an applied item', () => {
    const store = new ClipboardFreshnessStore()
    store.remember(
      { id: 41, type: 'files', content },
      createClipboardFreshnessState({
        source: 'native-watch',
        observedAt: 100,
        previousScanAt: null
      })
    )
    store.remember(
      { id: 41, type: 'files', content },
      createClipboardFreshnessState({
        source: 'history-apply',
        observedAt: 200,
        previousScanAt: null
      })
    )
    expect(store.getCapturedFilesContent(41)).toBeUndefined()
  })

  it.each(['delete', 'clear'] as const)('revokes immutable capture evidence on %s', (operation) => {
    const store = new ClipboardFreshnessStore()
    const item = { id: 41, type: 'files', content }
    store.remember(
      item,
      createClipboardFreshnessState({
        source: 'native-watch',
        observedAt: 100,
        previousScanAt: null
      })
    )
    item.content = JSON.stringify(['/uncaptured/secret.png'])
    expect(store.getCapturedFilesContent(41)).toBe(content)
    if (operation === 'delete') store.delete(41)
    else store.clear()
    expect(store.getCapturedFilesContent(41)).toBeUndefined()
  })
})

describe('clipboard format classification and file extraction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('detects html, image, and file formats in one pass including case-insensitive image flavors', () => {
    expect(detectClipboardFormatFlags(['public.utf8-plain-text', 'text/plain'])).toEqual({
      hasHtml: false,
      hasImage: false,
      hasFile: false
    })
    expect(detectClipboardFormatFlags(['text/html', 'IMAGE/AVIF', 'public.file-url'])).toEqual({
      hasHtml: true,
      hasImage: true,
      hasFile: true
    })
    expect(hasClipboardImageFormat(['PUBLIC.PNG'])).toBe(true)
    expect(hasClipboardImageFormat(['PUBLIC.TIFF'])).toBe(true)
    expect(hasClipboardImageFormat(['public.utf8-plain-text'])).toBe(false)
  })

  it('extracts file paths from plist XML and file:// URI lists', () => {
    const helper = new ClipboardHelper()
    vi.mocked(clipboard.read).mockImplementation((format: string) => {
      if (format === 'public.file-url') {
        return 'file:///Users/alice/Documents/hello%20world.txt\n'
      }
      return ''
    })
    expect(helper.readClipboardFiles()).toEqual(['/Users/alice/Documents/hello world.txt'])

    vi.mocked(clipboard.read).mockImplementation((format: string) => {
      if (format === 'NSFilenamesPboardType') {
        return `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><array><string>/Users/alice/a.png</string><string>/Users/alice/b.pdf</string></array></plist>`
      }
      return ''
    })
    expect(helper.readClipboardFiles()).toEqual(['/Users/alice/a.png', '/Users/alice/b.pdf'])
  })
})
