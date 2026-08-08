import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { normalizeConfigKey, resolveLegacyPath } from './app-config-repository'

/**
 * The containment boundary for config keys (#928).
 *
 * normalizeConfigKey and resolveLegacyPath are what keep an IPC- or plugin-supplied key inside
 * the config root, and no test in the repo imported this file. A refactor dropping the `..`
 * segment check — or the backslash check, which is what blocks `..\..\` on Windows — would
 * reintroduce traversal with the suite still green.
 *
 * Two layers on purpose: normalizeConfigKey rejects by shape, resolveLegacyPath re-checks the
 * resolved path against the root. The second is what catches anything the first misses, so it
 * is tested separately rather than assumed to be redundant.
 */

const ROOT = path.resolve('/tmp/tuff-config-root')

describe('normalizeConfigKey', () => {
  it.each([
    'settings',
    'plugins/example',
    'a/b/c/d.json',
    'with-dash_and_underscore',
    'unicode-配置'
  ])('accepts %s', (key) => {
    // Positive control: a sanitiser that rejected everything would satisfy every rejection
    // below while making the config store unusable.
    expect(normalizeConfigKey(key)).toBe(key)
  })

  it.each([
    ['..', 'a bare parent segment'],
    ['../secrets', 'a leading parent segment'],
    ['plugins/../../etc/passwd', 'a parent segment in the middle'],
    ['plugins/..', 'a trailing parent segment'],
    ['.', 'a bare current segment'],
    ['./settings', 'a leading current segment'],
    ['plugins/./example', 'a current segment in the middle']
  ])('rejects %s — %s', (key) => {
    expect(() => normalizeConfigKey(key)).toThrow(/Invalid config key/)
  })

  it.each([
    ['', 'the empty string'],
    ['/', 'a bare separator'],
    ['a//b', 'an empty middle segment'],
    ['a/', 'a trailing separator'],
    ['/a', 'a leading separator']
  ])('rejects %s — %s', (key) => {
    expect(() => normalizeConfigKey(key)).toThrow(/Invalid config key/)
  })

  it.each([
    ['..\\..\\windows\\system32', 'backslash traversal'],
    ['a\\b', 'a bare backslash'],
    ['C:\\config', 'a win32 absolute path'],
    ['C:/config', 'a win32 absolute path with forward slashes']
  ])('rejects %s — %s', (key) => {
    // The backslash rule is the one that matters on Windows and is easy to drop as
    // "redundant" on a posix machine, where these strings look like ordinary segments.
    expect(() => normalizeConfigKey(key)).toThrow(/Invalid config key/)
  })

  it.each([
    ['/etc/passwd', 'a posix absolute path'],
    ['a\0b', 'an embedded NUL'],
    ['\0', 'a bare NUL']
  ])('rejects %s — %s', (key) => {
    expect(() => normalizeConfigKey(key)).toThrow(/Invalid config key/)
  })

  it('rejects non-string input', () => {
    for (const key of [undefined, null, 42, {}, []])
      expect(() => normalizeConfigKey(key as unknown as string)).toThrow(/Invalid config key/)
  })
})

describe('resolveLegacyPath', () => {
  it('resolves an ordinary key inside the root', () => {
    // Positive control for the second layer.
    const resolved = resolveLegacyPath(ROOT, 'plugins/example')
    expect(resolved).toBe(path.join(ROOT, 'plugins', 'example'))
    expect(resolved.startsWith(ROOT + path.sep)).toBe(true)
  })

  it.each(['..', '../outside', 'plugins/../../outside', '/etc/passwd', 'a\\b'])(
    'refuses %s',
    (key) => {
      expect(() => resolveLegacyPath(ROOT, key)).toThrow(/Invalid config key|escapes legacy root/)
    }
  )

  it('refuses a key that resolves to the root itself', () => {
    // `relative === ''` is its own branch: writing to the root rather than to a file in it
    // would clobber the directory entry.
    expect(() => resolveLegacyPath(ROOT, '.')).toThrow(/Invalid config key|escapes legacy root/)
  })

  it('does not confuse a sibling root with the root', () => {
    // `${ROOT}-other` shares the prefix but is not inside it. normalizeConfigKey rejects the
    // traversal that would reach it, and this pins that the second layer agrees.
    expect(() => resolveLegacyPath(ROOT, '../tuff-config-root-other/x')).toThrow(
      /Invalid config key|escapes legacy root/
    )
  })
})
