import { constants } from 'node:fs'
import { access, readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, delimiter, dirname, join } from 'node:path'

/**
 * Executable discovery for the local AI CLIs (`pi`, `omp`, `codex`, `claude`). The chat providers
 * and the local agent (`modules/local-ai-cli`) both resolve through here, so one CLI never resolves
 * to two different programs depending on which feature asked.
 *
 * Every one of them is installed by a package manager into a directory Electron never inherits,
 * so the lookup order — an explicit override, then PATH, then the version-manager and fixed
 * roots — is the whole reason a GUI launch finds a binary the user's terminal has always had.
 *
 * The answer is the path as found, never its `realpath`: a mise shim dispatches on the name it was
 * run by, and a `#!/usr/bin/env node` CLI needs the `node` that sits beside the link, not beside
 * the script it points at. Whoever runs it puts that directory on the child's PATH
 * ({@link withExecutableDirOnPath}).
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

export interface ResolveCliExecutableOptions {
  /**
   * The program the user picked in Settings (「选择程序」, `localAiCli.providers[id].executableOverride`).
   * Consulted after the environment override and before PATH. Unlike that override it is not
   * authoritative: a pick that is not an executable file — moved, uninstalled, or the app bundle
   * rather than the program inside it — is skipped, the search goes on, and the answer says so
   * ({@link ResolvedCliExecutable.settingsOverrideRejected}).
   */
  settingsOverride?: string
}

export interface ResolvedCliExecutable {
  path: string
  /** Which lookup name answered; `fallback` when it came from `fallbackCommands`. */
  form: CliExecutableForm
  /** The command name that resolved (`pie` for a fallback-form pi). */
  command: string
  /** A settings override was given but was not executable, so this path was found without it. */
  settingsOverrideRejected?: true
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

/**
 * A regular file the user may run. `stat` follows a link to its target, so a mise shim (a link to
 * the mise binary) counts, while the path itself stays what is returned and run. `access` alone is
 * not enough: on a directory `X_OK` means "may enter", and an app bundle picked in 「选择程序」
 * (`Claude.app`) passed it.
 */
async function isExecutable(path: string): Promise<boolean> {
  try {
    if (!(await stat(path)).isFile()) return false
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

function pathDirectories(): string[] {
  return (process.env.PATH || '').split(delimiter).filter(Boolean)
}

/**
 * A full `major.minor.patch` directory name, with nvm's `v` prefix allowed. Version managers also
 * keep aliases (`latest`, `lts`, `lts-jod`) and short names (`24`, `24.18`) beside the real
 * installs; every one of them links to a full version directory that is searched anyway.
 */
const VERSION_DIRECTORY = /^v?(\d+)\.(\d+)\.(\d+)$/

function parseVersionDirectory(name: string): number[] | null {
  const match = VERSION_DIRECTORY.exec(name)
  return match ? match.slice(1, 4).map(Number) : null
}

function compareVersionsDescending(left: number[], right: number[]): number {
  for (let index = 0; index < 3; index += 1) {
    const difference = (right[index] ?? 0) - (left[index] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}

/**
 * Version managers nest binaries one level down (`installs/node/<version>/bin`). The versions are
 * read newest-first, by number — `24.18.0` before `24.9.0`, which a string sort gets backwards — so
 * a machine with several Node installs resolves to the newest one rather than an abandoned old
 * install that may not have the CLI at all.
 */
async function expandVersionedBinDirs(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
      .flatMap((entry) => {
        const version = parseVersionDirectory(entry.name)
        return version ? [{ name: entry.name, version }] : []
      })
      .sort((left, right) => compareVersionsDescending(left.version, right.version))
      .map((entry) => join(root, entry.name, 'bin'))
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
 * `TUFF_PI_CLI_PATH` (or a pick in Settings) that points at `pie` is still the fallback form, and
 * the display name that later hangs off the form must say so.
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

async function discover(
  lookup: CliExecutableLookup,
  settingsOverride: string | undefined
): Promise<ResolvedCliExecutable | null> {
  const override = process.env[lookup.envOverride]?.trim()
  if (override) {
    if (!(await isExecutable(override))) return null
    return { path: override, ...classifyOverride(lookup, override) }
  }

  let settingsOverrideRejected = false
  if (settingsOverride) {
    if (await isExecutable(settingsOverride)) {
      return { path: settingsOverride, ...classifyOverride(lookup, settingsOverride) }
    }
    settingsOverrideRejected = true
  }

  const directories = pathDirectories()
  // Expanded at most once per probe, and only when PATH misses: a hit on PATH is the common case
  // in a terminal-launched dev build and should not pay for walking four version-manager trees.
  let roots: string[] | undefined

  for (const command of [lookup.command, ...(lookup.fallbackCommands ?? [])]) {
    let found = await findInDirectories(command, directories)
    if (!found) {
      roots ??= await fallbackDirectories()
      found = await findInDirectories(command, roots)
    }
    if (found) {
      return {
        path: found,
        command,
        form: command === lookup.command ? 'primary' : 'fallback',
        ...(settingsOverrideRejected ? { settingsOverrideRejected: true as const } : {})
      }
    }
  }

  return null
}

/**
 * Memoised per command and settings override: `null` is a probed miss, a missing key means "not
 * probed yet". The override is part of the key because it changes the answer: a pick in Settings
 * must not be answered by what was found before it existed.
 */
const cache = new Map<string, ResolvedCliExecutable | null>()

/** Bare-command hits for {@link findCommandInSearchRoots}, kept apart from the CLI lookups. */
const searchRootsCache = new Map<string, string>()

/**
 * Bumped by every reset and every refresh. A search still running from before one of them hands
 * its answer to its own caller but does not write it into the memo: it may have looked before the
 * install, removal or pick the reset or refresh is there to take in.
 */
let generation = 0

function cacheKey(command: string, settingsOverride: string | undefined): string {
  return `${command}\0${settingsOverride?.trim() ?? ''}`
}

/**
 * Resolves a CLI: the environment override, then the settings override, then PATH, then the
 * version-manager and fixed roots — for the primary command in full before any fallback command is
 * tried. The result is cached because a miss walks several directories and the answer only changes
 * when the user installs or removes the CLI; {@link refreshCliExecutables} is the way to ask
 * again.
 */
export async function resolveCliExecutable(
  lookup: CliExecutableLookup,
  options: ResolveCliExecutableOptions = {}
): Promise<ResolvedCliExecutable | null> {
  const settingsOverride = options.settingsOverride?.trim() || undefined
  const key = cacheKey(lookup.command, settingsOverride)
  const cached = cache.get(key)
  if (cached !== undefined) return cached

  const startedIn = generation
  const resolved = await discover(lookup, settingsOverride)
  if (startedIn === generation) cache.set(key, resolved)
  return resolved
}

/** One CLI for {@link refreshCliExecutables}, and the settings override it is read under. */
export interface CliExecutableRefresh {
  lookup: CliExecutableLookup
  settingsOverride?: string
}

let refreshing: Promise<void> = Promise.resolve()

/**
 * Looks the given CLIs up again (「重新探测」, a new or a cleared pick) and swaps the answers in
 * together once the last search is done. Until then every reader keeps the previous answer: config
 * assembly reads the memo synchronously on every invoke and drops a CLI it finds unprobed, so
 * emptying the memo first, as {@link resetCliExecutableCache} does, would take the CLI chat rows
 * away for as long as the search runs.
 *
 * What the same commands were memoised as under other settings overrides goes in the same step
 * (those picks are no longer current), and so do the bare-command answers. Refreshes run one at a
 * time, in the order asked, so the last one asked for is the last to land.
 */
export function refreshCliExecutables(refreshes: readonly CliExecutableRefresh[]): Promise<void> {
  const run = refreshing.then(async () => {
    const startedIn = ++generation
    const answers = await Promise.all(
      refreshes.map(async ({ lookup, settingsOverride }) => {
        const override = settingsOverride?.trim() || undefined
        const resolved = await discover(lookup, override)
        return { key: cacheKey(lookup.command, override), resolved }
      })
    )
    // A reset while this ran asked for everything to be forgotten, and this began before it.
    if (startedIn !== generation) return
    const prefixes = refreshes.map(({ lookup }) => `${lookup.command}\0`)
    for (const key of [...cache.keys()]) {
      if (prefixes.some((prefix) => key.startsWith(prefix))) cache.delete(key)
    }
    searchRootsCache.clear()
    for (const { key, resolved } of answers) cache.set(key, resolved)
  })
  refreshing = run.catch(() => undefined)
  return run
}

/**
 * Drops the memoised lookups for one command (under every settings override) or for every
 * command, so the next resolve re-scans; until then the command reads as unprobed. A test seam:
 * the app asks again through {@link refreshCliExecutables}, which never leaves that gap.
 */
export function resetCliExecutableCache(command?: string): void {
  generation += 1
  if (command === undefined) {
    cache.clear()
    searchRootsCache.clear()
    return
  }
  const prefix = `${command}\0`
  for (const key of [...cache.keys()]) {
    if (key.startsWith(prefix)) cache.delete(key)
  }
  searchRootsCache.delete(command)
}

/**
 * Synchronous read of the memoised lookup, for callers that cannot await. Pass the same settings
 * override the resolve was given: the answer for another override is another entry.
 *
 * `undefined` means "not probed yet" and is deliberately distinct from `null` ("probed, absent") —
 * config assembly runs on every invoke and must not treat an unprobed machine as one without the
 * CLI. Resolve once at startup to settle it.
 */
export function getResolvedCliExecutable(
  command: string,
  settingsOverride?: string
): ResolvedCliExecutable | null | undefined {
  return cache.get(cacheKey(command, settingsOverride?.trim() || undefined))
}

/**
 * Finds a bare command (`npx`, `node`, `uvx`) the way the CLI lookup does — PATH, then the
 * version-manager roots, then the fixed bins — with no override and no fallback name. For the
 * stdio MCP servers a GUI launch would otherwise start with launchd's PATH.
 *
 * Only hits are memoised, and a remembered hit is checked again before it is handed out: servers
 * start long after the first lookup, and the version manager may have removed that Node since. A
 * miss is searched for again next time, so a command installed later is found without a restart.
 */
export async function findCommandInSearchRoots(command: string): Promise<string | null> {
  const cached = searchRootsCache.get(command)
  if (cached !== undefined) {
    if (await isExecutable(cached)) return cached
    if (searchRootsCache.get(command) === cached) searchRootsCache.delete(command)
  }

  const startedIn = generation
  const found =
    (await findInDirectories(command, pathDirectories())) ??
    (await findInDirectories(command, await fallbackDirectories()))
  if (found && startedIn === generation) searchRootsCache.set(command, found)
  return found
}

/** The fixed bin directories ({@link directBinRoots}) that exist on this machine. */
export async function existingDirectBinDirectories(): Promise<string[]> {
  const directories = directBinRoots(homedir())
  const present = await Promise.all(
    directories.map(async (directory) => {
      try {
        return (await stat(directory)).isDirectory()
      } catch {
        return false
      }
    })
  )
  return directories.filter((_directory, index) => present[index])
}

/**
 * The environment a CLI child is started with: `env` with the executable's own directory in front
 * of PATH. These CLIs are `#!/usr/bin/env node` scripts and version managers keep `node` beside
 * them; a GUI launch inherits a PATH that contains neither, so without this the shebang fails to
 * resolve even though the binary itself was found by absolute path.
 */
export function withExecutableDirOnPath<T extends Record<string, string | undefined>>(
  env: T,
  executable: string
): T & { PATH: string } {
  return { ...env, PATH: [dirname(executable), env.PATH].filter(Boolean).join(delimiter) }
}
