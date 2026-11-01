import type { ChildProcess, SpawnOptions } from 'node:child_process'
import { spawn as nodeSpawn } from 'node:child_process'
import { mkdir, open, readFile } from 'node:fs/promises'
import path from 'node:path'
import type { AppHandles } from '../eval-types'
import { fetchJson as cdpFetchJson } from '../monitor/cdp'
import type { ShutdownDeps, ShutdownOutcome, ShutdownTimings } from './app-shutdown'
import { findRunningMarkers, shutdownApp } from './app-shutdown'
import { createCdpSearchDriver } from './cdp-driver'
import type { SearchDriver } from './driver-types'
import { describeError, RunAbort, RunRefused } from './errors'
import type { SegmentPaths } from './layout'
import type { AppControl } from './main-ipc'
import { createAppControl } from './main-ipc'
import type { PageSessionOptions } from './page-bridge'
import { PageSession } from './page-bridge'
import type { UserInstanceProbes } from './process-info'
import {
  findElectronMain,
  isPidAlive,
  listProcesses,
  portHasListener,
  userInstanceProblems
} from './process-info'

export const CHROMIUM_FLAGS = [
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
  '--disable-background-timer-throttling'
] as const

export const EMBEDDING_OFF_HELPER = '/nonexistent/tuff-stress-embedding-off'

export interface LaunchConfig {
  /** `apps/core-app`: the working directory of the dev wrapper. */
  appDir: string
  segment: SegmentPaths
  corpusRoot: string
  ports: { cdp: number; inspect: number; vite: number }
  /** `hidden` starts the app silent (no window to the user); `show` leaves it visible and steals focus. */
  ui: 'hidden' | 'show'
  embedding: 'on' | 'off'
  /** `nice` level for the whole dev process tree (default 10, 0 = none); the boss's own instance keeps priority. */
  nice?: number
  startTimeoutMs?: number
  baseEnv?: NodeJS.ProcessEnv
}

export interface LaunchPlan {
  command: string
  args: string[]
  cwd: string
  env: Record<string, string>
}

const STRIPPED_PREFIXES = ['NODE_', 'TSX_', 'npm_', 'PNPM_', 'TUFF_', 'TALEX_', 'ELECTRON_']

/** The environment of the dev app: the toolchain variables of the runner's own shell are not passed on. */
export function buildLaunchEnv(config: LaunchConfig): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(config.baseEnv ?? process.env)) {
    if (
      value === undefined ||
      key === 'INIT_CWD' ||
      STRIPPED_PREFIXES.some((prefix) => key.startsWith(prefix))
    )
      continue
    env[key] = value
  }
  if (env.PATH) {
    env.PATH = env.PATH.split(path.delimiter)
      .filter((entry) => entry && path.isAbsolute(entry) && !entry.includes('node_modules/.bin'))
      .join(path.delimiter)
  }
  // The dev wrapper rejects TUFF_DEV_NICE=0, so "no nice" means the variable is absent.
  const nice = config.nice ?? 10
  return {
    ...env,
    FORCE_COLOR: '0',
    PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN: 'false',
    REMOTE_DEBUGGING_PORT: String(config.ports.cdp),
    V8_INSPECTOR_PORT: String(config.ports.inspect),
    TUFF_STARTUP_BENCHMARK_USER_DATA_DIR: config.segment.profileDir,
    TUFF_DEV_SERVER_HOST: '127.0.0.1',
    TUFF_DEV_SERVER_PORT: String(config.ports.vite),
    TUFF_DISABLE_GLOBAL_SHORTCUTS: '1',
    TUFF_DISABLE_NATIVE_AUDIO: '1',
    // Dev builds open detached DevTools by themselves; they steal focus and tax the renderer under measurement.
    TUFF_DISABLE_AUTO_DEVTOOLS: '1',
    TUFF_FILE_PROVIDER_BASE_WATCH_PATHS: config.corpusRoot,
    ...(nice > 0 ? { TUFF_DEV_NICE: String(nice) } : {}),
    TUFF_STARTUP_ANALYTICS_ENABLED: '0',
    ...(config.embedding === 'off' ? { TUFF_LOCAL_EMBEDDING_HELPER: EMBEDDING_OFF_HELPER } : {})
  }
}

export function buildLaunch(config: LaunchConfig, nodePath: string = process.execPath): LaunchPlan {
  if ([config.ports.cdp, config.ports.inspect, config.ports.vite].includes(5173)) {
    throw new RunRefused(
      "port 5173 belongs to the boss's dev server and is never used by a stress run"
    )
  }
  return {
    command: nodePath,
    args: [
      path.join(config.appDir, 'scripts', 'dev-electron-wrapper.mjs'),
      '--',
      ...(config.ui === 'hidden' ? ['--silent'] : []),
      ...CHROMIUM_FLAGS
    ],
    cwd: config.appDir,
    env: buildLaunchEnv(config)
  }
}

export async function assertNoUserInstance(
  probes: UserInstanceProbes = { listProcesses, portHasListener }
): Promise<void> {
  const problems = await userInstanceProblems(probes)
  if (problems.length > 0) {
    throw new RunRefused(
      `another Tuff instance is running, so no stress app is started: ${problems.join('; ')}`,
      problems
    )
  }
}

export interface RunningApp {
  handles: AppHandles
  wrapperPid: number
  mainCommand: string
  segment: SegmentPaths
  session: PageSession
  control: AppControl
  driver: SearchDriver
  /** Exit status of the dev wrapper once it ended; null while it runs. */
  wrapperExit: () => { code: number | null; signal: string | null } | null
  isMainAlive: () => boolean
  shutdown: () => Promise<ShutdownOutcome>
}

export interface AppLaunchDeps {
  spawn: (command: string, args: string[], options: SpawnOptions) => ChildProcess
  probes: UserInstanceProbes
  fetchJson: (url: string, timeoutMs?: number) => Promise<unknown>
  openSession: (options: PageSessionOptions) => Promise<PageSession>
  shutdown: ShutdownDeps
  timings?: ShutdownTimings
  now: () => number
  sleep: (ms: number) => Promise<void>
  log: (line: string) => void
}

export function defaultLaunchDeps(log: (line: string) => void = () => undefined): AppLaunchDeps {
  return {
    spawn: nodeSpawn,
    probes: { listProcesses, portHasListener },
    fetchJson: cdpFetchJson,
    openSession: (options) => PageSession.open(options),
    shutdown: {
      listProcesses,
      isPidAlive,
      signal: (pid, signal) => process.kill(pid, signal),
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      now: Date.now,
      findMarkers: findRunningMarkers,
      log
    },
    now: Date.now,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    log
  }
}

// eslint-disable-next-line no-control-regex
const ANSI_COLOR = /\u001B\[[0-9;]*m/g

async function readTail(file: string, lines = 25): Promise<string> {
  try {
    const text = await readFile(file, 'utf8')
    return text.replace(ANSI_COLOR, '').split('\n').filter(Boolean).slice(-lines).join('\n')
  } catch {
    return '(no app output)'
  }
}

/**
 * Starts the dev app on its own profile and brings it to the point where searches can be sent:
 * debugging endpoints up, a page with an ipcRenderer found, onboarding marked done.
 */
export async function launchApp(
  config: LaunchConfig,
  deps: AppLaunchDeps = defaultLaunchDeps()
): Promise<RunningApp> {
  await assertNoUserInstance(deps.probes)
  const plan = buildLaunch(config)
  const { segment } = config
  await mkdir(segment.profileDir, { recursive: true })
  await mkdir(segment.evidenceDir, { recursive: true })
  const logFile = await open(segment.appLogFile, 'a')
  const exit: {
    value: { code: number | null; signal: string | null } | null
    error: string | null
  } = { value: null, error: null }
  let child: ChildProcess
  try {
    child = deps.spawn(plan.command, plan.args, {
      cwd: plan.cwd,
      env: plan.env,
      detached: true,
      stdio: ['ignore', logFile.fd, logFile.fd]
    })
    child.once('error', (error) => {
      exit.error = describeError(error)
      deps.log(`dev wrapper error: ${exit.error}`)
    })
    child.once('exit', (code, signal) => {
      exit.value = { code, signal }
    })
  } finally {
    await logFile.close()
  }
  const wrapperPid = child.pid
  if (wrapperPid === undefined) {
    await new Promise((resolve) => setImmediate(resolve))
    throw new RunAbort('launch-failed', `the dev wrapper did not start: ${exit.error ?? 'no pid'}`)
  }
  deps.log(`started dev wrapper pid ${wrapperPid}; app log ${segment.appLogFile}`)

  const state: { main: { pid: number; command: string } | null; session: PageSession | null } = {
    main: null,
    session: null
  }
  const stopEverything = async (): Promise<ShutdownOutcome> => {
    const main = state.main
    return shutdownApp(
      {
        wrapperPid,
        mainPid: main?.pid ?? null,
        mainCommand: main?.command ?? '',
        profileDir: segment.profileDir,
        requestQuit: async () => {
          if (state.session) await createAppControl(state.session).requestQuit()
        }
      },
      deps.shutdown,
      deps.timings
    )
  }

  const deadline = deps.now() + (config.startTimeoutMs ?? 240_000)
  const remaining = (): number => Math.max(1_000, deadline - deps.now())
  const waitUntil = async <T>(
    what: string,
    probe: () => Promise<T | null | undefined>
  ): Promise<T> => {
    for (;;) {
      if (exit.value)
        throw new RunAbort(
          'launch-failed',
          `the dev wrapper exited (${JSON.stringify(exit.value)}) while waiting for ${what}`
        )
      const found = await probe().catch(() => null)
      if (found !== null && found !== undefined) return found
      if (deps.now() >= deadline)
        throw new RunAbort('launch-failed', `timed out waiting for ${what}`)
      await deps.sleep(500)
    }
  }

  try {
    const main = await waitUntil('the Electron main process', async () => {
      const found = findElectronMain(wrapperPid, await deps.shutdown.listProcesses())
      return found ? { pid: found.pid, command: found.command } : null
    })
    state.main = main
    await waitUntil('the remote debugging endpoint', async () =>
      deps.fetchJson(`http://127.0.0.1:${config.ports.cdp}/json/version`, 2_000)
    )
    await waitUntil('the main process inspector', async () =>
      deps.fetchJson(`http://127.0.0.1:${config.ports.inspect}/json/list`, 2_000)
    )
    const session = await deps.openSession({
      cdpPort: config.ports.cdp,
      now: deps.now,
      readyTimeoutMs: remaining(),
      log: deps.log
    })
    state.session = session
    deps.log(`page session on ${session.target}`)
    const control = createAppControl(session)
    const onboarding = await control.completeOnboarding()
    if (!onboarding.sentryDisabled)
      deps.log('could not switch crash reporting off in the stress profile')
    if (config.ui === 'show')
      await control
        .showCoreBox()
        .catch((error: unknown) => deps.log(`could not show CoreBox: ${describeError(error)}`))

    return {
      handles: {
        mainPid: main.pid,
        cdpPort: config.ports.cdp,
        inspectPort: config.ports.inspect,
        profileDir: segment.profileDir,
        logsDir: segment.logsDir,
        evidenceDir: segment.evidenceDir
      },
      wrapperPid,
      mainCommand: main.command,
      segment,
      session,
      control,
      driver: createCdpSearchDriver(session),
      wrapperExit: () => exit.value,
      isMainAlive: () => deps.shutdown.isPidAlive(main.pid),
      shutdown: async () => {
        const outcome = await stopEverything()
        state.session?.close()
        return outcome
      }
    }
  } catch (error) {
    const tail = await readTail(segment.appLogFile)
    const outcome = await stopEverything().catch(() => null)
    state.session?.close()
    const base = error instanceof RunAbort ? error.message : describeError(error)
    throw new RunAbort(
      'launch-failed',
      `${base}\n--- last app output ---\n${tail}${outcome && !outcome.clean ? `\n--- cleanup: ${outcome.detail}` : ''}`
    )
  }
}
