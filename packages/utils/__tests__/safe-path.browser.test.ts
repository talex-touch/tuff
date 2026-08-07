// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { isAbsolutePath, normalizeAbsolutePath } from '../common/utils/safe-path'
import { hasWindow } from '../env'

/**
 * The window half of safe-path, which is where #580 lived.
 *
 * `safe-path` picks its path implementation once, at module load, from `hasWindow()`. Under
 * the repo's default `environment: 'node'` it therefore picks `node:path`, whose `win32` is
 * a real object — so the old `path.win32.isAbsolute(…)` worked and a node-environment test
 * passed against the broken code. It has to be jsdom, and it has to be jsdom *before* the
 * import above, which is what the pragma on line 1 arranges.
 *
 * With a window, `path` is path-browserify, whose `win32` is `null`.
 */
describe('isAbsolutePath in a window context', () => {
  it('does not throw for a relative path', () => {
    // This threw `Cannot read properties of null (reading 'isAbsolute')`.
    expect(() => isAbsolutePath('foo/bar')).not.toThrow()
    expect(isAbsolutePath('foo/bar')).toBe(false)
  })

  it('does not throw for the empty string', () => {
    expect(() => isAbsolutePath('')).not.toThrow()
    expect(isAbsolutePath('')).toBe(false)
  })

  it('recognises a windows drive path instead of throwing', () => {
    expect(isAbsolutePath('C:\\Users\\me')).toBe(true)
    expect(isAbsolutePath('c:/users/me')).toBe(true)
  })

  it('recognises a UNC path', () => {
    expect(isAbsolutePath('\\\\server\\share\\x')).toBe(true)
  })

  it('still recognises posix absolute paths', () => {
    expect(isAbsolutePath('/foo/bar')).toBe(true)
  })

  it('lets normalizeAbsolutePath reject relative input rather than crash', () => {
    // normalizeAbsolutePath calls isAbsolutePath, so it crashed on the same inputs — for a
    // renderer that meant an exception where a null was the documented answer.
    expect(() => normalizeAbsolutePath('foo/bar')).not.toThrow()
    expect(normalizeAbsolutePath('foo/bar')).toBeNull()
  })

  it('confirms the environment really is a window, so these assertions mean something', () => {
    // Asserted through the same predicate safe-path branches on, not through `typeof window`
    // directly. Without this the whole file would silently degrade into a duplicate of the
    // node-side tests if the pragma on line 1 were ever dropped.
    expect(hasWindow()).toBe(true)
  })
})
