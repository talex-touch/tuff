/**
 * buildWindowWebPreferences is only worth anything as the *single* entry point: it strips caller
 * overrides of the managed keys, so any window that skips it is outside the policy. Two sites
 * hand-wrote their own set and omitted webSecurity/nodeIntegrationInSubFrames/webviewTag (#794).
 *
 * Nothing was broken at the time - Electron's own defaults happened to match the three omissions.
 * The defect is drift: the next flag added to SECURITY_BASE would silently miss those windows.
 * That makes the invariant a property of the *source*, not of any one window's runtime options,
 * and it has to generalise - a per-site assertion would say nothing about the third site someone
 * adds next month.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const MAIN_ROOT = path.join(__dirname, '..')

/** Keys buildWindowWebPreferences owns. Writing any of them by hand is the thing under test. */
const MANAGED_KEYS = [
  'webSecurity',
  'nodeIntegration',
  'nodeIntegrationInSubFrames',
  'contextIsolation',
  'sandbox',
  'webviewTag'
]

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    if (!name.endsWith('.ts') || name.includes('.test.')) return []
    return [full]
  })
}

/**
 * Returns the managed keys written inline under a `webPreferences:` object literal. The builder
 * form is `webPreferences: buildWindowWebPreferences(...)`, which has no literal to scan.
 */
function handRolledManagedKeys(source: string): string[] {
  const found = new Set<string>()
  const literal = /webPreferences:\s*\{([\s\S]*?)\}/g
  let match = literal.exec(source)
  while (match) {
    const body = match[1] ?? ''
    for (const key of MANAGED_KEYS) {
      if (new RegExp(`\\b${key}\\s*:`).test(body)) found.add(key)
    }
    match = literal.exec(source)
  }
  return [...found]
}

describe('every main-process window goes through the central builder', () => {
  it('检测器确实能认出手写的 webPreferences(缺这条,下面的空结果什么都不证明)', () => {
    const fixture = `new BrowserWindow({
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    })`

    expect(handRolledManagedKeys(fixture).sort()).toEqual([
      'contextIsolation',
      'nodeIntegration',
      'sandbox'
    ])
  })

  it('检测器不会把 builder 调用误报成手写', () => {
    expect(handRolledManagedKeys(`webPreferences: buildWindowWebPreferences('app')`)).toEqual([])
  })

  it('src/main 下没有任何一处手写受管安全项', () => {
    const offenders = sourceFiles(MAIN_ROOT)
      .map((file) => ({ file, keys: handRolledManagedKeys(readFileSync(file, 'utf8')) }))
      .filter((entry) => entry.keys.length > 0)
      .map((entry) => `${path.relative(MAIN_ROOT, entry.file)} (${entry.keys.join(', ')})`)

    expect(offenders).toEqual([])
  })

  it('扫描确实覆盖到了那两个文件(否则「零违规」可能只是没扫到)', () => {
    const scanned = sourceFiles(MAIN_ROOT).map((file) => path.relative(MAIN_ROOT, file))

    expect(scanned).toContain(path.join('modules', 'quick-ops', 'quick-ops-session-manager.ts'))
    expect(scanned).toContain(
      path.join('modules', 'box-tool', 'core-box', 'image-translate-pin-window.ts')
    )
  })

  it('两处仍然在建窗口,而不是把 webPreferences 整个删掉了事', () => {
    for (const relative of [
      path.join('modules', 'quick-ops', 'quick-ops-session-manager.ts'),
      path.join('modules', 'box-tool', 'core-box', 'image-translate-pin-window.ts')
    ]) {
      const source = readFileSync(path.join(MAIN_ROOT, relative), 'utf8')
      expect(source).toContain(`webPreferences: buildWindowWebPreferences('app')`)
    }
  })
})
