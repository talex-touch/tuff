import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { displayBasename, displayExtension, displayParentName, isAbsolutePath, isSafePathSegment, normalizeAbsolutePath } from '../common/utils/safe-path'

/**
 * These run under vitest, where `window` is undefined, so `safe-path` picks `node:path`.
 * The bug they cover only appeared when `window` existed and path-browserify was chosen —
 * its `win32` property is `null`, and the old implementation dereferenced it (#580).
 *
 * Rather than fake a window, the browser half is covered by asserting the win32 rule the
 * fix now implements inline is the same rule `node:path.win32.isAbsolute` applies. If the
 * two ever diverge, a renderer and the main process would disagree about whether a path is
 * absolute, which is the failure mode worth pinning.
 */
describe('isAbsolutePath', () => {
  it('accepts posix absolute paths', () => {
    expect(isAbsolutePath('/foo/bar')).toBe(true)
    expect(isAbsolutePath('/')).toBe(true)
  })

  it('accepts windows drive and UNC paths on any platform', () => {
    expect(isAbsolutePath('C:\\Users\\me')).toBe(true)
    expect(isAbsolutePath('c:/users/me')).toBe(true)
    expect(isAbsolutePath('\\\\server\\share\\x')).toBe(true)
  })

  it('returns false rather than throwing for the inputs that used to crash', () => {
    // Every one of these threw `Cannot read properties of null (reading 'isAbsolute')` in a
    // window context, because they are exactly the inputs the posix check answers false to.
    for (const value of ['foo/bar', '', '../x', './x', 'C:', 'C:foo'])
      expect(isAbsolutePath(value)).toBe(false)
  })

  it('agrees with node:path.win32.isAbsolute on the whole surface', () => {
    const cases = [
      'C:\\Users\\me',
      'c:/users/me',
      'C:',
      'C:foo',
      'C:/',
      '\\\\server\\share\\x',
      '//server/share/x',
      '\\\\server',
      '\\\\',
      '/foo',
      '\\foo',
      '/',
      '\\',
      'foo',
      '',
      '../x',
      './x',
      '.',
      '..',
      'Z:\\',
      '1:\\x',
      'a',
    ]

    for (const value of cases) {
      // isAbsolutePath is posix-OR-win32, so it may be true where win32 alone is false.
      // What must never happen is win32 saying true while isAbsolutePath says false.
      if (path.win32.isAbsolute(value))
        expect(isAbsolutePath(value), `win32 absolute: ${JSON.stringify(value)}`).toBe(true)
    }
  })
})

describe('normalizeAbsolutePath', () => {
  it('returns null for relative input instead of throwing', () => {
    expect(normalizeAbsolutePath('foo/bar')).toBeNull()
    expect(normalizeAbsolutePath('')).toBeNull()
  })

  it('rejects a null byte', () => {
    expect(normalizeAbsolutePath('/foo\0bar')).toBeNull()
  })

  it('normalizes an absolute path', () => {
    expect(normalizeAbsolutePath('/foo/./bar')).toBe(path.normalize('/foo/./bar'))
  })
})

describe('isSafePathSegment', () => {
  it('rejects separators, traversal and empty input', () => {
    for (const value of ['', ' ', '.', '..', 'a/b', 'a\\b', 'a\0b'])
      expect(isSafePathSegment(value)).toBe(false)
  })

  it('accepts an ordinary name', () => {
    expect(isSafePathSegment('plugin-name')).toBe(true)
  })
})

describe('display helpers', () => {
  it('reads a windows path the renderer would otherwise print whole', () => {
    // path-browserify's sep is '/', so basename returned the entire string and dirname
    // returned '.' — a file chip showed the full path where it meant the file name (#581).
    const win = 'C:\\Users\\me\\Documents\\report.PDF'
    expect(displayBasename(win)).toBe('report.PDF')
    expect(displayParentName(win)).toBe('Documents')
    expect(displayExtension(win)).toBe('pdf')
  })

  it('reads a posix path the same way', () => {
    const posix = '/home/me/docs/report.pdf'
    expect(displayBasename(posix)).toBe('report.pdf')
    expect(displayParentName(posix)).toBe('docs')
    expect(displayExtension(posix)).toBe('pdf')
  })

  it('handles a UNC path', () => {
    expect(displayBasename('\\\\srv\\share\\a.txt')).toBe('a.txt')
    expect(displayParentName('\\\\srv\\share\\a.txt')).toBe('share')
  })

  it('treats a leading dot as a hidden file, not an extension', () => {
    expect(displayBasename('.gitignore')).toBe('.gitignore')
    expect(displayExtension('.gitignore')).toBe('')
  })

  it('returns empty strings rather than throwing at the edges', () => {
    for (const value of ['', '/', 'C:\\', 'report.pdf']) {
      expect(() => displayBasename(value)).not.toThrow()
      expect(typeof displayParentName(value)).toBe('string')
    }
    expect(displayParentName('report.pdf')).toBe('')
    expect(displayBasename('')).toBe('')
  })
})
