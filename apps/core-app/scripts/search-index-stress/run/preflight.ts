import { execFile } from 'node:child_process'
import { access, constants, statfs, unlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { directoryNameProblem } from './deps'
import { RunRefused } from './errors'
import { DEFAULT_CORPUS_BASE, STRESS_ROOT } from './layout'
import type { LockInfo } from './lock'
import { lockState } from './lock'
import type { AppPorts } from './ports'
import { allocateAppPorts } from './ports'
import type { UserInstanceProbes } from './process-info'
import { listProcesses, portHasListener, userInstanceProblems } from './process-info'

export type PreflightStatus = 'pass' | 'warn' | 'refuse'

export interface PreflightItem {
  id: string
  status: PreflightStatus
  title: string
  detail: string
}

export interface PreflightEnv {
  platform: NodeJS.Platform
  nodeVersion: string
  uid: number | null
  /** The pid that may hold the run lock without it counting as another run. */
  ownPid?: number
  home: string
  appDir: string
  probes: UserInstanceProbes
  lock: () => Promise<{ state: 'free' } | { state: 'held' | 'stale'; info: LockInfo }>
  allocatePorts: () => Promise<AppPorts>
  /** Writes and removes a probe file in the nearest existing directory at or above `dir`; throws when it cannot. */
  checkWritable: (dir: string) => Promise<void>
  freeBytes: (dir: string) => Promise<number>
  hasTool: (name: string) => Promise<boolean>
  fileExists: (file: string) => Promise<boolean>
}

export interface PreflightInput {
  embedding: 'on' | 'off'
  corpusRoot?: string
  /** Bytes of the seed corpus plus what the scenarios write. */
  plannedBytes: number
  /** Names the search-app scenarios can be built from; ignored when they came from `--apps-file`. */
  appCount: number
  appsFromFile?: boolean
}

export const MIN_FREE_BYTES = 5 * 1024 ** 3
export const CORPUS_WARN_BYTES = 100 * 1024 * 1024
export const MIN_APPS = 10
const REQUIRED_TOOLS = ['ps', 'lsof', 'pnpm']
const OPTIONAL_TOOLS: Array<[string, string]> = [
  ['sample', 'no process samples are taken when the app stalls'],
  ['sips', 'image conversions are unavailable'],
  ['plutil', 'installed app names fall back to folder names']
]

const gib = (bytes: number): string => `${(bytes / 1024 ** 3).toFixed(1)} GiB`
const mib = (bytes: number): string => `${Math.round(bytes / 1024 ** 2)} MiB`

/** The indexer skips these without saying so, which would make every scenario fail for the wrong reason. */
export function corpusLocationProblem(dir: string, home: string): string | null {
  const resolved = path.resolve(dir)
  if (/^\/(?:private|tmp|var)(?:\/|$)/.test(resolved))
    return 'under /private, /tmp or /var, which the file indexer skips'
  const workspace = path.join(home, 'Workspace')
  if (resolved === workspace || resolved.startsWith(`${workspace}/`))
    return 'under ~/Workspace, which the file indexer skips'
  for (const segment of resolved.split('/').filter(Boolean)) {
    const problem = directoryNameProblem(segment)
    if (problem) return `${problem} (the indexer skips such directories)`
  }
  return null
}

export async function runPreflight(
  input: PreflightInput,
  env: PreflightEnv
): Promise<PreflightItem[]> {
  const items: PreflightItem[] = []
  const add = (id: string, status: PreflightStatus, title: string, detail: string): void =>
    void items.push({ id, status, title, detail })

  add(
    'platform',
    env.platform === 'darwin' ? 'pass' : 'refuse',
    'macOS',
    env.platform === 'darwin'
      ? 'darwin'
      : `the harness drives the macOS app; this is ${env.platform}`
  )
  const major = Number(/^v?(\d+)/.exec(env.nodeVersion)?.[1] ?? 0)
  add('node', major >= 22 ? 'pass' : 'refuse', 'Node.js 22 or newer', `running ${env.nodeVersion}`)
  add(
    'user',
    env.uid === 0 ? 'refuse' : 'pass',
    'not running as root',
    env.uid === 0 ? 'Electron refuses to start as root' : `uid ${env.uid ?? '?'}`
  )

  const instances = await userInstanceProblems(env.probes).catch((error: unknown) => [
    `could not look for running instances: ${(error as Error).message}`
  ])
  add(
    'instances',
    instances.length > 0 ? 'refuse' : 'pass',
    'no other Tuff instance running',
    instances.length > 0
      ? instances.join('; ')
      : 'port 5173 is free, no release, dev or stress Electron found'
  )

  const lock = await env.lock()
  if (lock.state === 'held' && lock.info.pid === (env.ownPid ?? process.pid))
    add(
      'lock',
      'pass',
      'no other stress run active',
      `this run holds the lock (${lock.info.runId})`
    )
  else if (lock.state === 'held')
    add(
      'lock',
      'refuse',
      'no other stress run active',
      `pid ${lock.info.pid} is running ${lock.info.runId}`
    )
  else if (lock.state === 'stale')
    add(
      'lock',
      'warn',
      'no other stress run active',
      `stale lock of dead pid ${lock.info.pid} (${lock.info.runId}); it is replaced`
    )
  else add('lock', 'pass', 'no other stress run active', 'no lock')

  try {
    const ports = await env.allocatePorts()
    add(
      'ports',
      'pass',
      'free ports for the app',
      `cdp ${ports.cdp}, inspector ${ports.inspect}, dev server ${ports.vite}`
    )
  } catch (error) {
    add(
      'ports',
      'refuse',
      'free ports for the app',
      `could not allocate loopback ports: ${(error as Error).message}`
    )
  }

  const corpusDir = input.corpusRoot ?? DEFAULT_CORPUS_BASE
  const excluded = corpusLocationProblem(corpusDir, env.home)
  if (excluded)
    add('corpus-location', 'refuse', 'corpus location is indexable', `${corpusDir} is ${excluded}`)
  else {
    try {
      await env.checkWritable(corpusDir)
      add('corpus-location', 'pass', 'corpus location is indexable and writable', corpusDir)
    } catch (error) {
      add(
        'corpus-location',
        'refuse',
        'corpus location is writable',
        `${corpusDir}: ${(error as Error).message}`
      )
    }
  }

  const needed = Math.max(MIN_FREE_BYTES, 3 * input.plannedBytes)
  for (const [id, dir, what] of [
    ['disk-corpus', corpusDir, 'corpus volume'],
    ['disk-run', STRESS_ROOT, 'run output volume']
  ] as const) {
    try {
      const free = await env.freeBytes(dir)
      add(
        id,
        free >= needed ? 'pass' : 'refuse',
        `free disk on the ${what}`,
        `${gib(free)} free, ${gib(needed)} needed (max of 5 GiB and 3 x the planned corpus)`
      )
    } catch (error) {
      add(
        id,
        'refuse',
        `free disk on the ${what}`,
        `could not read the free space of ${dir}: ${(error as Error).message}`
      )
    }
  }
  add(
    'corpus-size',
    input.plannedBytes > CORPUS_WARN_BYTES ? 'warn' : 'pass',
    'corpus stays small',
    `${mib(input.plannedBytes)} planned${input.plannedBytes > CORPUS_WARN_BYTES ? '; over 100 MiB on a tight disk, consider a smaller --count' : ''}`
  )

  const missing: string[] = []
  for (const tool of REQUIRED_TOOLS) if (!(await env.hasTool(tool))) missing.push(tool)
  add(
    'tools',
    missing.length > 0 ? 'refuse' : 'pass',
    'required tools',
    missing.length > 0 ? `missing: ${missing.join(', ')}` : REQUIRED_TOOLS.join(', ')
  )
  for (const [tool, consequence] of OPTIONAL_TOOLS) {
    const present = await env.hasTool(tool)
    add(
      `tool-${tool}`,
      present ? 'pass' : 'warn',
      `${tool} available`,
      present ? tool : `not found: ${consequence}`
    )
  }

  const wrapper = path.join(env.appDir, 'scripts', 'dev-electron-wrapper.mjs')
  const electronVite = path.join(env.appDir, 'node_modules', '.bin', 'electron-vite')
  const absent: string[] = []
  for (const file of [wrapper, electronVite]) if (!(await env.fileExists(file))) absent.push(file)
  add(
    'repo',
    absent.length > 0 ? 'refuse' : 'pass',
    'app can be started from this checkout',
    absent.length > 0
      ? `missing: ${absent.join(', ')} (run pnpm install)`
      : 'dev wrapper and electron-vite found'
  )

  if (input.embedding === 'on') {
    const manifest = path.join(
      env.home,
      'Library',
      'Application Support',
      'Tuff',
      'intelligence',
      'local-embedding.json'
    )
    const present = await env.fileExists(manifest)
    add(
      'embedding',
      present ? 'pass' : 'refuse',
      'embedding assets installed',
      present
        ? manifest
        : `--embedding on needs ${manifest}; run with --embedding off or install the local embedding model first`
    )
  }

  if (!input.appsFromFile) {
    const count = input.appCount
    add(
      'apps',
      count >= MIN_APPS ? 'pass' : 'warn',
      'enough installed apps for search-app scenarios',
      `${count} usable apps found${count < MIN_APPS ? `; fewer than ${MIN_APPS} makes the search-app class thin (use --apps-file)` : ''}`
    )
  }
  return items
}

export function refusals(items: readonly PreflightItem[]): PreflightItem[] {
  return items.filter((item) => item.status === 'refuse')
}

export function formatPreflight(items: readonly PreflightItem[]): string {
  const label: Record<PreflightStatus, string> = {
    pass: 'PASS  ',
    warn: 'WARN  ',
    refuse: 'REFUSE'
  }
  const lines = items.map((item) => `${label[item.status]} ${item.title}: ${item.detail}`)
  const bad = refusals(items).length
  const warned = items.filter((item) => item.status === 'warn').length
  lines.push(
    '',
    bad > 0
      ? `${bad} check(s) refuse a run${warned > 0 ? `, ${warned} warning(s)` : ''}.`
      : `A run is allowed${warned > 0 ? ` (${warned} warning(s))` : ''}.`
  )
  return lines.join('\n')
}

export function assertRunnable(items: readonly PreflightItem[]): void {
  const bad = refusals(items)
  if (bad.length > 0)
    throw new RunRefused(
      `a stress run is not possible here: ${bad.map((item) => `${item.title}: ${item.detail}`).join('; ')}`,
      bad.map((item) => `${item.title}: ${item.detail}`)
    )
}

async function nearestExisting(dir: string): Promise<string> {
  let current = path.resolve(dir)
  for (;;) {
    try {
      await access(current, constants.F_OK)
      return current
    } catch {
      const parent = path.dirname(current)
      if (parent === current) return current
      current = parent
    }
  }
}

export function defaultPreflightEnv(appDir: string): PreflightEnv {
  return {
    platform: process.platform,
    nodeVersion: process.version,
    uid: typeof process.getuid === 'function' ? process.getuid() : null,
    home: os.homedir(),
    appDir,
    probes: { listProcesses, portHasListener },
    lock: () => lockState(path.join(STRESS_ROOT, '.lock')),
    allocatePorts: allocateAppPorts,
    checkWritable: async (dir) => {
      const where = await nearestExisting(dir)
      const probe = path.join(where, `.tuff-stress-write-test-${process.pid}`)
      await writeFile(probe, 'x')
      await unlink(probe)
    },
    freeBytes: async (dir) => {
      const stats = await statfs(await nearestExisting(dir))
      return Number(stats.bavail) * Number(stats.bsize)
    },
    hasTool: (name) =>
      new Promise((resolve) => {
        execFile('/usr/bin/which', [name], { timeout: 3_000 }, (error) => resolve(!error))
      }),
    fileExists: (file) =>
      access(file, constants.F_OK).then(
        () => true,
        () => false
      )
  }
}
