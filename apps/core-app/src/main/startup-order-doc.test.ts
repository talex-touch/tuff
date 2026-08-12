import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * CLAUDE.md must not contradict the startup arrays (#611).
 *
 * The doc used to carry a hand-written 15-step order. By the time it was found it was missing 24
 * modules, named one that does not exist, and had the relative order of the rest wrong — so a
 * developer using it to pick an insertion point would land a module before permissionModule and get
 * an ordering bug that reproduces only at startup.
 *
 * The list is now a pointer to index.ts plus the handful of facts the arrays do not state. Those
 * facts are what this pins: prose cannot be typechecked, and the previous version drifted for long
 * enough to grow 24 modules out of date without anyone noticing.
 */

const REPO_ROOT = path.resolve(__dirname, '../../../..')
const INDEX = readFileSync(path.join(__dirname, 'index.ts'), 'utf8')
const CLAUDE_MD = readFileSync(path.join(REPO_ROOT, 'CLAUDE.md'), 'utf8')

function moduleList(name: string): string[] {
  const block = new RegExp(`const ${name} = \\[(.*?)\\n?\\]`, 's').exec(INDEX)?.[1]
  if (!block) throw new Error(`${name} not found in index.ts`)
  return block
    .replace(/\/\/[^\n]*/g, '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

const foreground = moduleList('foregroundModulesToLoad')
const deferred = moduleList('deferredModulesToLoad')

describe('startup arrays', () => {
  it('parses both phases', () => {
    // Positive control. Every count and ordering assertion below is vacuous against an empty list,
    // and the first version of this parser did return an empty deferred list — the array is written
    // on one line, which a per-line regex silently truncates to its first entry.
    expect(foreground.length).toBeGreaterThan(30)
    expect(deferred).toEqual(['extensionLoaderModule', 'FileSystemWatcher'])
    expect(foreground[0]).toBe('databaseModule')
  })

  it('keeps the constraints the array comments call out', () => {
    // Not stylistic: permissions must be registered before plugins can be granted them, and the
    // flow bus binds to plugin-provided transports.
    expect(foreground.indexOf('permissionModule')).toBeLessThan(foreground.indexOf('pluginModule'))
    expect(foreground.indexOf('flowBusModule')).toBeGreaterThan(foreground.indexOf('pluginModule'))
  })
})

describe('CLAUDE.md startup section', () => {
  it('quotes the current module counts', () => {
    // This is the assertion that fails when a module is added — which is the point. Update the
    // sentence in CLAUDE.md; do not delete the count and leave the prose vague.
    expect(CLAUDE_MD).toContain(
      `Currently ${foreground.length} foreground and ${deferred.length} deferred.`
    )
  })

  it('names only modules that exist', () => {
    // 'TrayHolderModule' is what the old list called trayManagerModule; no such symbol has ever
    // existed. Any *Module identifier the doc mentions in this section must be resolvable.
    const section = /\*\*Module Loading Order\*\*([\s\S]*?)\n\*\*/.exec(CLAUDE_MD)?.[1] ?? ''
    expect(section).not.toBe('')

    const mentioned = [...section.matchAll(/`([A-Za-z]+(?:Module|Watcher))`/g)].map(
      (match) => match[1]!
    )
    expect(mentioned.length).toBeGreaterThan(3)
    for (const name of mentioned) expect(INDEX).toContain(name)
  })

  it('still describes the optional-module escape hatch', () => {
    const optional = /optionalModulesToLoad = new Set\(\[(.*?)\]/s.exec(INDEX)?.[1]?.trim()

    expect(optional).toBe('trayManagerModule')
    expect(CLAUDE_MD).toContain('optionalModulesToLoad')
  })
})
