import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  UPDATE_HANDOFF_SCHEMA_VERSION,
  UpdateRecoveryStore,
  type UpdateHandoffPlan
} from './update-recovery-store'

const temporaryRoots: string[] = []

async function createStore(): Promise<{ root: string; store: UpdateRecoveryStore }> {
  const root = await mkdtemp(path.join(tmpdir(), 'tuff-update-recovery-'))
  temporaryRoots.push(root)
  const store = new UpdateRecoveryStore(root)
  await store.initialize()
  return { root, store }
}

function createPlan(store: UpdateRecoveryStore, attemptId = 'attempt-1'): UpdateHandoffPlan {
  const paths = store.createAttemptPaths(attemptId)
  return {
    schemaVersion: UPDATE_HANDOFF_SCHEMA_VERSION,
    attemptId,
    token: 'a'.repeat(32),
    platform: 'linux',
    parentPid: 1,
    currentVersion: '2.4.9',
    targetVersion: '2.4.10',
    taskId: 'download-task',
    packagePath: path.join(store.recoveryRoot, 'packages', 'tuff.AppImage'),
    packageSha256: 'b'.repeat(64),
    createdAt: Date.now(),
    healthTimeoutMs: 1_000,
    ackPath: paths.ackPath,
    markerPath: paths.markerPath,
    handoff: { command: '/bin/true', args: [], waitForExit: false },
    recovery: null,
    cleanupPaths: [],
    previousVersion: null,
    recoveryAvailable: false
  }
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe('UpdateRecoveryStore', () => {
  it('rejects plans whose package or coordination paths escape its storage root', async () => {
    const { store } = await createStore()
    const escapedPackage = createPlan(store)
    escapedPackage.packagePath = path.join(store.storageRoot, '..', 'outside.AppImage')
    const escapedAck = createPlan(store, 'attempt-2')
    escapedAck.ackPath = path.join(store.storageRoot, '..', 'health-ack.json')

    await expect(store.writePlan(escapedPackage)).rejects.toThrow('escapes the storage root')
    await expect(store.writePlan(escapedAck)).rejects.toThrow('escapes the storage root')
  })

  it('rejects unknown schemas and recovery markers from a different token', async () => {
    const { store } = await createStore()
    const plan = createPlan(store)
    await mkdir(path.dirname(plan.packagePath), { recursive: true })
    await writeFile(plan.packagePath, 'package')
    await expect(
      store.writePlan({ ...plan, schemaVersion: 999 as typeof UPDATE_HANDOFF_SCHEMA_VERSION })
    ).rejects.toThrow('invalid schema')

    await store.writePlan(plan)
    await import('node:fs/promises').then((fs) =>
      fs.writeFile(
        plan.markerPath,
        JSON.stringify({
          schemaVersion: UPDATE_HANDOFF_SCHEMA_VERSION,
          attemptId: plan.attemptId,
          token: 'wrong-token'.repeat(4),
          status: 'recovery-required',
          recoveryAttempted: true,
          reason: 'stale',
          updatedAt: 1
        })
      )
    )

    await expect(store.readRecoveryMarker(plan)).rejects.toThrow(
      'does not match the active handoff plan'
    )
  })

  it('keeps exactly one promoted previous package for the next recovery attempt', async () => {
    const { root, store } = await createStore()
    const firstPackage = path.join(root, 'first.AppImage')
    const secondPackage = path.join(root, 'second.AppImage')
    await writeFile(firstPackage, 'first')
    await writeFile(secondPackage, 'second')

    await store.promotePreviousAsset({
      version: '2.4.9',
      platform: 'linux',
      packagePath: firstPackage,
      sha256: '1'.repeat(64)
    })
    const promoted = await store.promotePreviousAsset({
      version: '2.4.10',
      platform: 'linux',
      packagePath: secondPackage,
      sha256: '2'.repeat(64)
    })

    expect(promoted).toMatchObject({ version: '2.4.10', filename: 'second.AppImage' })
    expect(await store.readPreviousAsset()).toMatchObject({
      version: '2.4.10',
      filePath: path.join(store.recoveryRoot, 'previous', 'second.AppImage')
    })
    expect((await readdir(path.join(store.recoveryRoot, 'previous'))).sort()).toEqual([
      'metadata.json',
      'second.AppImage'
    ])
  })
})
