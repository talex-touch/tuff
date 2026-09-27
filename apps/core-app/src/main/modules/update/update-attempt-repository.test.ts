import type { Client } from '@libsql/client'
import type { UpdateLifecyclePhase, UpdateLifecycleSnapshot } from '@talex-touch/utils'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type { UpdateLifecyclePatch } from './update-lifecycle'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@libsql/client'
import { AppPreviewChannel } from '@talex-touch/utils'
import { drizzle } from 'drizzle-orm/libsql'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../db/schema'
import { UpdateAttemptRepository } from './update-attempt-repository'

const updateAttemptsMigration = new URL(
  '../../../../resources/db/migrations/0028_app_update_attempts.sql',
  import.meta.url
)
const rollbackCompatibilityMigration = new URL(
  '../../../../resources/db/migrations/0030_app_update_rollback_compatibility.sql',
  import.meta.url
)

async function applyMigration(client: Client, migrationUrl: URL): Promise<void> {
  const migration = await readFile(migrationUrl, 'utf8')
  for (const statement of migration.split('--> statement-breakpoint')) {
    if (statement.trim()) await client.execute(statement)
  }
}

describe('updateAttemptRepository', () => {
  let directory: string
  let client: Client
  let db: LibSQLDatabase<typeof schema>
  let repository: UpdateAttemptRepository

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'tuff-update-attempts-'))
    client = createClient({ url: `file:${join(directory, 'update-attempts.sqlite')}` })
    await applyMigration(client, updateAttemptsMigration)
    await applyMigration(client, rollbackCompatibilityMigration)
    db = drizzle(client, { schema })
    repository = new UpdateAttemptRepository(db)
  })

  afterEach(async () => {
    client.close()
    await rm(directory, { recursive: true, force: true })
  })

  it('applies migration defaults and preserves them through a restart', async () => {
    const created = await repository.createChecking({
      id: 'attempt-1',
      currentVersion: '2.4.9',
      channel: AppPreviewChannel.RELEASE,
      installOnNormalQuit: false,
      now: 100
    })

    expect(created).toMatchObject({ rollbackCompatible: false, rollbackFromVersion: null })

    client.close()
    client = createClient({ url: `file:${join(directory, 'update-attempts.sqlite')}` })
    db = drizzle(client, { schema })
    const reloaded = new UpdateAttemptRepository(db)

    await expect(reloaded.getActive()).resolves.toEqual(created)
  })

  it('persists rollback compatibility through a CAS transition with a monotonic revision', async () => {
    const created = await repository.createChecking({
      id: 'attempt-1',
      currentVersion: '2.4.9',
      channel: AppPreviewChannel.RELEASE,
      installOnNormalQuit: false,
      now: 100
    })

    const transitioned = await repository.transition({
      attemptId: created.attemptId!,
      expectedRevision: created.revision,
      expectedPhase: 'checking',
      to: 'available',
      patch: {
        targetVersion: '2.5.0',
        source: 'nexus',
        releaseTag: 'v2.5.0',
        rollbackCompatible: true,
        rollbackFromVersion: '2.4.9'
      },
      now: 200
    })

    expect(transitioned).toMatchObject({
      attemptId: 'attempt-1',
      phase: 'available',
      revision: 1,
      targetVersion: '2.5.0',
      source: 'nexus',
      releaseTag: 'v2.5.0',
      rollbackCompatible: true,
      rollbackFromVersion: '2.4.9',
      updatedAt: 200
    })
    await expect(repository.getById('attempt-1')).resolves.toEqual(transitioned)
  })

  it('rejects a stale CAS transition without overwriting the committed lifecycle', async () => {
    const created = await repository.createChecking({
      id: 'attempt-1',
      currentVersion: '2.4.9',
      channel: AppPreviewChannel.RELEASE,
      installOnNormalQuit: false,
      now: 100
    })
    const available = await repository.transition({
      attemptId: created.attemptId!,
      expectedRevision: created.revision,
      expectedPhase: 'checking',
      to: 'available',
      now: 200
    })

    await expect(
      repository.transition({
        attemptId: created.attemptId!,
        expectedRevision: created.revision,
        expectedPhase: 'available',
        to: 'downloading',
        now: 300
      })
    ).rejects.toMatchObject({ code: 'UPDATE_LIFECYCLE_CONFLICT' })
    await expect(repository.getById('attempt-1')).resolves.toEqual(available)
  })

  it('enforces exactly one active attempt at the database boundary', async () => {
    await repository.createChecking({
      id: 'attempt-1',
      currentVersion: '2.4.9',
      channel: AppPreviewChannel.RELEASE,
      installOnNormalQuit: false,
      now: 100
    })

    await expect(
      db.insert(schema.appUpdateAttempts).values({
        id: 'attempt-2',
        revision: 0,
        phase: 'checking',
        currentVersion: '2.4.9',
        channel: AppPreviewChannel.RELEASE,
        installOnNormalQuit: false,
        recoveryAvailable: false,
        createdAt: 200,
        updatedAt: 200
      })
    ).rejects.toMatchObject({
      cause: { code: expect.stringMatching(/CONSTRAINT/) }
    })
    await expect(repository.getActive()).resolves.toMatchObject({ attemptId: 'attempt-1' })
  })

  it('permits a new check after a terminal attempt', async () => {
    const created = await repository.createChecking({
      id: 'attempt-1',
      currentVersion: '2.4.9',
      channel: AppPreviewChannel.RELEASE,
      installOnNormalQuit: false,
      now: 100
    })
    await repository.transition({
      attemptId: created.attemptId!,
      expectedRevision: created.revision,
      expectedPhase: 'checking',
      to: 'failed',
      patch: {
        error: { code: 'CHECK_FAILED', message: 'release unavailable', retryable: true }
      },
      now: 200
    })

    const next = await repository.createChecking({
      id: 'attempt-2',
      currentVersion: '2.4.9',
      channel: AppPreviewChannel.RELEASE,
      installOnNormalQuit: false,
      now: 300
    })

    expect(next).toMatchObject({ attemptId: 'attempt-2', phase: 'checking', revision: 0 })
    await expect(repository.getActive()).resolves.toEqual(next)
  })
  it('publishes only committed lifecycle snapshots and ignores failed CAS writes', async () => {
    const onCommitted = vi.fn()
    const observedRepository = new UpdateAttemptRepository(db, { onCommitted })
    const created = await observedRepository.createChecking({
      id: 'attempt-observed',
      currentVersion: '2.4.9',
      channel: AppPreviewChannel.RELEASE,
      installOnNormalQuit: false,
      now: 100
    })
    const available = await observedRepository.transition({
      attemptId: created.attemptId!,
      expectedRevision: created.revision,
      expectedPhase: 'checking',
      to: 'available',
      patch: { targetVersion: '2.4.10', releaseTag: 'v2.4.10', source: 'nexus' },
      now: 200
    })

    await expect(
      observedRepository.transition({
        attemptId: created.attemptId!,
        expectedRevision: created.revision,
        expectedPhase: 'checking',
        to: 'failed',
        now: 300
      })
    ).rejects.toMatchObject({ code: 'UPDATE_LIFECYCLE_CONFLICT' })
    expect(onCommitted.mock.calls.map(([snapshot]) => snapshot)).toEqual([created, available])
  })

  it('lists finished attempts that named a target version, newest first', async () => {
    const runAttempt = async (
      id: string,
      steps: ReadonlyArray<readonly [UpdateLifecyclePhase, UpdateLifecyclePatch?]>,
      startedAt: number
    ): Promise<UpdateLifecycleSnapshot> => {
      let snapshot = await repository.createChecking({
        id,
        currentVersion: '2.4.9',
        channel: AppPreviewChannel.RELEASE,
        installOnNormalQuit: true,
        now: startedAt
      })
      for (const [index, [to, patch]] of steps.entries()) {
        snapshot = await repository.transition({
          attemptId: id,
          expectedRevision: snapshot.revision,
          expectedPhase: snapshot.phase,
          to,
          patch,
          now: startedAt + index + 1
        })
      }
      return snapshot
    }
    const target = (version: string): UpdateLifecyclePatch => ({
      targetVersion: version,
      releaseTag: version,
      source: 'nexus'
    })
    const failure = (code: string): UpdateLifecyclePatch => ({
      error: { code, message: `${code} message`, retryable: true }
    })
    const installed = [
      ['downloading', { taskId: 'task' }],
      ['verifying'],
      ['ready'],
      ['install-scheduled'],
      ['handoff-started']
    ] as const

    await runAttempt('no-update', [['idle']], 100)
    await runAttempt('check-failed', [['failed', failure('UPDATE_CHECK_FAILED')]], 200)
    const downloadFailed = await runAttempt(
      'download-failed',
      [
        ['available', target('v2.5.0')],
        ['failed', failure('UPDATE_DOWNLOAD_FAILED')]
      ],
      300
    )
    const updated = await runAttempt(
      'updated',
      [['available', target('v2.5.1')], ...installed, ['awaiting-health'], ['healthy']],
      400
    )
    const rolledBack = await runAttempt(
      'rolled-back',
      [
        ['available', target('v2.5.2')],
        ...installed,
        ['recovery-required'],
        ['recovering'],
        ['recovered']
      ],
      500
    )
    await runAttempt('in-flight', [['available', target('v2.5.3')]], 600)

    await expect(repository.listTerminalAttempts()).resolves.toEqual([
      rolledBack,
      updated,
      downloadFailed
    ])
    await expect(repository.listTerminalAttempts(2)).resolves.toEqual([rolledBack, updated])
  })
})
