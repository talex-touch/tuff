import { describe, expect, it } from 'vitest'
import {
  classifyInstances,
  descendantsOf,
  findElectronMain,
  isElectronHelper,
  isElectronMain,
  isPidAlive,
  parsePsOutput,
  readUserDataDir,
  userInstanceProblems,
  type ProcessInfo
} from './process-info'

const REPO = '/Users/someone/Workspace/Projects/talex-touch'
const ELECTRON = `${REPO}/node_modules/.pnpm/electron@41.10.1/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron`
const HELPER = `${REPO}/node_modules/.pnpm/electron@41.10.1/node_modules/electron/dist/Electron.app/Contents/Frameworks/Electron Helper (Renderer).app/Contents/MacOS/Electron Helper (Renderer)`
const BOSS_PROFILE = '/Users/someone/Library/Application Support/@talex-touch/core-app-dev'
const STRESS_PROFILE = '/private/tmp/tuff-stress/20261030T180000Z/profile'

const proc = (pid: number, ppid: number, command: string): ProcessInfo => ({ pid, ppid, command })

describe('parsePsOutput', () => {
  it('reads pid, parent pid and the whole command line, spaces included', () => {
    const parsed = parsePsOutput(
      `  101     1 /Applications/Some App.app/Contents/MacOS/Some App --flag=1\n 7 101 node x.mjs \n\nnot a line\n`
    )
    expect(parsed).toEqual([
      { pid: 101, ppid: 1, command: '/Applications/Some App.app/Contents/MacOS/Some App --flag=1' },
      { pid: 7, ppid: 101, command: 'node x.mjs' }
    ])
  })
})

describe('process tree', () => {
  const procs = [
    proc(1, 0, 'launchd'),
    proc(10, 1, 'node wrapper'),
    proc(11, 10, 'pnpm'),
    proc(12, 11, `${ELECTRON} .`),
    proc(13, 12, HELPER),
    proc(99, 1, 'other')
  ]

  it('collects every descendant and none of the rest', () => {
    expect(
      descendantsOf(10, procs)
        .map((p) => p.pid)
        .sort()
    ).toEqual([11, 12, 13])
  })

  it('terminates on a cycle', () => {
    expect(descendantsOf(5, [proc(5, 6, 'a'), proc(6, 5, 'b')]).map((p) => p.pid)).toEqual([6])
  })

  it('finds the browser process and not its helpers', () => {
    expect(findElectronMain(10, procs)?.pid).toBe(12)
    expect(findElectronMain(99, procs)).toBeNull()
  })
})

describe('electron process shapes', () => {
  it('tells the main process from helpers and typed children', () => {
    expect(isElectronMain(`${ELECTRON} .`)).toBe(true)
    expect(isElectronMain(`${ELECTRON} . --user-data-dir=${BOSS_PROFILE}`)).toBe(true)
    expect(isElectronMain(HELPER)).toBe(false)
    expect(isElectronHelper(HELPER)).toBe(true)
    expect(
      isElectronMain(`${ELECTRON} --type=utility --utility-sub-type=network.mojom.NetworkService`)
    ).toBe(false)
    expect(isElectronMain('/Applications/Slack.app/Contents/MacOS/Slack')).toBe(false)
  })

  it('reads a user data directory that contains spaces up to the next switch', () => {
    expect(readUserDataDir(`${ELECTRON} . --user-data-dir=${BOSS_PROFILE} --inspect=9229`)).toBe(
      BOSS_PROFILE
    )
    expect(readUserDataDir(`${ELECTRON} .`)).toBeNull()
  })
})

describe('classifyInstances', () => {
  it('names the boss instance, the release app and a stress leftover for what they are', () => {
    const found = classifyInstances([
      proc(1, 0, `${ELECTRON} . --user-data-dir=${BOSS_PROFILE}`),
      proc(2, 1, `${HELPER} --type=renderer --user-data-dir=${BOSS_PROFILE}`),
      proc(3, 0, '/Applications/tuff.app/Contents/MacOS/tuff'),
      proc(4, 0, `${ELECTRON} . --user-data-dir=${STRESS_PROFILE}`),
      proc(5, 0, '/Applications/Slack.app/Contents/MacOS/Slack')
    ])
    expect(found.map((f) => [f.pid, f.kind])).toEqual([
      [1, 'dev'],
      [2, 'dev'],
      [3, 'release'],
      [4, 'stress']
    ])
  })

  it('reads the profile of a browser process from its helpers, which is where Chromium prints it', () => {
    const worktreeElectron =
      '/private/tmp/some-worktree/node_modules/.pnpm/electron@41/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'
    const found = classifyInstances([
      proc(10, 1, `${worktreeElectron} . --inspect=9300`),
      proc(11, 10, `${HELPER} --type=gpu-process --user-data-dir=${STRESS_PROFILE}`),
      proc(20, 1, `${worktreeElectron} .`),
      proc(21, 20, `${HELPER} --type=renderer --user-data-dir=${BOSS_PROFILE}`)
    ])
    expect(found.map((f) => [f.pid, f.kind])).toEqual([
      [10, 'stress'],
      [11, 'stress'],
      [20, 'dev'],
      [21, 'dev']
    ])
    expect(found[0].userDataDir).toBe(STRESS_PROFILE)
  })

  it('ignores Electron apps that are not this repository', () => {
    expect(
      classifyInstances([
        proc(
          1,
          0,
          '/Applications/Other.app/Contents/Frameworks/Electron.app/Contents/MacOS/Electron .'
        )
      ])
    ).toEqual([])
  })

  it('counts a /tmp spelling of the stress root as the stress root', () => {
    const found = classifyInstances([
      proc(1, 0, `${ELECTRON} . --user-data-dir=/tmp/tuff-stress/run/profile`)
    ])
    expect(found[0].kind).toBe('stress')
  })
})

describe('userInstanceProblems', () => {
  const free = { listProcesses: async () => [], portHasListener: async () => false }

  it('is empty on a quiet machine', async () => {
    expect(await userInstanceProblems(free)).toEqual([])
  })

  it('refuses while something listens on the dev server port', async () => {
    const problems = await userInstanceProblems({
      ...free,
      portHasListener: async (port) => port === 5173
    })
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('5173')
  })

  it('refuses while the boss dev instance, the release app or a stress leftover runs, with their pids', async () => {
    const problems = await userInstanceProblems({
      portHasListener: async () => false,
      listProcesses: async () => [
        proc(4242, 1, `${ELECTRON} . --user-data-dir=${BOSS_PROFILE}`),
        proc(777, 1, '/Applications/tuff.app/Contents/MacOS/tuff'),
        proc(555, 1, `${ELECTRON} . --user-data-dir=${STRESS_PROFILE}`)
      ]
    })
    expect(problems).toHaveLength(3)
    expect(problems.join('\n')).toContain('4242')
    expect(problems.join('\n')).toContain('777')
    expect(problems.join('\n')).toContain('555')
    expect(problems.join('\n')).toContain('core-app-dev')
  })
})

describe('isPidAlive', () => {
  it('knows this process and not an unused pid', () => {
    expect(isPidAlive(process.pid)).toBe(true)
    expect(isPidAlive(2_147_483_000)).toBe(false)
  })
})
