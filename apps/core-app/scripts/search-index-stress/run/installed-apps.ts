import { execFile } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { matchNoisySystemAppRule } from '../../../src/main/modules/box-tool/addon/apps/app-noise-filter'
import { UsageError } from './args'

export const DEFAULT_APP_LIMIT = 60
export const MAX_APP_NAME_LENGTH = 40

export type ExecFileFn = (
  file: string,
  args: readonly string[],
  options?: { timeout?: number }
) => Promise<{ stdout: string }>

export interface DirEntryInfo {
  name: string
  isDirectory: boolean
  isSymbolicLink: boolean
}

export interface DiscoveryEnv {
  roots: readonly string[]
  readdir: (dir: string) => Promise<DirEntryInfo[]>
  exec: ExecFileFn
  concurrency: number
}

export interface DiscoveredApps {
  /** Sorted, unique, valid display names. */
  names: string[]
  bundlesSeen: number
  sources: { displayName: number; bundleName: number; directory: number }
  dropped: { own: number; invalid: number; noise: number; duplicate: number }
  notes: string[]
}

const OWN_BUNDLE = /^(?:tuff|talex|electron)(?:$|[\s._-])/i
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F-\u009F]/

export const defaultExec: ExecFileFn = (file, args, options) =>
  new Promise((resolve, reject) => {
    execFile(
      file,
      [...args],
      { timeout: options?.timeout ?? 5_000, maxBuffer: 1 << 20 },
      (error, stdout) => {
        if (error) reject(error)
        else resolve({ stdout: String(stdout) })
      }
    )
  })

async function readDirectory(dir: string): Promise<DirEntryInfo[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  return entries.map((entry) => ({
    name: entry.name,
    isDirectory: entry.isDirectory(),
    isSymbolicLink: entry.isSymbolicLink()
  }))
}

export function defaultRoots(home: string = os.homedir()): string[] {
  return ['/Applications', '/System/Applications', path.join(home, 'Applications')]
}

export function defaultDiscoveryEnv(): DiscoveryEnv {
  return { roots: defaultRoots(), readdir: readDirectory, exec: defaultExec, concurrency: 8 }
}

/** Why a name cannot be used as a search target, or null. Length counts code points. */
export function nameProblem(name: string): string | null {
  if (name.trim() === '') return 'empty'
  if (CONTROL_CHARACTERS.test(name)) return 'control characters'
  if ([...name].length > MAX_APP_NAME_LENGTH) return `longer than ${MAX_APP_NAME_LENGTH} characters`
  return null
}

async function bundleKey(env: DiscoveryEnv, plist: string, key: string): Promise<string | null> {
  try {
    const { stdout } = await env.exec('plutil', ['-extract', key, 'raw', '-o', '-', plist], {
      timeout: 5_000
    })
    const value = stdout.replace(/\r?\n$/, '').trim()
    return value === '' ? null : value
  } catch {
    return null
  }
}

async function runPool<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let next = 0
  const lanes = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const item = items[next]
      next += 1
      await worker(item)
    }
  })
  await Promise.all(lanes)
}

/** `.app` bundles directly in each root and one folder level below it (Utilities and the like). */
async function listBundles(env: DiscoveryEnv, notes: string[]): Promise<string[]> {
  const bundles: string[] = []
  const visible = (entry: DirEntryInfo): boolean =>
    !entry.name.startsWith('.') && !entry.isSymbolicLink && entry.isDirectory
  const scan = async (dir: string, descend: boolean): Promise<void> => {
    let entries: DirEntryInfo[]
    try {
      entries = await env.readdir(dir)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        notes.push(`could not read ${dir}: ${(error as Error).message}`)
      return
    }
    for (const entry of entries.filter(visible).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const full = path.join(dir, entry.name)
      if (entry.name.endsWith('.app')) bundles.push(full)
      else if (descend) await scan(full, false)
    }
  }
  for (const root of env.roots) await scan(root, true)
  return bundles
}

/**
 * Names of the apps installed here as a user sees them. Localised names (the `InfoPlist.strings`
 * of each `.lproj`) are not read: the name comes from the bundle's own Info.plist.
 */
export async function discoverInstalledApps(
  overrides: Partial<DiscoveryEnv> = {}
): Promise<DiscoveredApps> {
  const env: DiscoveryEnv = { ...defaultDiscoveryEnv(), ...overrides }
  const notes: string[] = ['localised names (InfoPlist.strings) are not read']
  const bundles = await listBundles(env, notes)
  const found: DiscoveredApps = {
    names: [],
    bundlesSeen: bundles.length,
    sources: { displayName: 0, bundleName: 0, directory: 0 },
    dropped: { own: 0, invalid: 0, noise: 0, duplicate: 0 },
    notes
  }
  const seen = new Set<string>()
  const accepted: string[] = []

  await runPool(bundles, env.concurrency, async (bundle) => {
    const plist = path.join(bundle, 'Contents', 'Info.plist')
    const fromDirectory = path.basename(bundle, '.app')
    let source: keyof DiscoveredApps['sources'] = 'displayName'
    let name = await bundleKey(env, plist, 'CFBundleDisplayName')
    if (name === null) {
      source = 'bundleName'
      name = await bundleKey(env, plist, 'CFBundleName')
    }
    if (name === null) {
      source = 'directory'
      name = fromDirectory
    }
    name = name.normalize('NFC')
    if (nameProblem(name) !== null) found.dropped.invalid += 1
    else if (OWN_BUNDLE.test(name) || OWN_BUNDLE.test(fromDirectory)) found.dropped.own += 1
    else if (matchNoisySystemAppRule({ path: bundle, name }) !== null) found.dropped.noise += 1
    else if (seen.has(name)) found.dropped.duplicate += 1
    else {
      seen.add(name)
      found.sources[source] += 1
      accepted.push(name)
    }
  })

  found.names = accepted.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  return found
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** The same seed picks the same apps on the same machine; the result is sorted again so plans read the same. */
export function pickApps(
  names: readonly string[],
  seed: number,
  limit: number = DEFAULT_APP_LIMIT
): string[] {
  const sorted = [...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  if (sorted.length <= limit) return sorted
  const random = mulberry32(seed ^ 0x51ed270b)
  for (let index = sorted.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1))
    ;[sorted[index], sorted[other]] = [sorted[other], sorted[index]]
  }
  return sorted.slice(0, limit).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

export function describeDiscovery(found: DiscoveredApps, used: number): string {
  const { sources, dropped } = found
  const dropping = Object.entries(dropped)
    .filter(([, count]) => count > 0)
    .map(([why, count]) => `${count} ${why}`)
  const from = `display name ${sources.displayName}, bundle name ${sources.bundleName}, folder name ${sources.directory}`
  const lost = dropping.length > 0 ? `; dropped ${dropping.join(', ')}` : ''
  return `installed apps: ${found.names.length} usable of ${found.bundlesSeen} bundles (names from ${from}${lost}); ${used} used; ${found.notes.join('; ')}`
}

/** A JSON array of app names, for reproducing a plan on another machine. */
export async function readAppsFile(
  file: string,
  read: (file: string) => Promise<string> = (name) => readFile(name, 'utf8')
): Promise<string[]> {
  const where = `--apps-file ${file}`
  let parsed: unknown
  try {
    parsed = JSON.parse(await read(file))
  } catch (error) {
    throw new UsageError(`${where} could not be read as JSON: ${(error as Error).message}`)
  }
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) {
    throw new UsageError(`${where} must hold a JSON array of strings`)
  }
  const names: string[] = []
  for (const item of parsed as string[]) {
    const name = item.trim()
    const problem = nameProblem(name)
    if (problem !== null)
      throw new UsageError(`${where} has an unusable name ${JSON.stringify(item)}: ${problem}`)
    if (!names.includes(name)) names.push(name)
  }
  if (names.length === 0) throw new UsageError(`${where} is empty`)
  return names
}
