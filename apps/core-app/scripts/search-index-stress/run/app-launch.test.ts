import { EventEmitter } from 'node:events'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { writeSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { ChildProcess, SpawnOptions } from 'node:child_process'
import { spawn as realSpawn } from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FakeWsServer } from '../monitor/testing/fake-cdp-server'
import {
  assertNoUserInstance,
  buildLaunch,
  buildLaunchEnv,
  defaultLaunchDeps,
  EMBEDDING_OFF_HELPER,
  launchApp,
  type AppLaunchDeps,
  type LaunchConfig
} from './app-launch'
import { RunAbort, RunRefused } from './errors'
import { buildLayout, segmentPaths } from './layout'
import { FakeApp, toWireItem } from './test-support/fake-app'
import { Machine } from './test-support/fake-machine'

const ELECTRON =
  '/repo/node_modules/.pnpm/electron@41/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'
let dir = ''

function configFor(overrides: Partial<LaunchConfig> = {}): LaunchConfig {
  const layout = buildLayout({
    runId: 'run-test-1',
    runDir: path.join(dir, 'run'),
    corpusRoot: '/Users/Shared/tuff-stress/run-test-1/corpus'
  })
  return {
    appDir: '/repo/apps/core-app',
    segment: segmentPaths(layout, 1),
    corpusRoot: layout.corpusRoot,
    ports: { cdp: 9611, inspect: 9612, vite: 9613 },
    ui: 'hidden',
    embedding: 'off',
    baseEnv: {
      PATH: '/usr/bin:/repo/node_modules/.bin:relative/bin:/opt/mise/shims',
      HOME: '/Users/x',
      LANG: 'en_US.UTF-8'
    },
    ...overrides
  }
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'stress-launch-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('buildLaunch', () => {
  it('starts the dev wrapper with the app flags after the passthrough separator', () => {
    const plan = buildLaunch(configFor(), '/usr/local/bin/node')
    expect(plan.command).toBe('/usr/local/bin/node')
    expect(plan.cwd).toBe('/repo/apps/core-app')
    expect(plan.args).toEqual([
      '/repo/apps/core-app/scripts/dev-electron-wrapper.mjs',
      '--',
      '--silent',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--disable-background-timer-throttling'
    ])
  })

  it('leaves the window visible when asked to show it', () => {
    expect(buildLaunch(configFor({ ui: 'show' })).args).not.toContain('--silent')
  })

  it('points the app at its own profile, ports and corpus, and quiets everything that would disturb the measurement', () => {
    const env = buildLaunchEnv(configFor())
    expect(env).toMatchObject({
      REMOTE_DEBUGGING_PORT: '9611',
      V8_INSPECTOR_PORT: '9612',
      TUFF_STARTUP_BENCHMARK_USER_DATA_DIR: path.join(dir, 'run', 'profile'),
      TUFF_DEV_SERVER_HOST: '127.0.0.1',
      TUFF_DEV_SERVER_PORT: '9613',
      TUFF_DISABLE_GLOBAL_SHORTCUTS: '1',
      TUFF_DISABLE_NATIVE_AUDIO: '1',
      TUFF_DISABLE_AUTO_DEVTOOLS: '1',
      TUFF_FILE_PROVIDER_BASE_WATCH_PATHS: '/Users/Shared/tuff-stress/run-test-1/corpus',
      TUFF_DEV_NICE: '10',
      TUFF_STARTUP_ANALYTICS_ENABLED: '0',
      TUFF_LOCAL_EMBEDDING_HELPER: EMBEDDING_OFF_HELPER,
      PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN: 'false',
      FORCE_COLOR: '0',
      HOME: '/Users/x'
    })
  })

  it('runs the app niced by default, at the level asked for, and not at all for 0', () => {
    expect(buildLaunchEnv(configFor()).TUFF_DEV_NICE).toBe('10')
    expect(buildLaunchEnv(configFor({ nice: 4 })).TUFF_DEV_NICE).toBe('4')
    expect(
      buildLaunchEnv(configFor({ nice: 0, baseEnv: { TUFF_DEV_NICE: '15' } }))
    ).not.toHaveProperty('TUFF_DEV_NICE')
  })

  it('does not hand on toolchain variables, stray app switches or the port-upgrade list of the runner shell', () => {
    const env = buildLaunchEnv(
      configFor({
        embedding: 'on',
        baseEnv: {
          NODE_OPTIONS: '--max-old-space-size=1',
          ELECTRON_RUN_AS_NODE: '1',
          npm_execpath: '/x/pnpm.cjs',
          PNPM_HOME: '/x',
          TALEX_TRANSPORT_PORT_CHANNELS: 'all',
          TUFF_DEV_SERVER_PORT: '5173',
          TUFF_LOCAL_EMBEDDING_HELPER: '/real/helper',
          INIT_CWD: '/repo',
          PATH: '/usr/bin:/repo/node_modules/.bin:relative/bin:/opt/mise/shims'
        }
      })
    )
    for (const key of [
      'NODE_OPTIONS',
      'ELECTRON_RUN_AS_NODE',
      'npm_execpath',
      'PNPM_HOME',
      'TALEX_TRANSPORT_PORT_CHANNELS',
      'INIT_CWD'
    ])
      expect(env).not.toHaveProperty(key)
    expect(env.TUFF_DEV_SERVER_PORT).toBe('9613')
    expect(env).not.toHaveProperty('TUFF_LOCAL_EMBEDDING_HELPER')
    expect(env.PATH).toBe('/usr/bin:/opt/mise/shims')
  })

  it('refuses the dev server port of the boss', () => {
    expect(() =>
      buildLaunch(configFor({ ports: { cdp: 9611, inspect: 9612, vite: 5173 } }))
    ).toThrow(RunRefused)
  })
})

describe('assertNoUserInstance', () => {
  const quiet = { listProcesses: async () => [], portHasListener: async () => false }

  it('passes on a quiet machine', async () => {
    await expect(assertNoUserInstance(quiet)).resolves.toBeUndefined()
  })

  it('refuses with every reason while the boss runs the dev server', async () => {
    const failure = await assertNoUserInstance({
      portHasListener: async (port) => port === 5173,
      listProcesses: async () => [
        {
          pid: 92617,
          ppid: 1,
          command:
            '/Users/x/Workspace/Projects/talex-touch/node_modules/.pnpm/electron@41/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron .'
        }
      ]
    }).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(RunRefused)
    expect((failure as RunRefused).reasons).toHaveLength(2)
    expect((failure as RunRefused).message).toContain('92617')
  })
})

interface Rig {
  deps: AppLaunchDeps
  machine: Machine
  spawned: Array<{ command: string; args: string[]; options: SpawnOptions }>
  child: EventEmitter & { pid: number }
  app: FakeApp
  inspector: FakeWsServer
}

async function rig(
  options: { onSpawn?: (rig: Rig, spawnOptions: SpawnOptions) => void } = {}
): Promise<Rig> {
  const app = await FakeApp.start()
  app.server.json.set('/json/version', { Browser: 'fake/1' })
  const inspector = await FakeWsServer.start()
  inspector.json.set('/json/list', [])
  const machine = new Machine()
  const child = Object.assign(new EventEmitter(), { pid: 100 })
  const spawned: Rig['spawned'] = []
  const base = defaultLaunchDeps()
  const result: Rig = {
    app,
    inspector,
    machine,
    child,
    spawned,
    deps: {
      ...base,
      spawn: (command, args, spawnOptions) => {
        spawned.push({ command, args, options: spawnOptions })
        machine.add(100, 1, `${command} ${args.join(' ')}`)
        machine.add(101, 100, 'node electron-vite dev')
        machine.add(102, 101, `${ELECTRON} .`)
        options.onSpawn?.(result, spawnOptions)
        return child as unknown as ChildProcess
      },
      probes: { listProcesses: async () => [], portHasListener: async () => false },
      shutdown: machine.deps(),
      now: () => machine.now,
      sleep: async (ms) => {
        machine.now += ms
        await new Promise((resolve) => setImmediate(resolve))
      },
      timings: { ipcWaitMs: 2_000, termWaitMs: 2_000, wrapperWaitMs: 1_000 },
      log: () => undefined
    }
  }
  return result
}

describe('launchApp', () => {
  let current: Rig | null = null
  afterEach(async () => {
    await current?.app.stop()
    await current?.inspector.stop()
    current = null
  })

  const appBehaviour = (machine: Machine) => {
    const stored: Record<string, unknown> = { 'app-setting.ini': { beginner: { init: false } } }
    return (name: string, data: unknown): unknown => {
      if (name === 'app:window:close')
        machine.after(500, () => [102, 101, 100].forEach((pid) => machine.exit(pid)))
      const { key, value } = (data ?? {}) as { key?: string; value?: unknown }
      if (name === 'storage:app:get') return stored[key ?? ''] ?? {}
      if (name === 'storage:app:save') {
        stored[key ?? ''] = value
        return { success: true, version: 1 }
      }
      return {}
    }
  }

  it('launches, waits for the endpoints, completes onboarding, searches and quits cleanly', async () => {
    current = await rig()
    current.app.page.onCall = appBehaviour(current.machine)
    current.app.page.onStreamStart = (control) => {
      control.chunk({
        type: 'snapshot',
        result: {
          items: [toWireItem({ id: '/a/b.png', kind: 'file', title: 'b.png', path: '/a/b.png' })]
        }
      })
      control.chunk({ type: 'complete' })
      control.end()
    }
    const config = configFor({
      ports: { cdp: current.app.cdpPort, inspect: current.inspector.port, vite: 9613 }
    })

    const app = await launchApp(config, current.deps)

    expect(current.spawned).toHaveLength(1)
    const spawnOptions = current.spawned[0].options
    expect(spawnOptions.detached).toBe(true)
    expect(spawnOptions.cwd).toBe('/repo/apps/core-app')
    expect(app.handles).toEqual({
      mainPid: 102,
      cdpPort: current.app.cdpPort,
      inspectPort: current.inspector.port,
      profileDir: config.segment.profileDir,
      logsDir: config.segment.logsDir,
      evidenceDir: config.segment.evidenceDir
    })
    const saved = current.app.page.sent
      .filter((message) => message.name === 'storage:app:save')
      .map((message) => (message.data as { key: string }).key)
    expect(saved).toContain('app-setting.ini')

    const answer = await app.driver.search('b', { timeoutMs: 2_000 })
    expect(answer.rows.map((row) => row.name)).toEqual(['b.png'])

    const outcome = await app.shutdown()
    expect(outcome).toMatchObject({ clean: true, how: 'ipc' })
    expect(current.machine.signals).toEqual([])
  })

  it('does not even spawn while another instance is running', async () => {
    current = await rig()
    current.deps.probes = {
      listProcesses: async () => [],
      portHasListener: async (port) => port === 5173
    }
    await expect(launchApp(configFor(), current.deps)).rejects.toBeInstanceOf(RunRefused)
    expect(current.spawned).toHaveLength(0)
  })

  it('fails with the tail of the app output when the wrapper dies before the app is up', async () => {
    current = await rig({
      onSpawn: (rigged, spawnOptions) => {
        writeSync(
          (spawnOptions.stdio as [string, number, number])[1],
          'error: cannot find module electron-vite\n'
        )
        setImmediate(() => {
          rigged.machine.exit(100)
          rigged.machine.exit(101)
          rigged.machine.exit(102)
          rigged.child.emit('exit', 1, null)
        })
      }
    })
    current.deps.shutdown = { ...current.deps.shutdown, listProcesses: async () => [] }
    const failure = await launchApp(configFor(), current.deps).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(RunAbort)
    expect((failure as RunAbort).reason).toBe('launch-failed')
    expect((failure as RunAbort).message).toContain('exited')
    expect((failure as RunAbort).message).toContain('cannot find module electron-vite')
  })

  it('stops what it started when the debugging endpoint never comes up', async () => {
    current = await rig()
    current.machine.onSignal = (pid) => {
      if (pid === 102)
        current?.machine.after(300, () => [102, 101, 100].forEach((p) => current?.machine.exit(p)))
    }
    const failure = await launchApp(
      configFor({ ports: { cdp: 9, inspect: 9, vite: 9613 }, startTimeoutMs: 5_000 }),
      current.deps
    ).catch((error: unknown) => error)

    expect((failure as RunAbort).reason).toBe('launch-failed')
    expect((failure as RunAbort).message).toContain(
      'timed out waiting for the remote debugging endpoint'
    )
    expect(current.machine.signals).toEqual([[102, 'SIGTERM']])
    expect(current.machine.procs.get(102)?.alive).toBe(false)
  })

  it('sends the output of the wrapper to the log file of the segment', async () => {
    const config = configFor({ appDir: dir })
    const deps: AppLaunchDeps = {
      ...defaultLaunchDeps(),
      spawn: (_command, _args, options) =>
        realSpawn(
          process.execPath,
          ['-e', "console.log('hello-out'); console.error('hello-err')"],
          options
        ),
      probes: { listProcesses: async () => [], portHasListener: async () => false },
      shutdown: { ...defaultLaunchDeps().shutdown, listProcesses: async () => [] },
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, Math.min(ms, 20)))
    }

    const failure = await launchApp(config, deps).catch((error: unknown) => error)

    expect((failure as RunAbort).message).toContain('hello-out')
    expect((failure as RunAbort).message).toContain('hello-err')
    const log = await readFile(config.segment.appLogFile, 'utf8')
    expect(log).toContain('hello-out')
    expect(log).toContain('hello-err')
  })
})
