import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { recoverOnce, runHelper } = require('./update-handoff-helper.cjs') as {
  recoverOnce: (root: string, plan: HelperPlan, reason: string) => Promise<boolean>
  runHelper: (root: string, planPath: string) => Promise<{ status: string }>
}

const temporaryRoots: string[] = []

type HelperPlan = {
  schemaVersion: 1
  attemptId: string
  token: string
  parentPid: number
  platform: 'linux'
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
  handoff: { command: string; args: string[]; waitForExit: boolean }
  recovery: { command: string; args: string[]; waitForExit: boolean } | null
  recoveryAvailable: boolean
}

async function createPlan(
  overrides: Partial<HelperPlan> = {}
): Promise<{ root: string; planPath: string; plan: HelperPlan }> {
  const root = await mkdtemp(path.join(tmpdir(), 'tuff-update-helper-'))
  temporaryRoots.push(root)
  const attemptRoot = path.join(root, 'attempts', 'attempt-1')
  await mkdir(attemptRoot, { recursive: true })
  const plan: HelperPlan = {
    schemaVersion: 1,
    attemptId: 'attempt-1',
    token: 'a'.repeat(32),
    parentPid: 999_999_999,
    platform: 'linux',
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
    handoff: { command: process.execPath, args: ['-e', ''], waitForExit: true },
    recovery: null,
    recoveryAvailable: false,
    ...overrides
  }
  const planPath = path.join(attemptRoot, 'plan.json')
  await writeFile(planPath, JSON.stringify(plan))
  return { root, planPath, plan }
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe('update handoff helper', () => {
  it('waits for an already-exited parent and accepts a matching health acknowledgement', async () => {
    const { root, planPath, plan } = await createPlan()
    const acknowledgement = JSON.stringify({
      schemaVersion: 1,
      attemptId: plan.attemptId,
      token: plan.token,
      status: 'healthy',
      version: plan.targetVersion
    })
    plan.handoff = {
      command: process.execPath,
      args: [
        '-e',
        `require('node:fs').writeFileSync(process.argv[1], ${JSON.stringify(acknowledgement)})`,
        plan.ackPath
      ],
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
    const { root, plan } = await createPlan()
    const counterPath = path.join(root, 'recovery-count.txt')
    plan.recoveryAvailable = true
    plan.recovery = {
      command: process.execPath,
      args: [
        '-e',
        "const fs=require('node:fs'); const file=process.argv[1]; const count=fs.existsSync(file)?Number(fs.readFileSync(file,'utf8')):0; fs.writeFileSync(file,String(count+1))",
        counterPath
      ],
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
})
