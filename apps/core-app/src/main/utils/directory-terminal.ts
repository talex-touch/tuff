/**
 * Opening a directory in a terminal, and revealing any path in the file manager.
 *
 * Two things this module refuses to do, because both look like success and are not:
 *
 * - Guess. A macOS app is only offered when its bundle declares it opens `public.folder` /
 *   `public.directory`; `open -a SomeApp <dir>` on a terminal that does not open folders silently
 *   shows an empty window at `$HOME`, i.e. exactly the wrong answer reported as a win. Windows and
 *   Linux launchers are only offered when they are known to accept a working directory.
 * - Shell out. Every path travels as one `execFile`/`spawn` argv entry or as a process `cwd`. Nothing
 *   is interpolated into a command string, so a directory named `; rm -rf ~` stays a directory.
 *
 * Discovery is cached in the main process for the process lifetime: the CoreBox search path must
 * never run `osascript` or walk every application directory per keystroke.
 * {@link primeDirectoryTerminalDiscovery} is called once from provider startup; a search that arrives
 * mid-probe awaits the same single flight instead of starting a second one.
 */

import { execFile, spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { getLogger } from '@talex-touch/utils/common/logger'

const log = getLogger('directory-terminal')

/** The subset of `fs.Stats` discovery and launch need; keeps the test seam free of a real filesystem. */
export interface DirectoryTerminalStats {
  isDirectory(): boolean
  isFile(): boolean
}

/** A launchable terminal, as discovered on this machine. */
export interface DirectoryTerminal {
  /** Stable, sanitized identity (`/^[a-z0-9.-]{1,64}$/`), used in item ids and settings. */
  id: string
  /** Display name, from the bundle where one is declared. */
  name: string
  /** Bundle path (macOS) or executable path. Never handed to a renderer or a plugin child. */
  target: string
  kind: 'mac-bundle' | 'win-exe' | 'linux-bin'
  source: 'installed' | 'system-default'
}

export interface DirectoryTerminalInventory {
  /** The OS default terminal: the answer when the user configured none. */
  default: DirectoryTerminal | null
  /** Every discovered terminal except {@link default}, in discovery order. */
  installed: DirectoryTerminal[]
  all: DirectoryTerminal[]
}

/**
 * Injected seams. Production passes nothing; tests pass fakes so the suite does not have to own a
 * real Ghostty install or spawn windows.
 */
export interface DirectoryTerminalDeps {
  platform?: NodeJS.Platform
  homeDir?: string
  stat?: (target: string) => Promise<DirectoryTerminalStats>
  readFile?: (target: string) => Promise<Uint8Array>
  runFile?: (
    file: string,
    args: readonly string[],
    options?: { timeout?: number }
  ) => Promise<unknown>
  spawnFile?: (file: string, args: readonly string[], options: { cwd: string }) => unknown
  appDirs?: readonly string[]
  pathEnv?: string
}

const MAC_APP_DIRS = [
  '/Applications',
  '/System/Applications',
  '/System/Applications/Utilities'
] as const

/** Known macOS terminals, in preference order. `bundle` is what makes a rename still resolvable. */
const MAC_TERMINAL_IDENTITIES = [
  { id: 'ghostty', bundle: 'Ghostty.app', name: 'Ghostty' },
  { id: 'iterm', bundle: 'iTerm.app', name: 'iTerm2' },
  { id: 'warp', bundle: 'Warp.app', name: 'Warp' },
  { id: 'wezterm', bundle: 'WezTerm.app', name: 'WezTerm' },
  { id: 'kitty', bundle: 'kitty.app', name: 'kitty' },
  { id: 'alacritty', bundle: 'Alacritty.app', name: 'Alacritty' },
  { id: 'hyper', bundle: 'Hyper.app', name: 'Hyper' },
  { id: 'tabby', bundle: 'Tabby.app', name: 'Tabby' },
  { id: 'cmux', bundle: 'cmux.app', name: 'cmux' },
  { id: 'terminal', bundle: 'Terminal.app', name: 'Terminal' }
] as const

/** macOS system terminal, the answer when nothing else is installed or configured. */
const MAC_SYSTEM_TERMINAL_BUNDLE = '/System/Applications/Utilities/Terminal.app'

const LINUX_TERMINAL_CANDIDATES = [
  { id: 'gnome-terminal', name: 'GNOME Terminal', bin: 'gnome-terminal' },
  { id: 'konsole', name: 'Konsole', bin: 'konsole' },
  { id: 'xfce4-terminal', name: 'Xfce Terminal', bin: 'xfce4-terminal' },
  { id: 'alacritty', name: 'Alacritty', bin: 'alacritty' },
  { id: 'kitty', name: 'kitty', bin: 'kitty' },
  { id: 'wezterm', name: 'WezTerm', bin: 'wezterm' },
  { id: 'x-terminal-emulator', name: 'Terminal', bin: 'x-terminal-emulator' }
] as const

/** macOS document-type UTIs that mean "this terminal opens a folder". */
const FOLDER_TYPE_MARKERS = ['public.folder', 'public.directory'] as const

/** Finder / Explorer are reached through Electron's `shell`, behind a caller-provided port. */
export interface FileManagerPort {
  /** Opens a path with the OS default handler. Returns an error string on failure. */
  openPath: (target: string) => Promise<string>
  /** Selects the path inside its parent folder. */
  showItemInFolder: (target: string) => void
}

let cachedInventory: DirectoryTerminalInventory | null = null
let discoveryFlight: Promise<DirectoryTerminalInventory> | null = null

/** Terminal ids end up in item ids and setting values, so they are narrow by construction. */
export function normalizeDirectoryTerminalId(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized.slice(0, 64) || 'terminal'
}

async function defaultRunFile(
  file: string,
  args: readonly string[],
  options: { timeout?: number } = {}
): Promise<unknown> {
  const { promise, resolve, reject } = Promise.withResolvers<unknown>()
  execFile(file, [...args], { timeout: options.timeout, maxBuffer: 64 * 1024 }, (error, stdout) => {
    if (error) {
      reject(error)
      return
    }
    resolve(stdout)
  })
  return await promise
}

function defaultSpawnFile(
  file: string,
  args: readonly string[],
  options: { cwd: string }
): Promise<void> {
  const { promise, resolve, reject } = Promise.withResolvers<void>()
  const child = spawn(file, [...args], {
    cwd: options.cwd,
    detached: true,
    stdio: 'ignore',
    shell: false
  })
  child.once('error', reject)
  child.once('spawn', () => {
    child.unref()
    resolve()
  })
  return promise
}

/**
 * Whether a macOS bundle declares a document type in `markers`.
 *
 * `Info.plist` is usually a binary plist, so this is a byte-substring scan rather than a parse: the
 * value looked for is an ASCII UTI string, and both encodings keep it literal. A missing or
 * unreadable plist is a "no" — the bundle is then simply not offered.
 */
async function bundleDeclaresDocumentType(
  bundlePath: string,
  markers: readonly string[],
  deps: DirectoryTerminalDeps
): Promise<boolean> {
  const readFile = deps.readFile ?? fs.readFile
  try {
    const content = await readFile(path.join(bundlePath, 'Contents', 'Info.plist'))
    const text = Buffer.from(content).toString('latin1')
    return markers.some((marker) => text.includes(marker))
  } catch {
    return false
  }
}

function macAppDirectories(deps: DirectoryTerminalDeps): string[] {
  if (deps.appDirs) return [...deps.appDirs]
  return [...MAC_APP_DIRS, path.join(deps.homeDir ?? os.homedir(), 'Applications')]
}

async function discoverMacTerminals(deps: DirectoryTerminalDeps): Promise<DirectoryTerminal[]> {
  const stat = deps.stat ?? fs.stat
  const appDirs = macAppDirectories(deps)
  const found: DirectoryTerminal[] = []

  for (const identity of MAC_TERMINAL_IDENTITIES) {
    let bundlePath: string | null = null
    for (const dir of appDirs) {
      const candidate = path.join(dir, identity.bundle)
      try {
        if ((await stat(candidate)).isDirectory()) {
          bundlePath = candidate
          break
        }
      } catch {
        // Not here; a later application directory may still have it.
      }
    }
    if (!bundlePath) continue
    if (!(await bundleDeclaresDocumentType(bundlePath, FOLDER_TYPE_MARKERS, deps))) continue
    found.push({
      id: identity.id,
      name: identity.name,
      target: bundlePath,
      kind: 'mac-bundle',
      // Terminal.app is the OS's own terminal, so it is what "the default" means when the user has
      // configured nothing — even on a machine with Ghostty and iTerm2 installed. Those stay
      // available as their own rows, and an explicit `directory.terminalId` still outranks this.
      source: identity.id === 'terminal' ? 'system-default' : 'installed'
    })
  }

  if (!found.some((terminal) => terminal.id === 'terminal')) {
    try {
      if ((await stat(MAC_SYSTEM_TERMINAL_BUNDLE)).isDirectory()) {
        found.push({
          id: 'terminal',
          name: 'Terminal',
          target: MAC_SYSTEM_TERMINAL_BUNDLE,
          kind: 'mac-bundle',
          source: 'system-default'
        })
      }
    } catch {
      // A machine without Terminal.app is not a machine we can answer for; the caller renders nothing.
    }
  }

  return found
}

async function discoverWindowsTerminals(deps: DirectoryTerminalDeps): Promise<DirectoryTerminal[]> {
  const stat = deps.stat ?? fs.stat
  const found: DirectoryTerminal[] = []
  const windowsRoot = process.env.SystemRoot || 'C:\\Windows'
  const roots = [
    ...(process.env.LOCALAPPDATA
      ? [path.win32.join(process.env.LOCALAPPDATA, 'Microsoft', 'WindowsApps')]
      : []),
    ...(deps.pathEnv ?? process.env.PATH ?? '').split(';').filter(path.win32.isAbsolute)
  ]
  for (const root of roots) {
    const target = path.win32.join(root, 'wt.exe')
    try {
      if (!(await stat(target)).isFile()) continue
      found.push({
        id: 'windows-terminal',
        name: 'Windows Terminal',
        target,
        kind: 'win-exe',
        source: 'installed'
      })
      break
    } catch {
      // Only an installed launcher is offered.
    }
  }
  const commandPrompt = path.win32.join(windowsRoot, 'System32', 'cmd.exe')
  try {
    if ((await stat(commandPrompt)).isFile()) {
      found.push({
        id: 'cmd',
        name: 'Command Prompt',
        target: commandPrompt,
        kind: 'win-exe',
        source: 'system-default'
      })
    }
  } catch {
    // A missing system executable is not a launchable terminal.
  }
  return found
}

async function discoverLinuxTerminals(deps: DirectoryTerminalDeps): Promise<DirectoryTerminal[]> {
  const stat = deps.stat ?? fs.stat
  const dirs = (deps.pathEnv ?? process.env.PATH ?? '').split(path.delimiter).filter(Boolean)
  const found: DirectoryTerminal[] = []

  for (const candidate of LINUX_TERMINAL_CANDIDATES) {
    let resolved: string | null = null
    for (const dir of dirs) {
      const target = path.join(dir, candidate.bin)
      try {
        if ((await stat(target)).isFile()) {
          resolved = target
          break
        }
      } catch {
        // Keep looking.
      }
    }
    if (!resolved) continue
    found.push({
      id: candidate.id,
      name: candidate.name,
      target: resolved,
      kind: 'linux-bin',
      // The head of the candidate list is the platform's own terminal where it exists.
      source: found.length === 0 ? 'system-default' : 'installed'
    })
  }

  return found
}

function buildInventory(discovered: DirectoryTerminal[]): DirectoryTerminalInventory {
  const all: DirectoryTerminal[] = []
  for (const terminal of discovered) {
    if (all.some((existing) => existing.id === terminal.id)) continue
    all.push(terminal)
  }

  const chosen = all.find((terminal) => terminal.source === 'system-default') ?? all[0] ?? null
  return {
    default: chosen,
    installed: all.filter((terminal) => terminal.id !== chosen?.id),
    all
  }
}

/**
 * Terminal inventory for this machine, cached for the process lifetime.
 *
 * One in-flight discovery is shared by every caller, including {@link primeDirectoryTerminalDiscovery}:
 * a search arriving during startup awaits the same promise rather than starting a second probe.
 */
export async function getDirectoryTerminals(
  deps?: DirectoryTerminalDeps
): Promise<DirectoryTerminalInventory> {
  const discover = async (): Promise<DirectoryTerminalInventory> => {
    const options = deps ?? {}
    const platform = options.platform ?? process.platform
    let discovered: DirectoryTerminal[] = []
    if (platform === 'darwin') discovered = await discoverMacTerminals(options)
    else if (platform === 'win32') discovered = await discoverWindowsTerminals(options)
    else if (platform === 'linux') discovered = await discoverLinuxTerminals(options)
    return buildInventory(discovered)
  }
  if (deps) return discover()
  if (cachedInventory) return cachedInventory
  if (discoveryFlight) return discoveryFlight
  discoveryFlight = discover().then((inventory) => {
    cachedInventory = inventory
    return inventory
  })
  try {
    return await discoveryFlight
  } finally {
    discoveryFlight = null
  }
}

/**
 * Starts discovery in the background without awaiting it. Provider startup calls this so the first
 * keystroke finds a warm cache and never pays for the probe itself.
 */
export function primeDirectoryTerminalDiscovery(deps?: DirectoryTerminalDeps): void {
  void getDirectoryTerminals(deps).catch((error) => {
    log.warn('Terminal discovery prime failed', { error })
  })
}

export interface PreferredTerminalResolution {
  terminal: DirectoryTerminal | null
  /** True when the user explicitly configured this terminal; false means it is only the OS default. */
  configured: boolean
}

/**
 * The terminal a bare "open here" row should use.
 *
 * The configured id wins only when it still names a discovered terminal — a terminal the user
 * uninstalled must not leave the row pointing at a path that is gone; it falls back to the OS default
 * and the caller says so.
 */
export function resolvePreferredTerminal(
  inventory: DirectoryTerminalInventory,
  preferredTerminalId?: string | null
): PreferredTerminalResolution {
  const normalized = preferredTerminalId ? normalizeDirectoryTerminalId(preferredTerminalId) : null
  if (normalized) {
    const configured = inventory.all.find((terminal) => terminal.id === normalized)
    if (configured) return { terminal: configured, configured: true }
  }
  return { terminal: inventory.default, configured: false }
}

/**
 * Opens `dirPath` as the working directory of `terminal`.
 *
 * Returns false — never throws — when the directory is gone, is not a directory, or the terminal
 * itself no longer exists. The caller maps that to "the action did not happen", so nothing is
 * recorded as a use.
 */
export async function openDirectoryInTerminal(
  terminal: DirectoryTerminal,
  dirPath: string,
  deps: DirectoryTerminalDeps = {}
): Promise<boolean> {
  if (typeof dirPath !== 'string' || !dirPath.trim()) return false

  const stat = deps.stat ?? fs.stat
  const runFile = deps.runFile ?? defaultRunFile
  const spawnFile = deps.spawnFile ?? defaultSpawnFile

  try {
    if (!(await stat(dirPath)).isDirectory()) return false
  } catch {
    return false
  }

  try {
    if (terminal.kind === 'mac-bundle') {
      // The bundle is re-checked at launch time so a terminal uninstalled since discovery fails cleanly
      // instead of asking LaunchServices for something that is gone.
      if (!(await stat(terminal.target)).isDirectory()) return false
      // LaunchServices on the bundle path, with the directory as a plain argv entry: no shell, no
      // command string, and no application that merely claims the folder.
      await runFile('/usr/bin/open', ['-a', terminal.target, dirPath])
      return true
    }

    if (terminal.kind === 'win-exe') {
      if (terminal.target.toLowerCase().endsWith('wt.exe')) {
        await spawnFile(terminal.target, ['-d', dirPath], { cwd: dirPath })
        return true
      }
      // `cmd.exe` has no working-directory flag; the child's cwd does the job.
      if (!(await stat(terminal.target)).isFile()) return false
      await spawnFile(terminal.target, [], { cwd: dirPath })
      return true
    }

    if (terminal.id === 'konsole') {
      await spawnFile(terminal.target, ['--workdir', dirPath], { cwd: dirPath })
      return true
    }
    if (terminal.id === 'gnome-terminal' || terminal.id === 'xfce4-terminal') {
      await spawnFile(terminal.target, [`--working-directory=${dirPath}`], { cwd: dirPath })
      return true
    }

    if (!(await stat(terminal.target)).isFile()) return false
    await spawnFile(terminal.target, [], { cwd: dirPath })
    return true
  } catch (error) {
    log.warn('Failed to open directory in terminal', {
      error,
      meta: { terminal: terminal.id, path: dirPath }
    })
    return false
  }
}

/**
 * Reveals `target` with the OS file manager: a directory opens, anything else is selected inside its
 * parent — the same rule the host's `system.showInFolder` handler applies, kept here because a path
 * action and that handler are the same user intent.
 */
export async function revealPathInFileManager(
  target: string,
  port: FileManagerPort,
  deps: DirectoryTerminalDeps = {}
): Promise<boolean> {
  if (typeof target !== 'string' || !target.trim()) return false

  const stat = deps.stat ?? fs.stat
  let isDirectory = false
  try {
    isDirectory = (await stat(target)).isDirectory()
  } catch {
    return false
  }

  try {
    if (isDirectory) return !(await port.openPath(target))
    port.showItemInFolder(target)
    return true
  } catch (error) {
    log.warn('Failed to reveal path', { error, meta: { path: target } })
    return false
  }
}
