import { execFile } from 'node:child_process'
import net from 'node:net'
import path from 'node:path'
import { STRESS_ROOT } from './layout'

export interface ProcessInfo {
  pid: number
  ppid: number
  command: string
}

export type ListProcesses = () => Promise<ProcessInfo[]>
export type PortHasListener = (port: number) => Promise<boolean>

export function parsePsOutput(text: string): ProcessInfo[] {
  const out: ProcessInfo[] = []
  for (const line of text.split('\n')) {
    const match = /^\s*(\d+)\s+(\d+)\s+(.*\S)\s*$/.exec(line)
    if (match) out.push({ pid: Number(match[1]), ppid: Number(match[2]), command: match[3] })
  }
  return out
}

export const listProcesses: ListProcesses = () =>
  new Promise((resolve, reject) => {
    execFile(
      'ps',
      ['-axww', '-o', 'pid=,ppid=,command='],
      { maxBuffer: 64 * 1024 * 1024 },
      (error, stdout) => (error ? reject(error) : resolve(parsePsOutput(stdout)))
    )
  })

export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

function connects(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port })
    const done = (value: boolean): void => {
      socket.destroy()
      resolve(value)
    }
    socket.setTimeout(1000, () => done(false))
    socket.once('connect', () => done(true))
    socket.once('error', () => done(false))
  })
}

/** `lsof` sees listeners on any address family; connecting is the fallback when it is unusable. */
export const portHasListener: PortHasListener = (port) =>
  new Promise((resolve) => {
    execFile(
      'lsof',
      ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'],
      { timeout: 5000 },
      (error, stdout) => {
        if (!error) return resolve(stdout.trim().length > 0)
        const code = (error as { code?: number | string }).code
        if (code === 1 && stdout.trim().length === 0) return resolve(false)
        void Promise.all([connects('127.0.0.1', port), connects('::1', port)]).then(([a, b]) =>
          resolve(a || b)
        )
      }
    )
  })

export function descendantsOf(rootPid: number, procs: readonly ProcessInfo[]): ProcessInfo[] {
  const byParent = new Map<number, ProcessInfo[]>()
  for (const proc of procs) {
    const siblings = byParent.get(proc.ppid)
    if (siblings) siblings.push(proc)
    else byParent.set(proc.ppid, [proc])
  }
  const out: ProcessInfo[] = []
  const seen = new Set<number>([rootPid])
  const queue = [rootPid]
  while (queue.length > 0) {
    const pid = queue.shift() as number
    for (const child of byParent.get(pid) ?? []) {
      if (seen.has(child.pid)) continue
      seen.add(child.pid)
      out.push(child)
      queue.push(child.pid)
    }
  }
  return out
}

const ELECTRON_EXE = /\/Contents\/MacOS\/(?:Electron|Tuff Dev)(?= |$)/
const ELECTRON_HELPER_EXE = /\/Contents\/MacOS\/(?:Electron|Tuff Dev) Helper/
const RELEASE_EXE = /\/Contents\/MacOS\/tuff(?= |$)/
const REPO_MARKER = /talex-touch|core-app/i

export function isElectronHelper(command: string): boolean {
  return ELECTRON_HELPER_EXE.test(command)
}

/** The browser process: Electron's executable without a `--type=` switch and not one of its Helper apps. */
export function isElectronMain(command: string): boolean {
  return ELECTRON_EXE.test(command) && !isElectronHelper(command) && !/ --type=/.test(command)
}

/** Lowest-depth Electron main below `rootPid`; the wrapper chain only ever has one. */
export function findElectronMain(
  rootPid: number,
  procs: readonly ProcessInfo[]
): ProcessInfo | null {
  return descendantsOf(rootPid, procs).find((proc) => isElectronMain(proc.command)) ?? null
}

export function readUserDataDir(command: string): string | null {
  const match = /--user-data-dir=(.+?)(?= --[A-Za-z]|$)/.exec(command)
  return match ? match[1].trim() : null
}

function underRoot(dir: string, root: string): boolean {
  const normalize = (value: string): string =>
    path.resolve(value.replace(/^\/tmp(?=\/|$)/, '/private/tmp'))
  const candidate = normalize(dir)
  const base = normalize(root)
  return candidate === base || candidate.startsWith(`${base}/`)
}

export interface InstanceFinding {
  pid: number
  kind: 'release' | 'dev' | 'stress'
  userDataDir: string | null
  command: string
}

/**
 * Every process that belongs to a Tuff app which is not this runner's to start: release, dev or a
 * stress leftover. The browser process carries no `--user-data-dir` (the app sets its profile in
 * code), so its profile is read from its helpers, which Chromium launches with it.
 */
export function classifyInstances(
  procs: readonly ProcessInfo[],
  stressRoot: string = STRESS_ROOT
): InstanceFinding[] {
  const children = new Map<number, ProcessInfo[]>()
  for (const proc of procs) {
    const siblings = children.get(proc.ppid)
    if (siblings) siblings.push(proc)
    else children.set(proc.ppid, [proc])
  }
  const profileOf = (proc: ProcessInfo): string | null => {
    const own = readUserDataDir(proc.command)
    if (own) return own
    for (const child of children.get(proc.pid) ?? []) {
      const inherited = readUserDataDir(child.command)
      if (inherited) return inherited
    }
    return null
  }

  const findings: InstanceFinding[] = []
  for (const proc of procs) {
    if (RELEASE_EXE.test(proc.command)) {
      findings.push({
        pid: proc.pid,
        kind: 'release',
        userDataDir: readUserDataDir(proc.command),
        command: proc.command
      })
      continue
    }
    if (!ELECTRON_EXE.test(proc.command) && !isElectronHelper(proc.command)) continue
    const userDataDir = profileOf(proc)
    const stress = userDataDir !== null && underRoot(userDataDir, stressRoot)
    if (
      !stress &&
      !REPO_MARKER.test(proc.command) &&
      !(userDataDir !== null && REPO_MARKER.test(userDataDir))
    )
      continue
    findings.push({
      pid: proc.pid,
      kind: stress ? 'stress' : 'dev',
      userDataDir,
      command: proc.command
    })
  }
  return findings
}

export interface UserInstanceProbes {
  listProcesses: ListProcesses
  portHasListener: PortHasListener
}

export const DEV_SERVER_PORT = 5173

function pidList(findings: readonly InstanceFinding[]): string {
  const shown = findings.slice(0, 4).map((finding) => finding.pid)
  return `${shown.join(', ')}${findings.length > shown.length ? `, +${findings.length - shown.length} more` : ''}`
}

/** Human-readable reasons a run must not start; empty when the machine is free of other Tuff instances. */
export async function userInstanceProblems(
  probes: UserInstanceProbes = { listProcesses, portHasListener },
  stressRoot: string = STRESS_ROOT
): Promise<string[]> {
  const [listening, procs] = await Promise.all([
    probes.portHasListener(DEV_SERVER_PORT),
    probes.listProcesses()
  ])
  const problems: string[] = []
  if (listening) {
    problems.push(
      `port ${DEV_SERVER_PORT} has a listener: the dev server of a running \`pnpm core:dev\` (the boss's own instance)`
    )
  }
  const findings = classifyInstances(procs, stressRoot)
  const release = findings.filter((finding) => finding.kind === 'release')
  const dev = findings.filter((finding) => finding.kind === 'dev')
  const stress = findings.filter((finding) => finding.kind === 'stress')
  if (release.length > 0) {
    problems.push(
      `the official Tuff app is running (pid ${pidList(release)}): a dev start would stop at its guard dialog`
    )
  }
  if (dev.length > 0) {
    const profile = dev.find((finding) => finding.userDataDir)?.userDataDir
    problems.push(
      `an Electron of this repo is running outside ${stressRoot} (pid ${pidList(dev)}${profile ? `, profile ${profile}` : ''}): the user's own dev instance`
    )
  }
  if (stress.length > 0) {
    problems.push(
      `a previous stress instance is still running (pid ${pidList(stress)}): quit it first`
    )
  }
  return problems
}
