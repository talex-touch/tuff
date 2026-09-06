import { constants } from 'node:fs'
import { access, readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, delimiter, join } from 'node:path'

/**
 * Executable discovery for the local AI CLIs (`pi` first; `omp`, `codex`, `claude` follow the
 * same path).
 *
 * Every one of them is installed by a package manager into a directory Electron never inherits,
 * so the lookup order — an explicit override, then PATH, then the version-manager and fixed
 * roots — is the whole reason a GUI launch finds a binary the user's terminal has always had.
 */

export type CliExecutableForm = 'primary' | 'fallback'

export interface CliExecutableLookup {
  /** The command as typed in a terminal: `pi`, `omp`, … */
  command: string
  /**
   * Commands that stand in for the primary one, consulted only after every location for the
   * primary has been searched. `pie` is pi's installer-shaped alias — same protocol, same
   * catalogue — so a machine with only `pie` still has a pi provider.
   */
  fallbackCommands?: readonly string[]
  /**
   * Environment variable that pins the path outright (`TUFF_PI_CLI_PATH`). Authoritative when
   * set: a value that does not point at an executable means "absent", not "search anyway" — the
   * override exists to make a run deterministic, and a silent fallback would defeat that.
   */
  envOverride: string
}

export interface ResolvedCliExecutable {
  path: string
  /** Which lookup name answered; `fallback` when it came from `fallbackCommands`. */
  form: CliExecutableForm
  /** The command name that resolved (`pie` for a fallback-form pi). */
  command: string
}

/**
 * Version-manager roots that install CLIs outside any PATH entry Electron inherits. A GUI launch
 * on macOS gets `/usr/bin:/bin:/usr/sbin:/sbin` from launchd — none of these are in it, so
 * searching PATH alone finds nothing even when the CLI is installed and works in the user's
 * terminal.
 */
function versionManagerRoots(home: string): string[] {
  return [
    join(home, '.local', 'share', 'mise', 'installs', 'node'),
    join(home, '.volta', 'tools', 'image', 'node'),
    join(home, '.nvm', 'versions', 'node'),
    join(home, '.fnm', 'node-versions')
  ]
}

/** Fixed directories that hold a binary directly, no version subdirectory in between. */
function directBinRoots(home: string): string[] {
  return [
    join(home, '.local', 'bin'),
    join(home, '.bun', 'bin'),
    join(home, '.deno', 'bin'),
    join(home, '.npm-global', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin'
  ]
}

async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

function withPlatformExtensions(command: string): string[] {
  if (process.platform !== 'win32') return [command]
  const extensions = (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean)
  return extensions.map((extension) => `${command}${extension}`)
}

async function findInDirectories(command: string, directories: string[]): Promise<string | null> {
  const names = withPlatformExtensions(command)
  for (const directory of directories) {
    for (const name of names) {
      const candidate = join(directory, name)
      if (await isExecutable(candidate)) return candidate
    }
  }
  return null
}

/**
 * Version managers nest binaries one level down (`installs/node/<version>/bin`). The versions are
 * read newest-first so a machine with several Node installs resolves to the most recently added one
 * rather than an abandoned old install that may not have the CLI at all.
 */
async function expandVersionedBinDirs(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
      .map((entry) => entry.name)
      .sort()
      .reverse()
      .map((version) => join(root, version, 'bin'))
  } catch {
    return []
  }
}

async function fallbackDirectories(): Promise<string[]> {
  const home = homedir()
  const versioned = await Promise.all(versionManagerRoots(home).map(expandVersionedBinDirs))
  return [...versioned.flat(), ...directBinRoots(home)]
}

/**
 * An override names a file, not a command, so its form is read off the file name: a
 * `TUFF_PI_CLI_PATH` that points at `pie` is still the fallback form, and the display name that
 * later hangs off the form must say so.
 */
function classifyOverride(
  lookup: CliExecutableLookup,
  overridePath: string
): Pick<ResolvedCliExecutable, 'command' | 'form'> {
  const fileName = basename(overridePath)
  for (const fallback of lookup.fallbackCommands ?? []) {
    if (matchesCommand(fileName, fallback)) return { command: fallback, form: 'fallback' }
  }
  return { command: lookup.command, form: 'primary' }
}

function matchesCommand(fileName: string, command: string): boolean {
  const names = [command, ...withPlatformExtensions(command)]
  return process.platform === 'win32'
    ? names.some((name) => name.toLowerCase() === fileName.toLowerCase())
    : names.includes(fileName)
}

async function discover(lookup: CliExecutableLookup): Promise<ResolvedCliExecutable | null> {
  const override = process.env[lookup.envOverride]?.trim()
  if (override) {
    if (!(await isExecutable(override))) return null
    return { path: override, ...classifyOverride(lookup, override) }
  }

  const pathDirectories = (process.env.PATH || '').split(delimiter).filter(Boolean)
  // Expanded at most once per probe, and only when PATH misses: a hit on PATH is the common case
  // in a terminal-launched dev build and should not pay for walking four version-manager trees.
  let roots: string[] | undefined

  for (const command of [lookup.command, ...(lookup.fallbackCommands ?? [])]) {
    let found = await findInDirectories(command, pathDirectories)
    if (!found) {
      roots ??= await fallbackDirectories()
      found = await findInDirectories(command, roots)
    }
    if (found) {
      return { path: found, command, form: command === lookup.command ? 'primary' : 'fallback' }
    }
  }

  return null
}

/** Memoised per command: `null` is a probed miss, a missing key means "not probed yet". */
const cache = new Map<string, ResolvedCliExecutable | null>()

/**
 * Resolves a CLI, preferring an explicit override, then PATH, then the version-manager and fixed
 * roots — for the primary command in full before any fallback command is tried. The result is
 * cached because a miss walks several directories and the answer only changes when the user
 * installs or removes the CLI.
 */
export async function resolveCliExecutable(
  lookup: CliExecutableLookup
): Promise<ResolvedCliExecutable | null> {
  const cached = cache.get(lookup.command)
  if (cached !== undefined) return cached

  const resolved = await discover(lookup)
  cache.set(lookup.command, resolved)
  return resolved
}

/**
 * Test seam and install-time refresh: drops the memoised lookup for one command (or every
 * command) so the next resolve re-scans.
 */
export function resetCliExecutableCache(command?: string): void {
  if (command === undefined) cache.clear()
  else cache.delete(command)
}

/**
 * Synchronous read of the memoised lookup, for callers that cannot await.
 *
 * `undefined` means "not probed yet" and is deliberately distinct from `null` ("probed, absent") —
 * config assembly runs on every invoke and must not treat an unprobed machine as one without the
 * CLI. Resolve once at startup to settle it.
 */
export function getResolvedCliExecutable(
  command: string
): ResolvedCliExecutable | null | undefined {
  return cache.get(command)
}
