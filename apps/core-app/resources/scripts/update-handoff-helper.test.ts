import {
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  stat,
  symlink,
  writeFile
} from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
interface HelperOptions {
  hostPlatform?: 'linux' | 'darwin' | 'win32'
  bundledScriptDirs?: string[]
}
const { launchCommand, recoverOnce, runHelper, validatePlan } =
  require('./update-handoff-helper.cjs') as {
    launchCommand: (command: HelperCommand) => Promise<void>
    recoverOnce: (
      root: string,
      plan: HelperPlan,
      reason: string,
      options?: HelperOptions
    ) => Promise<boolean>
    runHelper: (
      root: string,
      planPath: string,
      options?: HelperOptions
    ) => Promise<{ status: string }>
    validatePlan: (root: string, plan: HelperPlan, options?: HelperOptions) => HelperPlan
  }

const temporaryRoots: string[] = []

type HelperPlan = {
  schemaVersion: 1
  attemptId: string
  token: string
  parentPid: number
  platform: 'linux' | 'darwin' | 'win32'
  currentVersion: string
  targetVersion: string
  taskId: string
  packagePath: string
  packageSha256: string
  createdAt: number
  healthTimeoutMs: number
  ackPath: string
  markerPath: string
  cleanupPaths: string[]
  handoff: HelperCommand
  recovery: HelperCommand | null
  recoveryAvailable: boolean
  macosTransaction?: { appBundlePath: string; stageRoot: string }
}

interface HelperCommand {
  command: string
  args: string[]
  waitForExit: boolean
}

async function waitForFile(filePath: string): Promise<string> {
  const deadline = Date.now() + 2_000
  while (Date.now() < deadline) {
    try {
      return await readFile(filePath, 'utf8')
    } catch (error) {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) {
        throw error
      }
    }
    await delay(20)
  }
  throw new Error(`Timed out waiting for helper child output: ${filePath}`)
}

async function createPlan(overrides: Partial<HelperPlan> = {}): Promise<{
  root: string
  attemptRoot: string
  bundledDir: string
  planPath: string
  plan: HelperPlan
  options: HelperOptions
}> {
  const root = await mkdtemp(path.join(tmpdir(), 'tuff-update-helper-'))
  const bundledDir = await mkdtemp(path.join(tmpdir(), 'tuff-update-bundled-'))
  temporaryRoots.push(root, bundledDir)
  const attemptRoot = path.join(root, 'attempts', 'attempt-1')
  await mkdir(attemptRoot, { recursive: true })
  const platform =
    overrides.platform ??
    (process.platform === 'win32' ? 'win32' : process.platform === 'darwin' ? 'darwin' : 'linux')
  let defaultHandoff: HelperCommand
  if (platform === 'darwin') {
    const scriptPath = path.join(attemptRoot, 'macos-apply-update.sh')
    await writeFile(scriptPath, '#!/bin/bash\nexit 0\n', 'utf8')
    await chmod(scriptPath, 0o755)
    defaultHandoff = { command: '/bin/bash', args: [scriptPath], waitForExit: true }
  } else if (platform === 'win32') {
    const exePath = path.join(attemptRoot, 'tuff-setup.exe')
    await writeFile(exePath, 'MZ', 'utf8')
    defaultHandoff = { command: exePath, args: [], waitForExit: false }
  } else {
    const scriptPath = path.join(bundledDir, 'linux-apply-update.sh')
    await writeFile(scriptPath, '#!/bin/bash\nexit 0\n', 'utf8')
    await chmod(scriptPath, 0o755)
    defaultHandoff = { command: '/bin/bash', args: [scriptPath], waitForExit: true }
  }
  const plan: HelperPlan = {
    schemaVersion: 1,
    attemptId: 'attempt-1',
    token: 'a'.repeat(32),
    parentPid: 999_999_999,
    platform,
    currentVersion: '2.4.9',
    targetVersion: '2.4.10',
    taskId: 'task-1',
    packagePath: path.join(attemptRoot, 'tuff.AppImage'),
    packageSha256: 'b'.repeat(64),
    createdAt: Date.now(),
    healthTimeoutMs: 1_000,
    ackPath: path.join(attemptRoot, 'health-ack.json'),
    markerPath: path.join(attemptRoot, 'recovery-marker.json'),
    cleanupPaths: [],
    handoff: defaultHandoff,
    recovery: null,
    recoveryAvailable: false,
    ...overrides
  }
  const planPath = path.join(attemptRoot, 'plan.json')
  await writeFile(planPath, JSON.stringify(plan))
  const options: HelperOptions = { hostPlatform: platform, bundledScriptDirs: [bundledDir] }
  return { root, attemptRoot, bundledDir, planPath, plan, options }
}

afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all(
    temporaryRoots.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe('update handoff helper', () => {
  it.each([
    { name: 'token', change: { token: 'wrong-token'.repeat(4) } },
    { name: 'attempt', change: { attemptId: 'different-attempt' } },
    { name: 'version', change: { version: '2.4.11' } },
    { name: 'status', change: { status: 'pending' } }
  ])(
    'preserves the external old app for a mismatched $name ack, then cleans only after a matching ack',
    async ({ change }) => {
      const { root, planPath, plan, options } = await createPlan({ platform: 'darwin' })
      const applications = await realpath(await mkdtemp(path.join(tmpdir(), 'tuff-ota-external-')))
      temporaryRoots.push(applications)
      const stageRoot = path.join(applications, '.tuff-update-attempt-1')
      const oldPayload = path.join(stageRoot, 'prepared.app', 'old.txt')
      await mkdir(path.dirname(oldPayload), { recursive: true })
      await writeFile(oldPayload, 'old application')
      plan.macosTransaction = { appBundlePath: path.join(applications, 'Tuff.app'), stageRoot }
      await writeFile(planPath, JSON.stringify(plan))
      const acknowledgement = {
        schemaVersion: 1,
        attemptId: plan.attemptId,
        token: plan.token,
        status: 'healthy',
        version: plan.targetVersion
      }
      await writeFile(plan.ackPath, JSON.stringify({ ...acknowledgement, ...change }))
      await writeFile(
        plan.markerPath,
        JSON.stringify({
          schemaVersion: 1,
          attemptId: plan.attemptId,
          token: plan.token,
          status: 'recovery-required',
          recoveryAttempted: true
        })
      )
      await expect(runHelper(root, planPath, options)).resolves.toEqual({
        status: 'recovery-required'
      })
      expect(await readFile(oldPayload, 'utf8')).toBe('old application')
      await writeFile(plan.ackPath, JSON.stringify(acknowledgement))
      await expect(runHelper(root, planPath, options)).resolves.toEqual({ status: 'healthy' })
      await expect(stat(stageRoot)).rejects.toMatchObject({ code: 'ENOENT' })
    }
  )

  it.each(
    ['wrong-sibling', 'symlink', 'cleanup-escape'].filter(
      (escape) => process.platform !== 'win32' || escape !== 'symlink'
    )
  )('does not delete an external path through %s', async (escape) => {
    const { root, planPath, plan, options } = await createPlan({ platform: 'darwin' })
    const applications = await realpath(await mkdtemp(path.join(tmpdir(), 'tuff-ota-escape-')))
    temporaryRoots.push(applications)
    const victim = path.join(applications, 'unrelated')
    await mkdir(victim)
    await writeFile(path.join(victim, 'sentinel'), 'keep')
    const stageRoot = path.join(applications, '.tuff-update-attempt-1')
    if (escape === 'symlink') await symlink(victim, stageRoot)
    plan.macosTransaction = {
      appBundlePath: path.join(applications, 'Tuff.app'),
      stageRoot: escape === 'wrong-sibling' ? victim : stageRoot
    }
    if (escape === 'cleanup-escape') plan.cleanupPaths = [victim]
    await writeFile(planPath, JSON.stringify(plan))
    await writeFile(
      plan.ackPath,
      JSON.stringify({
        schemaVersion: 1,
        attemptId: plan.attemptId,
        token: plan.token,
        status: 'healthy',
        version: plan.targetVersion
      })
    )
    await expect(runHelper(root, planPath, options)).rejects.toThrow()
    expect(await readFile(path.join(victim, 'sentinel'), 'utf8')).toBe('keep')
  })
  it.each([true, false])(
    'does not leak ELECTRON_RUN_AS_NODE into a waitForExit=%s child',
    async (waitForExit) => {
      const root = await mkdtemp(path.join(tmpdir(), 'tuff-update-helper-env-'))
      temporaryRoots.push(root)
      const outputPath = path.join(root, 'child-env.txt')
      vi.stubEnv('ELECTRON_RUN_AS_NODE', '1')
      vi.stubEnv('TUFF_OTA_PROFILE_SENTINEL', 'isolated-profile')

      await launchCommand({
        command: process.execPath,
        args: [
          '-e',
          `require('node:fs').writeFileSync(process.argv[1], JSON.stringify({ electronRunAsNode: process.env.ELECTRON_RUN_AS_NODE ?? null, profile: process.env.TUFF_OTA_PROFILE_SENTINEL }))`,
          outputPath
        ],
        waitForExit
      })

      await expect(waitForFile(outputPath).then(JSON.parse)).resolves.toEqual({
        electronRunAsNode: null,
        profile: 'isolated-profile'
      })
    }
  )

  it('waits for an already-exited parent and accepts a matching health acknowledgement', async () => {
    const { root, bundledDir, planPath, plan, options } = await createPlan({ platform: 'linux' })
    const acknowledgement = JSON.stringify({
      schemaVersion: 1,
      attemptId: plan.attemptId,
      token: plan.token,
      status: 'healthy',
      version: plan.targetVersion
    })
    const scriptPath = path.join(bundledDir, 'linux-apply-update.sh')
    await writeFile(scriptPath, `#!/bin/bash\nprintf '%s' "$1" > "$2"\n`, 'utf8')
    await chmod(scriptPath, 0o755)
    plan.handoff = {
      command: '/bin/bash',
      args: [scriptPath, acknowledgement, plan.ackPath],
      waitForExit: true
    }
    await writeFile(planPath, JSON.stringify(plan))

    await expect(runHelper(root, planPath, options)).resolves.toEqual({ status: 'healthy' })
    expect(JSON.parse(await readFile(plan.ackPath, 'utf8'))).toMatchObject({
      attemptId: plan.attemptId,
      token: plan.token,
      status: 'healthy'
    })
  })

  it('starts the configured previous recovery only once after a health timeout', async () => {
    const { root, attemptRoot, plan, options } = await createPlan({ platform: 'darwin' })
    const counterPath = path.join(root, 'recovery-count.txt')
    const scriptPath = path.join(attemptRoot, 'macos-restore-update.sh')
    await writeFile(
      scriptPath,
      `#!/bin/bash\ncount=0\nif [ -f "$1" ]; then count=$(cat "$1"); fi\nprintf '%s' "$((count + 1))" > "$1"\n`,
      'utf8'
    )
    await chmod(scriptPath, 0o755)
    plan.recoveryAvailable = true
    plan.recovery = {
      command: '/bin/bash',
      args: [scriptPath, counterPath],
      waitForExit: true
    }

    await expect(
      recoverOnce(root, plan, 'Startup health acknowledgement timed out', options)
    ).resolves.toBe(true)
    await expect(
      recoverOnce(root, plan, 'Startup health acknowledgement timed out', options)
    ).resolves.toBe(false)

    expect(await readFile(counterPath, 'utf8')).toBe('1')
    expect(JSON.parse(await readFile(plan.markerPath, 'utf8'))).toMatchObject({
      status: 'recovery-started',
      recoveryAttempted: true,
      token: plan.token
    })
  })

  it('records recovery-required without spawning a recovery when no previous asset exists', async () => {
    const { root, plan, options } = await createPlan()

    await expect(
      recoverOnce(root, plan, 'Startup health acknowledgement timed out', options)
    ).resolves.toBe(false)

    expect(JSON.parse(await readFile(plan.markerPath, 'utf8'))).toMatchObject({
      status: 'recovery-required',
      recoveryAttempted: true,
      reason: expect.stringContaining('no previous recovery asset')
    })
  })

  it('rejects cross-platform plans, symlinked scripts, writable Linux roots, and tampered macOS flags', async () => {
    const { root, attemptRoot, plan, options } = await createPlan({ platform: 'darwin' })

    // Cross-platform plan tampering (e.g. win32 plan on darwin host) is rejected.
    const winPlanOnMac = await createPlan({ platform: 'win32' })
    expect(() =>
      validatePlan(winPlanOnMac.root, winPlanOnMac.plan, { hostPlatform: 'darwin' })
    ).toThrow(/invalid schema/)

    expect(() =>
      validatePlan(
        root,
        {
          ...plan,
          handoff: { command: process.execPath, args: ['-e', 'process.exit(0)'], waitForExit: true }
        },
        options
      )
    ).toThrow(/Disallowed macOS handoff command/)

    expect(() =>
      validatePlan(
        root,
        {
          ...plan,
          handoff: { command: '/bin/bash', args: ['-c', 'id'], waitForExit: true }
        },
        options
      )
    ).toThrow(/Disallowed macOS handoff command/)

    expect(() =>
      validatePlan(
        root,
        {
          ...plan,
          handoff: {
            command: '/bin/bash',
            args: ['/tmp/outside/macos-apply-update.sh'],
            waitForExit: true
          }
        },
        options
      )
    ).toThrow(/Disallowed macOS handoff command/)

    // Symlinked macos-apply-update.sh inside attemptRoot pointing outside is rejected.
    const outsideScript = path.join(await mkdtemp(path.join(tmpdir(), 'tuff-outside-')), 'evil.sh')
    temporaryRoots.push(path.dirname(outsideScript))
    await writeFile(outsideScript, '#!/bin/bash\nexit 0\n', 'utf8')
    const symlinkedScript = path.join(attemptRoot, 'sub', 'macos-apply-update.sh')
    await mkdir(path.dirname(symlinkedScript), { recursive: true })
    await symlink(outsideScript, symlinkedScript)
    expect(() =>
      validatePlan(
        root,
        {
          ...plan,
          handoff: { command: '/bin/bash', args: [symlinkedScript], waitForExit: true }
        },
        options
      )
    ).toThrow(/Disallowed macOS handoff command/)

    // Tampered --swap-helper outside attemptRoot and tampered --dest are rejected.
    const applications = await realpath(await mkdtemp(path.join(tmpdir(), 'tuff-ota-flags-')))
    temporaryRoots.push(applications)
    const stageRoot = path.join(applications, '.tuff-update-attempt-1')
    const validSwapHelper = path.join(attemptRoot, 'tuff-native-update')
    await writeFile(validSwapHelper, 'bin', 'utf8')
    const validMacScript = path.join(attemptRoot, 'macos-apply-update.sh')
    const macPlanWithTx: HelperPlan = {
      ...plan,
      macosTransaction: { appBundlePath: path.join(applications, 'Tuff.app'), stageRoot }
    }
    expect(() =>
      validatePlan(
        root,
        {
          ...macPlanWithTx,
          handoff: {
            command: '/bin/bash',
            args: [
              validMacScript,
              '--swap-helper',
              '/tmp/evil/tuff-native-update',
              '--dest',
              macPlanWithTx.macosTransaction!.appBundlePath
            ],
            waitForExit: true
          }
        },
        options
      )
    ).toThrow(/Disallowed macOS handoff swap-helper path/)
    expect(() =>
      validatePlan(
        root,
        {
          ...macPlanWithTx,
          handoff: {
            command: '/bin/bash',
            args: [
              validMacScript,
              '--swap-helper',
              validSwapHelper,
              '--dest',
              '/Applications/Other.app'
            ],
            waitForExit: true
          }
        },
        options
      )
    ).toThrow(/Disallowed macOS handoff destination path/)
    expect(() =>
      validatePlan(
        root,
        {
          ...macPlanWithTx,
          handoff: {
            command: '/bin/bash',
            args: [
              validMacScript,
              '--swap-helper',
              validSwapHelper,
              '--dest',
              macPlanWithTx.macosTransaction!.appBundlePath
            ],
            waitForExit: true
          }
        },
        options
      )
    ).not.toThrow()

    expect(() =>
      validatePlan(
        root,
        {
          ...plan,
          recovery: {
            command: '/bin/bash',
            args: [path.join(attemptRoot, 'macos-apply-update.sh')],
            waitForExit: true
          }
        },
        options
      )
    ).toThrow(/Disallowed macOS recovery command/)

    // Linux: writable attemptRoot/linux-apply-update.sh and bash recovery are both rejected.
    const linux = await createPlan({ platform: 'linux' })
    const writableLinuxScript = path.join(linux.attemptRoot, 'linux-apply-update.sh')
    await writeFile(writableLinuxScript, '#!/bin/bash\nexit 0\n', 'utf8')
    expect(() =>
      validatePlan(
        linux.root,
        {
          ...linux.plan,
          handoff: { command: '/bin/bash', args: [writableLinuxScript], waitForExit: true }
        },
        linux.options
      )
    ).toThrow(/Disallowed Linux handoff command/)
    expect(() =>
      validatePlan(
        linux.root,
        {
          ...linux.plan,
          recovery: {
            command: '/bin/bash',
            args: [path.join(linux.bundledDir, 'linux-apply-update.sh')],
            waitForExit: true
          }
        },
        linux.options
      )
    ).toThrow(/Disallowed Linux recovery command/)
    expect(() =>
      validatePlan(
        linux.root,
        {
          ...linux.plan,
          handoff: { command: '/bin/sh', args: ['-c', 'echo pwn'], waitForExit: true }
        },
        linux.options
      )
    ).toThrow(/Disallowed Linux handoff command/)
    expect(() =>
      validatePlan(
        linux.root,
        {
          ...linux.plan,
          recovery: { command: '/tmp/outside/evil.AppImage', args: [], waitForExit: false }
        },
        linux.options
      )
    ).toThrow(/Disallowed Linux recovery command/)

    // Windows: arbitrary executables, external MSI, and non-installer EXE are rejected;
    // real MSI inside root passes.
    const win = await createPlan({ platform: 'win32' })
    expect(() =>
      validatePlan(
        win.root,
        {
          ...win.plan,
          handoff: { command: 'powershell.exe', args: ['-Command', 'calc'], waitForExit: false }
        },
        win.options
      )
    ).toThrow(/Disallowed Windows handoff command/)
    expect(() =>
      validatePlan(
        win.root,
        {
          ...win.plan,
          handoff: {
            command: 'msiexec.exe',
            args: ['/i', '/tmp/outside/evil.msi'],
            waitForExit: false
          }
        },
        win.options
      )
    ).toThrow(/Disallowed Windows handoff command/)
    const nonInstallerExe = path.join(win.attemptRoot, 'evil-payload.exe')
    await writeFile(nonInstallerExe, 'MZ', 'utf8')
    expect(() =>
      validatePlan(
        win.root,
        {
          ...win.plan,
          handoff: {
            command: nonInstallerExe,
            args: [],
            waitForExit: false
          }
        },
        win.options
      )
    ).toThrow(/Disallowed Windows handoff command/)
    const validMsi = path.join(win.attemptRoot, 'tuff.msi')
    await writeFile(validMsi, 'MSI', 'utf8')
    expect(() =>
      validatePlan(
        win.root,
        {
          ...win.plan,
          handoff: {
            command: 'msiexec.exe',
            args: ['/i', validMsi],
            waitForExit: false
          }
        },
        win.options
      )
    ).not.toThrow()
  })
})
