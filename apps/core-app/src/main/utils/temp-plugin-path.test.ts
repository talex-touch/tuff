import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildTempPluginPath, sanitizeTempPluginName } from './temp-plugin-path'

/**
 * Where an uploaded plugin archive is written (#690).
 *
 * The install handlers built the path as
 * `path.join(os.tmpdir(), 'talex-touch-plugin-' + Date.now() + '-' + name)` with `name`
 * straight off the IPC payload, so a traversal escaped the temp directory and gave an
 * arbitrary file write. Combined with the execution sinks that is write-then-execute: drop a
 * LaunchAgent or Startup entry, then trigger it.
 *
 * A fixed temp root is passed so the cases mean the same thing on every platform.
 */
const TMP = path.resolve('/tmp/tuff-tests')
const build = (name: unknown) => buildTempPluginPath(name, 1700000000000, TMP)

describe('sanitizeTempPluginName', () => {
  it('keeps an ordinary archive name', () => {
    // Positive control: a sanitiser that flattened everything would satisfy the traversal
    // assertions below while making every temp file identical.
    expect(sanitizeTempPluginName('my-plugin-1.2.3.tpex')).toBe('my-plugin-1.2.3.tpex')
  })

  it('strips path separators', () => {
    for (const name of ['a/b.tpex', 'a\\b.tpex'])
      expect(sanitizeTempPluginName(name), name).not.toMatch(/[/\\]/)
  })

  it('defuses traversal sequences', () => {
    const cleaned = sanitizeTempPluginName('../../../Library/LaunchAgents/com.evil.plist')
    expect(cleaned).not.toContain('..')
    expect(cleaned).not.toMatch(/[/\\]/)
  })

  it('falls back when nothing usable survives', () => {
    for (const name of ['', '...', '///', undefined, null, 42])
      expect(sanitizeTempPluginName(name), String(name)).toBe('plugin.tpex')
  })

  it('bounds the length', () => {
    expect(sanitizeTempPluginName('a'.repeat(500)).length).toBeLessThanOrEqual(120)
  })
})

describe('buildTempPluginPath', () => {
  it('writes inside the temp directory for an ordinary name', () => {
    const result = build('my-plugin.tpex')
    expect(result.startsWith(TMP + path.sep)).toBe(true)
    expect(result).toContain('talex-touch-plugin-1700000000000-')
  })

  it('keeps a traversal inside the temp directory', () => {
    // The property that matters, asserted on the result rather than inferred from the
    // sanitiser having run.
    const result = build('../../../Library/LaunchAgents/com.evil.plist')
    expect(result.startsWith(TMP + path.sep)).toBe(true)
    expect(result).not.toContain('LaunchAgents' + path.sep)
  })

  it('gives different names to different plugins', () => {
    // The fallback must not collapse distinct installs onto one path.
    expect(build('alpha.tpex')).not.toBe(build('beta.tpex'))
  })

  it('refuses rather than returning a path outside the root', () => {
    // Belt and braces: sanitising and joining are separate steps, so the boundary is checked
    // after resolution. Reaching this throw would mean the sanitiser had failed.
    expect(() =>
      buildTempPluginPath('x', 1, path.resolve('/tmp/tuff-tests/../elsewhere'))
    ).not.toThrow()
  })
})

/**
 * That both install handlers use it.
 *
 * addon-opener registers transport handlers inside a module lifecycle, so the call sites are
 * guarded at source level. There are two — the install and the drop-install paths — and
 * fixing one is the natural half-measure, since a proof-of-concept only ever exercises one.
 */
describe('addon-opener wiring', () => {
  const source = readFileSync(
    fileURLToPath(new URL('../modules/addon-opener.ts', import.meta.url)),
    'utf8'
  )

  it('builds both temp paths through the helper', () => {
    const calls = source.match(/buildTempPluginPath\(name, Date\.now\(\)\)/g) ?? []
    expect(calls).toHaveLength(2)
  })

  it('no longer joins the name into a temp path directly', () => {
    expect(source).not.toMatch(/os\.tmpdir\(\)[\s\S]{0,80}\$\{name\}/)
  })
})
