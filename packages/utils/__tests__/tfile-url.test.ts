import { describe, expect, it } from 'vitest'
import { toTfileUrl } from '../network/file'

/**
 * `toTfileUrl` is the single tfile URL builder for both processes.
 *
 * It used to have a renderer-local twin (`renderer/src/utils/tfile-url.ts#buildTfileUrl`) that
 * agreed on every real local path but coerced *anything else* to `tfile://`, so an `https://`
 * wallpaper became `tfile:///https%3A//…` and 403'd at the protocol handler. Callers papered over
 * it with their own remote-URL guards. The twin is gone; these tests pin the behaviour those
 * six call sites now depend on.
 */
describe('toTfileUrl', () => {
  describe('local paths become tfile URLs', () => {
    it('encodes an absolute POSIX path', () => {
      expect(toTfileUrl('/Applications/Demo.app/icon.png')).toBe(
        'tfile:///Applications/Demo.app/icon.png'
      )
    })

    it('percent-encodes non-ASCII characters and spaces', () => {
      // A Chinese path with a space is the ordinary case on a zh-CN machine, and the reason the
      // builder cannot be a bare template string.
      const url = toTfileUrl('/Users/x/图片/截图 1.png')
      expect(url.startsWith('tfile:///Users/x/')).toBe(true)
      expect(url).not.toContain(' ')
      expect(decodeURIComponent(url.replace('tfile://', ''))).toBe('/Users/x/图片/截图 1.png')
    })

    it('normalizes a Windows drive path and percent-encodes the drive colon', () => {
      // The colon is encoded like any other segment character. The protocol handler decodes it
      // back (`decodeStable` → `normalizeDecodedPath` in `file-protocol/tfile-session.ts`), so the
      // encoded form is the wire shape, not a bug — asserted here so a "cleanup" that stops
      // encoding it has to face the handler contract.
      expect(toTfileUrl('C:\\Users\\alice\\a.png')).toBe('tfile://C%3A/Users/alice/a.png')
    })

    it('is idempotent on an already-built tfile URL', () => {
      const once = toTfileUrl('/Users/x/图片/截图 1.png')
      expect(toTfileUrl(once)).toBe(once)
    })

    it('converts a file: URL', () => {
      expect(toTfileUrl('file:///tmp/a.txt')).toBe('tfile:///tmp/a.txt')
    })
  })

  describe('non-local input passes through untouched', () => {
    // This is the contract the deleted renderer twin got wrong. Each of these, coerced to
    // `tfile://`, produces a URL the protocol handler rejects with 400/403 and an image that
    // silently renders as a placeholder.
    it.each([
      ['remote URL', 'https://example.com/a.png'],
      ['insecure remote URL', 'http://example.com/a.png'],
      ['data URL', 'data:image/png;base64,AAAA'],
      ['relative path', 'relative/path.png']
    ])('%s', (_label, input) => {
      expect(toTfileUrl(input)).toBe(input)
    })
  })

  describe('empty input', () => {
    it.each([
      ['empty string', ''],
      ['whitespace only', '   ']
    ])('%s yields an empty string, not a bare scheme', (_label, input) => {
      // `tfile://` with no path would be requested by the renderer and 400.
      expect(toTfileUrl(input)).toBe('')
    })
  })
})
