import { mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { CliEnv, CliHooks } from '../cli'
import { main } from '../cli'
import { USAGE } from './args'
import { FakeWorld, runnerDeps } from './test-support/fake-run'

let root = ''
const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
const runArgs = (dir = 'run-1', ...extra: string[]): string[] => [
  'run',
  '--profile',
  'smoke',
  '--qps',
  '500',
  '--search-timeout',
  '1000',
  '--run-dir',
  path.join(root, dir),
  ...extra
]

function harness(world: FakeWorld = new FakeWorld()) {
  const out: string[] = []
  const err: string[] = []
  const state = {
    nice: [] as number[],
    hooks: null as CliHooks | null,
    registered: 0,
    removed: 0,
    fire: null as ((signal: string) => void) | null
  }
  const env: CliEnv = {
    io: { out: (line) => void out.push(line), err: (line) => void err.push(line) },
    createDeps: (hooks) => {
      state.hooks = hooks
      return runnerDeps({ root, world, signal: hooks.signal }).deps
    },
    setNice: (level) => void state.nice.push(level),
    onSignal: (handler) => {
      state.registered += 1
      state.fire = handler
      return () => {
        state.removed += 1
        state.fire = null
      }
    }
  }
  return { env, out, err, state, world }
}

beforeEach(async () => {
  root = await mkdtemp('/private/tmp/tuff-cli-test-')
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('main', () => {
  it('prints the usage and exits 2 without arguments, and exits 0 for --help anywhere', async () => {
    const bare = harness()
    expect(await main([], bare.env)).toBe(2)
    expect(bare.err).toEqual([USAGE])
    expect(bare.state.hooks).toBeNull()

    const help = harness()
    expect(await main(['run', '--help'], help.env)).toBe(0)
    expect(help.out).toEqual([USAGE])
    expect(help.state.hooks).toBeNull()
  })

  it('exits 2 with the reason for an unknown command or a bad option value', async () => {
    const unknown = harness()
    expect(await main(['frobnicate'], unknown.env)).toBe(2)
    expect(unknown.err[0]).toBe('usage error: unknown command "frobnicate"')

    const bad = harness()
    expect(await main(['run', '--qps', 'fast'], bad.env)).toBe(2)
    expect(bad.err[0]).toBe('usage error: --qps must be a number >= 0.1, got "fast"')
    expect(bad.state.nice).toEqual([])
  })

  it('runs doctor without touching the process priority or the signal handlers', async () => {
    const { env, out, state } = harness()
    expect(await main(['doctor'], env)).toBe(0)
    expect(out).toContain('A run is allowed.')
    expect(state.registered).toBe(0)
    expect(state.nice).toEqual([])
  })

  it("lowers the runner's priority to the --nice level, and not at all for --nice 0", async () => {
    const defaulted = harness()
    expect(await main(runArgs(), defaulted.env)).toBe(0)
    expect(defaulted.state.nice).toEqual([10])
    expect(defaulted.state.registered).toBe(1)
    expect(defaulted.state.removed).toBe(1)

    const five = harness()
    await main(runArgs('run-2', '--nice', '5'), five.env)
    expect(five.state.nice).toEqual([5])

    const off = harness()
    await main(runArgs('run-3', '--nice', '0'), off.env)
    expect(off.state.nice).toEqual([])
  })

  it('hands the typed command line and the log sinks to the dependencies', async () => {
    const { env, err, state } = harness()
    const argv = runArgs()
    await main(argv, env)
    expect(state.hooks?.argv).toEqual(argv)
    state.hooks?.log('a log line')
    state.hooks?.progress('a progress line')
    expect(err.slice(-2)).toEqual(['a log line', 'a progress line'])
  })

  it('turns the first SIGINT into a graceful stop and tells the second one that the app is never killed', async () => {
    const world = new FakeWorld()
    const fired = { done: false }
    const box = harness(world)
    world.beforeSearch = async () => {
      if (world.phase === 'steady' && !fired.done) {
        fired.done = true
        box.state.fire?.('SIGINT')
        box.state.fire?.('SIGINT')
      }
      await wait(2)
    }
    expect(await main(runArgs(), box.env)).toBe(1)
    expect(box.out[0]).toBe(
      'run test-run-1: ABORTED (interrupted: the run was stopped on request (SIGINT))'
    )
    expect(box.err).toContain(
      'SIGINT: finishing the scenarios in flight, then stopping the app cleanly'
    )
    expect(box.err).toContain(
      'already stopping; waiting for the app to shut down (it is never killed)'
    )
    expect(world.lifecycle.slice(-2)).toEqual(['monitor.stop', 'shutdown'])
    expect(box.state.removed).toBe(1)
  })

  it('exits 3 and prints the error when the dependencies cannot even be built', async () => {
    const { env, err } = harness()
    env.createDeps = () => {
      throw new Error('no such toolchain')
    }
    expect(await main(runArgs(), env)).toBe(3)
    expect(err[0]).toBe('internal error: no such toolchain')
  })
})
