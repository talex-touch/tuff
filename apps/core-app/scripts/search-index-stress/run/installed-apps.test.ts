import { describe, expect, it } from 'vitest'
import { UsageError } from './args'
import type { DirEntryInfo, ExecFileFn } from './installed-apps'
import {
  DEFAULT_APP_LIMIT,
  describeDiscovery,
  discoverInstalledApps,
  nameProblem,
  pickApps,
  readAppsFile
} from './installed-apps'

const dir = (name: string): DirEntryInfo => ({ name, isDirectory: true, isSymbolicLink: false })
const link = (name: string): DirEntryInfo => ({ name, isDirectory: false, isSymbolicLink: true })
const file = (name: string): DirEntryInfo => ({ name, isDirectory: false, isSymbolicLink: false })

interface Tree {
  [dir: string]: DirEntryInfo[]
}

function fakeEnv(tree: Tree, plists: Record<string, Record<string, string>> = {}) {
  const calls: Array<{ file: string; args: readonly string[] }> = []
  const exec: ExecFileFn = async (command, args) => {
    calls.push({ file: command, args })
    const [, key, , , , plist] = args as string[]
    const value = plists[plist]?.[key]
    if (value === undefined) throw new Error('No value at that key path or invalid key path')
    return { stdout: `${value}\n` }
  }
  return {
    calls,
    env: {
      roots: ['/Applications', '/System/Applications', '/Users/x/Applications'],
      concurrency: 3,
      exec,
      readdir: async (target: string) => {
        const entries = tree[target]
        if (!entries) throw Object.assign(new Error('missing'), { code: 'ENOENT' })
        return entries
      }
    }
  }
}

describe('discoverInstalledApps', () => {
  it('prefers the display name, then the bundle name, then the folder name, and never builds a shell string', async () => {
    const { env, calls } = fakeEnv(
      {
        '/Applications': [dir('Alpha.app'), dir('Beta.app'), dir('Gamma.app')],
        '/System/Applications': [],
        '/Users/x/Applications': []
      },
      {
        '/Applications/Alpha.app/Contents/Info.plist': {
          CFBundleDisplayName: 'Alpha Pro',
          CFBundleName: 'Alpha'
        },
        '/Applications/Beta.app/Contents/Info.plist': { CFBundleName: 'Beta Tool' }
      }
    )
    const found = await discoverInstalledApps(env)

    expect(found.names).toEqual(['Alpha Pro', 'Beta Tool', 'Gamma'])
    expect(found.sources).toEqual({ displayName: 1, bundleName: 1, directory: 1 })
    expect(
      calls.every(
        (call) => call.file === 'plutil' && call.args[0] === '-extract' && call.args[2] === 'raw'
      )
    ).toBe(true)
    expect(found.notes.join(' ')).toContain('localised names')
  })

  it('reads one folder level below a root, but not inside bundles, hidden folders or symlinks', async () => {
    const { env } = fakeEnv({
      '/Applications': [
        dir('Utilities'),
        dir('.Hidden'),
        link('Safari.app'),
        dir('Notes.app'),
        file('readme.txt'),
        dir('Games')
      ],
      '/Applications/Utilities': [dir('Terminal.app'), dir('Deeper')],
      '/Applications/Games': [dir('Chess.app')],
      '/Applications/Deeper': [dir('TooDeep.app')],
      '/Applications/.Hidden': [dir('Secret.app')],
      '/Applications/Utilities/Deeper': [dir('Buried.app')],
      '/Applications/Notes.app': [dir('Inner.app')],
      '/System/Applications': [],
      '/Users/x/Applications': []
    })
    const found = await discoverInstalledApps(env)

    expect(found.names).toEqual(['Chess', 'Notes', 'Terminal'])
    expect(found.bundlesSeen).toBe(3)
  })

  it('drops this app, unusable names, noisy system helpers and duplicates, and counts each', async () => {
    const long = 'A'.repeat(41)
    const { env } = fakeEnv(
      {
        '/Applications': [
          dir('Tuff.app'),
          dir('Electron.app'),
          dir('Long.app'),
          dir('Ctrl.app'),
          dir('Blank.app'),
          dir('Real.app'),
          dir('Simulator.app')
        ],
        '/System/Applications': [dir('Real.app')],
        '/Users/x/Applications': []
      },
      {
        '/Applications/Long.app/Contents/Info.plist': { CFBundleDisplayName: long },
        '/Applications/Ctrl.app/Contents/Info.plist': { CFBundleDisplayName: 'Bad\u0007Name' },
        '/Applications/Blank.app/Contents/Info.plist': {
          CFBundleDisplayName: '   ',
          CFBundleName: ''
        }
      }
    )
    const found = await discoverInstalledApps(env)

    expect(found.names).toEqual(['Blank', 'Real'])
    expect(found.dropped).toEqual({ own: 2, invalid: 2, noise: 1, duplicate: 1 })
  })

  it('treats a missing root as empty and reports other read errors in the notes', async () => {
    const { env } = fakeEnv({ '/Applications': [dir('One.app')] })
    const failing = {
      ...env,
      readdir: async (target: string) => {
        if (target === '/System/Applications')
          throw Object.assign(new Error('permission denied'), { code: 'EACCES' })
        return env.readdir(target)
      }
    }
    const found = await discoverInstalledApps(failing)

    expect(found.names).toEqual(['One'])
    expect(
      found.notes.some(
        (note) => note.includes('/System/Applications') && note.includes('permission denied')
      )
    ).toBe(true)
  })

  it('sorts by code point so the order does not depend on the locale', async () => {
    const { env } = fakeEnv({
      '/Applications': [dir('b.app'), dir('B.app'), dir('a.app'), dir('Z.app')],
      '/System/Applications': [],
      '/Users/x/Applications': []
    })
    expect((await discoverInstalledApps(env)).names).toEqual(['B', 'Z', 'a', 'b'])
  })
})

describe('pickApps', () => {
  const names = Array.from({ length: 120 }, (_, index) => `App ${String(index).padStart(3, '0')}`)

  it('keeps everything when there are not more than the limit, sorted', () => {
    expect(pickApps(['b', 'a'], 1)).toEqual(['a', 'b'])
    expect(pickApps(names.slice(0, DEFAULT_APP_LIMIT), 5)).toHaveLength(DEFAULT_APP_LIMIT)
  })

  it('picks the same sixty for the same seed and other ones for another seed', () => {
    const first = pickApps(names, 1)
    expect(first).toHaveLength(60)
    expect(pickApps(names, 1)).toEqual(first)
    expect(pickApps([...names].reverse(), 1)).toEqual(first)
    expect(pickApps(names, 2)).not.toEqual(first)
    expect(first).toEqual([...first].sort())
    expect(new Set(first).size).toBe(60)
  })
})

describe('describeDiscovery', () => {
  it('states how many were found, used and why others were dropped', () => {
    const text = describeDiscovery(
      {
        names: ['a', 'b'],
        bundlesSeen: 5,
        sources: { displayName: 1, bundleName: 1, directory: 0 },
        dropped: { own: 1, invalid: 0, noise: 2, duplicate: 0 },
        notes: ['localised names (InfoPlist.strings) are not read']
      },
      2
    )
    expect(text).toContain('2 usable of 5 bundles')
    expect(text).toContain('dropped 1 own, 2 noise')
    expect(text).toContain('2 used')
    expect(text).toContain('localised names')
  })
})

describe('nameProblem', () => {
  it.each([
    ['', 'empty'],
    ['  ', 'empty'],
    ['a\nb', 'control characters'],
    ['x'.repeat(41), 'longer than 40'],
    ['日本語アプリ', null],
    ['x'.repeat(40), null]
  ])('judges %j', (name, problem) => {
    const found = nameProblem(name)
    if (problem === null) expect(found).toBeNull()
    else expect(found).toContain(problem)
  })
})

describe('readAppsFile', () => {
  const read = (text: string) => async () => text

  it('reads an array of names, trimmed and de-duplicated', async () => {
    expect(await readAppsFile('apps.json', read('[" Safari ", "Notes", "Safari"]'))).toEqual([
      'Safari',
      'Notes'
    ])
  })

  it.each([
    ['not json', /could not be read as JSON/],
    ['{"a":1}', /JSON array of strings/],
    ['[1,2]', /JSON array of strings/],
    ['[]', /is empty/],
    ['["ok", ""]', /unusable name/],
    [`["${'y'.repeat(50)}"]`, /longer than 40/]
  ])('rejects %j', async (text, message) => {
    const failure = await readAppsFile('apps.json', read(text)).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(UsageError)
    expect((failure as Error).message).toMatch(message)
  })
})
