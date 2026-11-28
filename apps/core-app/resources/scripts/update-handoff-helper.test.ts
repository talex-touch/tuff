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
const { launchCommand, recoverOnce, runHelper, validatePlan } =
  require('./update-handoff-helper.cjs') as {
    launchCommand: (command: HelperCommand) => Promise<void>
    recoverOnce: (root: string, plan: HelperPlan, reason: string) => Promise<boolean>
    runHelper: (root: string, planPath: string) => Promise<{ status: string }>
    validatePlan: (root: string, plan: HelperPlan) => HelperPlan
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

async function createPlan(
  overrides: Partial<HelperPlan> = {}
): Promise<{ root: string; attemptRoot: string; planPath: string; plan: HelperPlan }> {
  const root = await mkdtemp(path.join(tmpdir(), 'tuff-update-helper-'))
  temporaryRoots.push(root)
  const attemptRoot = path.join(root, 'attempts', 'attempt-1')
  await mkdir(attemptRoot, { recursive: true })
  const platform = overrides.platform ?? 'linux'
  const defaultScriptName =
    platform === 'darwin' ? 'macos-apply-update.sh' : 'linux-apply-update.sh'
  const defaultScriptPath = path.join(attemptRoot, defaultScriptName)
  await writeFile(defaultScriptPath, '#!/bin/bash\nexit 0\n', 'utf8')
  await chmod(defaultScriptPath, 0o755)
  const defaultHandoff: HelperCommand =
    platform === 'win32'
      ? {
          command: path.join(attemptRoot, 'tuff-setup.exe'),
          args: [],
          waitForExit: false
        }
      : {
          command: '/bin/bash',
          args: [defaultScriptPath],
          waitForExit: true
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
  return { root, attemptRoot, planPath, plan }
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
      const { root, planPath, plan } = await createPlan({ platform: 'darwin' })
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
      await expect(runHelper(root, planPath)).resolves.toEqual({ status: 'recovery-required' })
      expect(await readFile(oldPayload, 'utf8')).toBe('old application')
      await writeFile(plan.ackPath, JSON.stringify(acknowledgement))
      await expect(runHelper(root, planPath)).resolves.toEqual({ status: 'healthy' })
      await expect(stat(stageRoot)).rejects.toMatchObject({ code: 'ENOENT' })
    }
  )

  it.each(
    ['wrong-sibling', 'symlink', 'cleanup-escape'].filter(
      (escape) => process.platform !== 'win32' || escape !== 'symlink'
    )
  )('does not delete an external path through %s', async (escape) => {
    const { root, planPath, plan } = await createPlan({ platform: 'darwin' })
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
    await expect(runHelper(root, planPath)).rejects.toThrow()
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
    const { root, attemptRoot, planPath, plan } = await createPlan()
    const acknowledgement = JSON.stringify({
      schemaVersion: 1,
      attemptId: plan.attemptId,
      token: plan.token,
      status: 'healthy',
      version: plan.targetVersion
    })
    const scriptPath = path.join(attemptRoot, 'linux-apply-update.sh')
    await writeFile(scriptPath, `#!/bin/bash\nprintf '%s' "$1" > "$2"\n`, 'utf8')
    await chmod(scriptPath, 0o755)
    plan.handoff = {
      command: '/bin/bash',
      args: [scriptPath, acknowledgement, plan.ackPath],
      waitForExit: true
    }
    await writeFile(planPath, JSON.stringify(plan))

    await expect(runHelper(root, planPath)).resolves.toEqual({ status: 'healthy' })
    expect(JSON.parse(await readFile(plan.ackPath, 'utf8'))).toMatchObject({
      attemptId: plan.attemptId,
      token: plan.token,
      status: 'healthy'
    })
  })

  it('starts the configured previous recovery only once after a health timeout', async () => {
    const { root, attemptRoot, plan } = await createPlan()
    const counterPath = path.join(root, 'recovery-count.txt')
    const scriptPath = path.join(attemptRoot, 'linux-apply-update.sh')
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

    await expect(recoverOnce(root, plan, 'Startup health acknowledgement timed out')).resolves.toBe(
      true
    )
    await expect(recoverOnce(root, plan, 'Startup health acknowledgement timed out')).resolves.toBe(
      false
    )

    expect(await readFile(counterPath, 'utf8')).toBe('1')
    expect(JSON.parse(await readFile(plan.markerPath, 'utf8'))).toMatchObject({
      status: 'recovery-started',
      recoveryAttempted: true,
      token: plan.token
    })
  })

  it('records recovery-required without spawning a recovery when no previous asset exists', async () => {
    const { root, plan } = await createPlan()

    await expect(recoverOnce(root, plan, 'Startup health acknowledgement timed out')).resolves.toBe(
      false
    )

    expect(JSON.parse(await readFile(plan.markerPath, 'utf8'))).toMatchObject({
      status: 'recovery-required',
      recoveryAttempted: true,
      reason: expect.stringContaining('no previous recovery asset')
    })
  })

  it('rejects arbitrary or out-of-root handoff and recovery commands across platforms', async () => {
    const { root, attemptRoot, plan } = await createPlan({ platform: 'darwin' })

    expect(() =>
      validatePlan(root, {
        ...plan,
        handoff: { command: process.execPath, args: ['-e', 'process.exit(0)'], waitForExit: true }
      })
    ).toThrow(/Disallowed macOS handoff command/)

    expect(() =>
      validatePlan(root, {
        ...plan,
        handoff: { command: '/bin/bash', args: ['-c', 'id'], waitForExit: true }
      })
    ).toThrow(/Disallowed macOS handoff command/)

    expect(() =>
      validatePlan(root, {
        ...plan,
        handoff: {
          command: '/bin/bash',
          args: ['/tmp/outside/macos-apply-update.sh'],
          waitForExit: true
        }
      })
    ).toThrow(/Disallowed macOS handoff command/)

    expect(() =>
      validatePlan(root, {
        ...plan,
        recovery: {
          command: '/bin/bash',
          args: [path.join(attemptRoot, 'macos-apply-update.sh')],
          waitForExit: true
        }
      })
    ).toThrow(/Disallowed macOS recovery command/)

    const linux = await createPlan({ platform: 'linux' })
    expect(() =>
      validatePlan(linux.root, {
        ...linux.plan,
        handoff: { command: '/bin/sh', args: ['-c', 'echo pwn'], waitForExit: true }
      })
    ).toThrow(/Disallowed Linux handoff command/)
    expect(() =>
      validatePlan(linux.root, {
        ...linux.plan,
        recovery: { command: '/tmp/outside/evil.AppImage', args: [], waitForExit: false }
      })
    ).toThrow(/Disallowed Linux recovery command/)

    const win = await createPlan({ platform: 'win32' })
    expect(() =>
      validatePlan(win.root, {
        ...win.plan,
        handoff: { command: 'powershell.exe', args: ['-Command', 'calc'], waitForExit: false }
      })
    ).toThrow(/Disallowed Windows handoff command/)
    expect(() =>
      validatePlan(win.root, {
        ...win.plan,
        handoff: {
          command: 'msiexec.exe',
          args: ['/i', '/tmp/outside/evil.msi'],
          waitForExit: false
        }
      })
    ).toThrow(/Disallowed Windows handoff command/)
    expect(() =>
      validatePlan(win.root, {
        ...win.plan,
        handoff: {
          command: path.join(win.attemptRoot, 'evil-payload.exe'),
          args: [],
          waitForExit: false
        }
      })
    ).toThrow(/Disallowed Windows handoff command/)
    // Legitimate MSI inside root passes.
    expect(() =>
      validatePlan(win.root, {
        ...win.plan,
        handoff: {
          command: 'msiexec.exe',
          args: ['/i', path.join(win.attemptRoot, 'tuff.msi')],
          waitForExit: false
        }
      })
    ).not.toThrow()
  })
})
