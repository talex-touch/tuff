import type { Client } from '@libsql/client'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type {
  OrchestratorRunPrivacyFence,
  OrchestratorRunPrivacyStore
} from './owners/orchestrator-run-privacy-lifecycle'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { scheduleDbWrite } from '../../db/db-write'
import * as schema from '../../db/schema'
import { AiOrchestratorStore } from '../ai/ai-orchestrator-store'
import {
  createOrchestratorRunPrivacyLifecycle,
  type OrchestratorRunPrivacyLifecycle
} from './owners/orchestrator-run-privacy-lifecycle'
import type { OrchestratorPrivacyGateChecks } from './orchestrator-run-privacy-gates'

const CUTOFF_MS = 10_000
const RETENTION_MS = 30 * 24 * 60 * 60_000
const RETENTION_NOW_MS = RETENTION_MS + CUTOFF_MS
const RETENTION_POLICY = Object.freeze({ enabled: true, retentionMs: RETENTION_MS })
const ORCHESTRATOR_RETENTION_MIGRATION = '0041_ai_orchestrator_run_retention'
const PREVIOUS_ORCHESTRATOR_MIGRATION = '0040_conversation_sync_state_migration'
const ORCHESTRATOR_RETENTION_INDEX = 'idx_ai_orchestrator_runs_retention'
const STALE_ORCHESTRATOR_RETENTION_INDEX_SQL = `CREATE INDEX \`${ORCHESTRATOR_RETENTION_INDEX}\`
ON \`ai_orchestrator_runs\` (\`created_at\`)
WHERE \`status\` = 'running'`
const EXPECTED_ORCHESTRATOR_RETENTION_INDEX_SQL = `CREATE INDEX \`${ORCHESTRATOR_RETENTION_INDEX}\`
ON \`ai_orchestrator_runs\` (\`updated_at\`, \`id\`)
WHERE \`status\` IN ('completed', 'failed', 'cancelled', 'interrupted')`
const ORCHESTRATOR_RETENTION_QUERY = `SELECT r.id
FROM ai_orchestrator_runs AS r INDEXED BY ${ORCHESTRATOR_RETENTION_INDEX}
WHERE r.status IN ('completed', 'failed', 'cancelled', 'interrupted')
  AND r.updated_at < ${CUTOFF_MS}
  AND NOT EXISTS (
    SELECT 1
    FROM ai_orchestrator_events fresh_event
    WHERE fresh_event.run_id = r.id
      AND fresh_event.created_at >= ${CUTOFF_MS}
  )
ORDER BY r.updated_at, r.id
LIMIT 11`
const SAFE_MIGRATION_TAG = /^\d{4}_[a-z0-9_]+$/
const REVISION_PATTERN = /^[a-f0-9]{64}$/

interface MigrationJournal {
  version: string
  dialect: string
  entries: Array<{ tag: string; when: number } & Record<string, unknown>>
}

interface AcceptanceDatabase {
  client: Client
  db: LibSQLDatabase<typeof schema>
}

interface TrackingFence {
  fence: OrchestratorRunPrivacyFence
  activeRunIds: Set<string>
  releaseCounts: Map<string, number>
}

export interface OrchestratorPrivacyAcceptanceOptions {
  readonly migrationsFolder: string
  readonly temporaryRoot: string
}

export interface OrchestratorPrivacyTransportFixture {
  readonly runId: string
  readonly lifecycle: OrchestratorRunPrivacyLifecycle
  readonly verifyDeleted: () => Promise<boolean>
}

function assertAcceptance(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(`ORCHESTRATOR_PRIVACY_ACCEPTANCE_FAILED:${code}`)
}

function numberValue(value: unknown): number {
  return Number(value ?? 0)
}

function normalizeSql(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

async function scalar(
  client: Client,
  sql: string,
  args: Array<string | number> = []
): Promise<unknown> {
  const result = await client.execute({ sql, args })
  return result.rows[0] ? Object.values(result.rows[0])[0] : undefined
}

async function seedRun(
  client: Client,
  id: string,
  status: string,
  updatedAt: number,
  parentRunId: string | null = null
): Promise<void> {
  await client.execute({
    sql: `INSERT INTO ai_orchestrator_runs (
      id, automation_id, session_id, objective, profile_id, runtime_provider, cwd, status,
      output, error, usage, metadata, parent_run_id, delegation_plan, approval_reason,
      created_at, started_at, completed_at, updated_at
    ) VALUES (?, NULL, ?, ?, 'profile', 'pi-core', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      `session-${id}`,
      `CANARY_OBJECTIVE_${id}`,
      `/private/${id}`,
      status,
      `CANARY_OUTPUT_${id}`,
      `CANARY_ERROR_${id}`,
      '{"tokens":1}',
      `{"CANARY_METADATA":"${id}"}`,
      parentRunId,
      `{"CANARY_DELEGATION":"${id}"}`,
      `CANARY_APPROVAL_${id}`,
      updatedAt - 100,
      updatedAt - 50,
      ['queued', 'pending_approval', 'running'].includes(status) ? null : updatedAt,
      updatedAt
    ]
  })
}

async function seedEvent(
  client: Client,
  runId: string,
  seq: number,
  createdAt: number
): Promise<void> {
  await client.execute({
    sql: `INSERT INTO ai_orchestrator_events (id, run_id, seq, type, level, payload, created_at)
          VALUES (?, ?, ?, 'trace', 'info', ?, ?)`,
    args: [`event-${runId}-${seq}`, runId, seq, `{"CANARY_EVENT":"${runId}-${seq}"}`, createdAt]
  })
}

function createTrackingFence(protectedRunIds: ReadonlySet<string> = new Set()): TrackingFence {
  const activeRunIds = new Set<string>()
  const releaseCounts = new Map<string, number>()
  return {
    activeRunIds,
    releaseCounts,
    fence: {
      isRunProtected: (runId) => protectedRunIds.has(runId) || activeRunIds.has(runId),
      acquireRunDeletionFence: (runId) => {
        if (protectedRunIds.has(runId) || activeRunIds.has(runId)) return null
        activeRunIds.add(runId)
        return () => {
          releaseCounts.set(runId, (releaseCounts.get(runId) ?? 0) + 1)
          activeRunIds.delete(runId)
        }
      }
    }
  }
}

function createStore(db: LibSQLDatabase<typeof schema>): AiOrchestratorStore {
  return new AiOrchestratorStore({
    getDb: () => db,
    scheduleWrite: scheduleDbWrite
  })
}

async function openDatabase(databasePath: string): Promise<AcceptanceDatabase> {
  const client = createClient({ url: pathToFileURL(databasePath).href })
  await client.execute('PRAGMA foreign_keys = ON')
  return { client, db: drizzle(client, { schema }) }
}

export async function withOrchestratorPrivacyTransportFixture<T>(
  options: OrchestratorPrivacyAcceptanceOptions,
  operation: (fixture: OrchestratorPrivacyTransportFixture) => Promise<T>
): Promise<T> {
  const workspace = await mkdtemp(path.join(options.temporaryRoot, 'typed-orchestrator-'))
  const database = await openDatabase(path.join(workspace, 'typed-transport.sqlite'))
  const runId = 'packaged-typed-orchestrator-run'
  try {
    await migrate(database.db, { migrationsFolder: options.migrationsFolder })
    await seedRun(database.client, runId, 'completed', 20_000)
    await seedEvent(database.client, runId, 1, 20_100)
    await seedEvent(database.client, runId, 2, 20_200)

    const store = createStore(database.db)
    const tracking = createTrackingFence()
    const lifecycle = createOrchestratorRunPrivacyLifecycle({ store, fence: tracking.fence })
    return await operation(
      Object.freeze({
        runId,
        lifecycle,
        verifyDeleted: async () => {
          const [runCount, eventCount] = await Promise.all([
            scalar(database.client, 'SELECT COUNT(*) FROM ai_orchestrator_runs WHERE id = ?', [
              runId
            ]),
            scalar(
              database.client,
              'SELECT COUNT(*) FROM ai_orchestrator_events WHERE run_id = ?',
              [runId]
            )
          ])
          return (
            numberValue(runCount) === 0 &&
            numberValue(eventCount) === 0 &&
            tracking.activeRunIds.size === 0 &&
            tracking.releaseCounts.get(runId) === 1
          )
        }
      })
    )
  } finally {
    database.client.close()
    await rm(workspace, { recursive: true, force: true })
  }
}

async function withMigratedDatabase<T>(
  workspace: string,
  name: string,
  migrationsFolder: string,
  operation: (database: AcceptanceDatabase) => Promise<T>
): Promise<T> {
  const database = await openDatabase(path.join(workspace, `${name}.sqlite`))
  try {
    await migrate(database.db, { migrationsFolder })
    return await operation(database)
  } finally {
    database.client.close()
  }
}

async function verifyDeleteLifecycle(
  workspace: string,
  migrationsFolder: string
): Promise<
  Pick<
    OrchestratorPrivacyGateChecks,
    | 'typedDeletePreview'
    | 'authorityBoundOneShotDelete'
    | 'terminalRunDeletion'
    | 'activeRunProtected'
    | 'cascadeDelete'
  >
> {
  return await withMigratedDatabase(
    workspace,
    'delete-lifecycle',
    migrationsFolder,
    async ({ client, db }) => {
      const store = createStore(db)
      const protectedRunIds = new Set(['authority-protected'])
      const tracking = createTrackingFence(protectedRunIds)
      const lifecycle = createOrchestratorRunPrivacyLifecycle({ store, fence: tracking.fence })
      const signal = new AbortController().signal

      await seedRun(client, 'delete-root', 'completed', 20_000)
      await seedRun(client, 'delete-child', 'completed', 20_100, 'delete-root')
      await client.execute(
        `INSERT INTO ai_automations
          (id, name, objective, profile_id, trigger, approval_mode, created_at, updated_at)
         VALUES
          ('acceptance-automation', 'Acceptance', 'Acceptance objective', 'profile',
           'manual', 'manual', 1, 1)`
      )
      await client.execute(
        `INSERT INTO ai_automation_runs
          (id, automation_id, orchestrator_run_id, trigger_type, status, created_at, updated_at)
         VALUES
          ('acceptance-automation-run', 'acceptance-automation', 'delete-root',
           'manual', 'completed', 1, 1)`
      )
      await seedEvent(client, 'delete-root', 1, 20_200)

      const firstPreview = await lifecycle.previewDelete('delete-root', signal)
      const typedDeletePreview =
        firstPreview.disposition === 'eligible' &&
        firstPreview.eventCount === 1 &&
        typeof firstPreview.revision === 'string' &&
        REVISION_PATTERN.test(firstPreview.revision) &&
        !JSON.stringify(firstPreview).includes('CANARY_')
      assertAcceptance(typedDeletePreview, 'TYPED_DELETE_PREVIEW')

      await seedEvent(client, 'delete-root', 2, 20_300)
      const staleDelete = await lifecycle.delete('delete-root', firstPreview.revision!, signal)
      const freshPreview = await lifecycle.previewDelete('delete-root', signal)
      assertAcceptance(
        freshPreview.disposition === 'eligible' &&
          freshPreview.eventCount === 2 &&
          typeof freshPreview.revision === 'string' &&
          freshPreview.revision !== firstPreview.revision,
        'DELETE_REVISION_REFRESH'
      )
      const deleted = await lifecycle.delete('delete-root', freshPreview.revision!, signal)
      const replay = await lifecycle.delete('delete-root', freshPreview.revision!, signal)
      const authorityBoundOneShotDelete =
        staleDelete.disposition === 'stale' &&
        deleted.disposition === 'deleted' &&
        deleted.deletedEventCount === 2 &&
        replay.disposition === 'not-found' &&
        tracking.releaseCounts.get('delete-root') === 3 &&
        tracking.activeRunIds.size === 0
      assertAcceptance(authorityBoundOneShotDelete, 'AUTHORITY_BOUND_ONE_SHOT_DELETE')

      const cascadeDelete =
        numberValue(
          await scalar(client, `SELECT COUNT(*) FROM ai_orchestrator_events WHERE run_id = ?`, [
            'delete-root'
          ])
        ) === 0 &&
        (await scalar(client, `SELECT parent_run_id FROM ai_orchestrator_runs WHERE id = ?`, [
          'delete-child'
        ])) === null &&
        (await scalar(client, `SELECT orchestrator_run_id FROM ai_automation_runs WHERE id = ?`, [
          'acceptance-automation-run'
        ])) === null
      assertAcceptance(cascadeDelete, 'CASCADE_DELETE')

      let terminalRunDeletion = true
      for (const status of ['completed', 'failed', 'cancelled', 'interrupted'] as const) {
        const runId = `terminal-${status}`
        await seedRun(client, runId, status, 30_000)
        const preview = await lifecycle.previewDelete(runId, signal)
        const result =
          preview.disposition === 'eligible' && preview.revision
            ? await lifecycle.delete(runId, preview.revision, signal)
            : null
        terminalRunDeletion =
          terminalRunDeletion &&
          result?.disposition === 'deleted' &&
          numberValue(
            await scalar(client, `SELECT COUNT(*) FROM ai_orchestrator_runs WHERE id = ?`, [runId])
          ) === 0
      }
      assertAcceptance(terminalRunDeletion, 'TERMINAL_RUN_DELETION')

      let activeRunProtected = true
      for (const status of ['queued', 'pending_approval', 'running'] as const) {
        const runId = `active-${status}`
        await seedRun(client, runId, status, 500)
        const preview = await lifecycle.previewDelete(runId, signal)
        const snapshot = await store.getOrchestratorRunPrivacySnapshot(runId)
        const result = await lifecycle.delete(runId, snapshot!.revision, signal)
        activeRunProtected =
          activeRunProtected &&
          preview.disposition === 'protected' &&
          result.disposition === 'protected' &&
          numberValue(
            await scalar(client, `SELECT COUNT(*) FROM ai_orchestrator_runs WHERE id = ?`, [runId])
          ) === 1
      }
      await seedRun(client, 'authority-protected', 'completed', 500)
      const protectedPreview = await lifecycle.previewDelete('authority-protected', signal)
      const protectedSnapshot = await store.getOrchestratorRunPrivacySnapshot('authority-protected')
      const protectedDelete = await lifecycle.delete(
        'authority-protected',
        protectedSnapshot!.revision,
        signal
      )
      activeRunProtected =
        activeRunProtected &&
        protectedPreview.disposition === 'protected' &&
        protectedDelete.disposition === 'protected'
      assertAcceptance(activeRunProtected, 'ACTIVE_RUN_PROTECTED')

      return {
        typedDeletePreview: true,
        authorityBoundOneShotDelete: true,
        terminalRunDeletion: true,
        activeRunProtected: true,
        cascadeDelete: true
      }
    }
  )
}

async function seedRetentionCandidates(client: Client, prefix: string): Promise<string[]> {
  const updatedAtValues = [1_000, 1_000, 2_000, 2_000, 3_000]
  const runIds = updatedAtValues.map((_, index) => `${prefix}-${String.fromCharCode(97 + index)}`)
  for (const [index, runId] of runIds.entries()) {
    const updatedAt = updatedAtValues[index]!
    await seedRun(client, runId, 'completed', updatedAt)
    await seedEvent(client, runId, 1, updatedAt + 100)
  }
  return runIds
}

async function verifyRetentionLifecycle(
  workspace: string,
  migrationsFolder: string
): Promise<
  Pick<
    OrchestratorPrivacyGateChecks,
    'automaticRetention' | 'keysetPagination' | 'cancellationPartialCommit' | 'utf8ByteAccounting'
  >
> {
  return await withMigratedDatabase(
    workspace,
    'retention-lifecycle',
    migrationsFolder,
    async ({ client, db }) => {
      const store = createStore(db)
      const automaticIds = await seedRetentionCandidates(client, 'automatic')
      const firstPage = await store.listOrchestratorRunRetentionCandidates(CUTOFF_MS, undefined, 2)
      const secondPage = await store.listOrchestratorRunRetentionCandidates(
        CUTOFF_MS,
        firstPage.cursor,
        2
      )
      const thirdPage = await store.listOrchestratorRunRetentionCandidates(
        CUTOFF_MS,
        secondPage.cursor,
        2
      )
      const keysetPagination =
        JSON.stringify(firstPage.candidates.map((candidate) => candidate.runId)) ===
          JSON.stringify(automaticIds.slice(0, 2)) &&
        firstPage.hasMore &&
        firstPage.cursor?.updatedAt === 1_000 &&
        firstPage.cursor.runId === 'automatic-b' &&
        JSON.stringify(secondPage.candidates.map((candidate) => candidate.runId)) ===
          JSON.stringify(automaticIds.slice(2, 4)) &&
        secondPage.hasMore &&
        JSON.stringify(thirdPage.candidates.map((candidate) => candidate.runId)) ===
          JSON.stringify(automaticIds.slice(4)) &&
        !thirdPage.hasMore
      assertAcceptance(keysetPagination, 'KEYSET_PAGINATION')

      const automaticFence = createTrackingFence()
      const automaticLifecycle = createOrchestratorRunPrivacyLifecycle({
        store,
        fence: automaticFence.fence,
        limits: { batchSize: 2, maxRows: 10, maxDurationMs: 10_000 }
      })
      const signal = new AbortController().signal
      const retention = await automaticLifecycle.applyRetention(
        RETENTION_POLICY,
        RETENTION_NOW_MS,
        signal
      )
      const idempotent = await automaticLifecycle.applyRetention(
        RETENTION_POLICY,
        RETENTION_NOW_MS,
        signal
      )
      const automaticRetention =
        retention.ok &&
        retention.code === 'PRIVACY_OWNER_COMPLETED' &&
        retention.deletedItemCount === 5 &&
        retention.batches === 3 &&
        !retention.partial &&
        idempotent.ok &&
        idempotent.deletedItemCount === 0 &&
        automaticFence.activeRunIds.size === 0 &&
        automaticIds.every((runId) => automaticFence.releaseCounts.get(runId) === 1) &&
        numberValue(
          await scalar(client, `SELECT COUNT(*) FROM ai_orchestrator_runs WHERE id GLOB ?`, [
            'automatic-*'
          ])
        ) === 0
      assertAcceptance(automaticRetention, 'AUTOMATIC_RETENTION')

      await client.execute({
        sql: `INSERT INTO ai_orchestrator_runs (
          id, session_id, objective, profile_id, runtime_provider, cwd, status, output,
          error, usage, metadata, delegation_plan, approval_reason, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, ?, ?)`,
        args: [
          'utf8-byte-count',
          'session-utf8-byte-count',
          '界',
          'profile',
          'pi-core',
          '',
          'completed',
          '😀',
          900,
          1_000
        ]
      })
      await client.execute({
        sql: `INSERT INTO ai_orchestrator_events
                (id, run_id, seq, type, level, payload, created_at)
              VALUES (?, ?, 1, 'trace', 'info', ?, ?)`,
        args: ['event-utf8-byte-count', 'utf8-byte-count', '界😀', 1_100]
      })
      const utf8Page = await store.listOrchestratorRunRetentionCandidates(CUTOFF_MS, undefined, 10)
      const utf8Summary = await store.getOrchestratorRunRetentionSummary(CUTOFF_MS, 10)
      const utf8ByteAccounting =
        utf8Page.candidates.length === 1 &&
        utf8Page.candidates[0]?.runId === 'utf8-byte-count' &&
        utf8Page.candidates[0].byteCount === 14 &&
        utf8Summary.eligibleRunCount === 1 &&
        utf8Summary.eligibleByteCount === 14
      assertAcceptance(utf8ByteAccounting, 'UTF8_BYTE_ACCOUNTING')
      const utf8Snapshot = await store.getOrchestratorRunPrivacySnapshot('utf8-byte-count')
      assertAcceptance(utf8Snapshot, 'UTF8_SNAPSHOT')
      await store.deleteOrchestratorRunForPrivacy('utf8-byte-count', utf8Snapshot.revision)

      const cancellationIds = await seedRetentionCandidates(client, 'cancel')
      const cancellationController = new AbortController()
      const cancellationFence = createTrackingFence()
      const cancellationStore: OrchestratorRunPrivacyStore = {
        getOrchestratorRunPrivacySnapshot: store.getOrchestratorRunPrivacySnapshot.bind(store),
        deleteOrchestratorRunForPrivacy: store.deleteOrchestratorRunForPrivacy.bind(store),
        getOrchestratorRunRetentionSummary: store.getOrchestratorRunRetentionSummary.bind(store),
        listOrchestratorRunRetentionCandidates:
          store.listOrchestratorRunRetentionCandidates.bind(store),
        deleteOrchestratorRunsForRetention: async (runIds, cutoffMs) => {
          const result = await store.deleteOrchestratorRunsForRetention(runIds, cutoffMs)
          cancellationController.abort()
          return result
        }
      }
      const cancellationLifecycle = createOrchestratorRunPrivacyLifecycle({
        store: cancellationStore,
        fence: cancellationFence.fence,
        limits: { batchSize: 2, maxRows: 10, maxDurationMs: 10_000 }
      })
      const cancellation = await cancellationLifecycle.applyRetention(
        RETENTION_POLICY,
        RETENTION_NOW_MS,
        cancellationController.signal
      )
      const remaining = await client.execute(
        `SELECT id FROM ai_orchestrator_runs WHERE id GLOB 'cancel-*' ORDER BY id`
      )
      const cancellationPartialCommit =
        !cancellation.ok &&
        cancellation.code === 'PRIVACY_OWNER_CANCELLED' &&
        cancellation.deletedItemCount === 2 &&
        cancellation.batches === 1 &&
        cancellation.partial &&
        cancellation.cancelled &&
        JSON.stringify(remaining.rows.map((row) => String(row.id))) ===
          JSON.stringify(cancellationIds.slice(2)) &&
        cancellationFence.activeRunIds.size === 0 &&
        cancellationFence.releaseCounts.get('cancel-a') === 1 &&
        cancellationFence.releaseCounts.get('cancel-b') === 1
      assertAcceptance(cancellationPartialCommit, 'CANCELLATION_PARTIAL_COMMIT')

      return {
        automaticRetention: true,
        keysetPagination: true,
        cancellationPartialCommit: true,
        utf8ByteAccounting: true
      }
    }
  )
}

async function readMigrationJournal(migrationsFolder: string): Promise<MigrationJournal> {
  const raw = JSON.parse(
    await readFile(path.join(migrationsFolder, 'meta', '_journal.json'), 'utf8')
  ) as Partial<MigrationJournal>
  assertAcceptance(
    typeof raw.version === 'string' &&
      typeof raw.dialect === 'string' &&
      Array.isArray(raw.entries) &&
      raw.entries.length > 0,
    'MIGRATION_JOURNAL_INVALID'
  )
  const entries = raw.entries as MigrationJournal['entries']
  assertAcceptance(
    entries.every(
      (entry) =>
        entry &&
        typeof entry.tag === 'string' &&
        SAFE_MIGRATION_TAG.test(entry.tag) &&
        Number.isSafeInteger(entry.when) &&
        entry.when >= 0
    ) && new Set(entries.map((entry) => entry.tag)).size === entries.length,
    'MIGRATION_JOURNAL_ENTRY_INVALID'
  )
  return { ...raw, entries } as MigrationJournal
}

async function stageMigrationChain(
  migrationsFolder: string,
  journal: MigrationJournal,
  targetFolder: string,
  entryCount: number,
  lastMigrationOverride?: string
): Promise<void> {
  const entries = journal.entries.slice(0, entryCount)
  assertAcceptance(entries.length === entryCount, 'MIGRATION_STAGE_RANGE')
  await mkdir(path.join(targetFolder, 'meta'), { recursive: true })
  await writeFile(
    path.join(targetFolder, 'meta', '_journal.json'),
    `${JSON.stringify({ ...journal, entries }, null, 2)}\n`,
    'utf8'
  )
  for (const entry of entries) {
    const source = path.join(migrationsFolder, `${entry.tag}.sql`)
    const content = await readFile(source, 'utf8')
    assertAcceptance(content.trim().length > 0, 'MIGRATION_SOURCE_EMPTY')
    await writeFile(path.join(targetFolder, `${entry.tag}.sql`), content, 'utf8')
  }
  if (lastMigrationOverride !== undefined && entries.length > 0) {
    await writeFile(
      path.join(targetFolder, `${entries.at(-1)!.tag}.sql`),
      lastMigrationOverride,
      'utf8'
    )
  }
}

async function verifyJournaledMigration(
  workspace: string,
  migrationsFolder: string
): Promise<Pick<OrchestratorPrivacyGateChecks, 'cascadeDelete' | 'journaledMigration'>> {
  const journal = await readMigrationJournal(migrationsFolder)
  const target = journal.entries.findIndex(
    (entry) => entry.tag === ORCHESTRATOR_RETENTION_MIGRATION
  )
  assertAcceptance(target > 0, 'ORCHESTRATOR_MIGRATION_MISSING')
  assertAcceptance(
    journal.entries[target - 1]?.tag === PREVIOUS_ORCHESTRATOR_MIGRATION,
    'ORCHESTRATOR_MIGRATION_PREDECESSOR'
  )

  const upgradeFolder = path.join(workspace, 'upgrade-migrations')
  const upgradeDatabase = await openDatabase(path.join(workspace, 'upgrade.sqlite'))
  let upgraded = false
  let migrationCascade = false
  try {
    await stageMigrationChain(migrationsFolder, journal, upgradeFolder, target)
    await migrate(upgradeDatabase.db, { migrationsFolder: upgradeFolder })
    await seedRun(upgradeDatabase.client, 'migration-run', 'completed', 4)
    await seedEvent(upgradeDatabase.client, 'migration-run', 1, 5)
    await seedRun(upgradeDatabase.client, 'migration-run-peer', 'failed', 4)
    await seedEvent(upgradeDatabase.client, 'migration-run-peer', 1, 6)
    await seedRun(upgradeDatabase.client, 'migration-run-active', 'running', 1)
    await seedRun(upgradeDatabase.client, 'migration-run-cutoff', 'cancelled', CUTOFF_MS)
    await seedRun(upgradeDatabase.client, 'migration-run-fresh-event', 'completed', 2)
    await seedEvent(upgradeDatabase.client, 'migration-run-fresh-event', 1, CUTOFF_MS)
    await upgradeDatabase.client.execute(STALE_ORCHESTRATOR_RETENTION_INDEX_SQL)

    await stageMigrationChain(migrationsFolder, journal, upgradeFolder, target + 1)
    await migrate(upgradeDatabase.db, { migrationsFolder: upgradeFolder })
    const indexRows = await upgradeDatabase.client.execute(
      `SELECT sql FROM sqlite_master
       WHERE type = 'index' AND name = '${ORCHESTRATOR_RETENTION_INDEX}'`
    )
    const authoritativeIndexSql =
      indexRows.rows.length === 1 &&
      normalizeSql(indexRows.rows[0]?.sql) ===
        normalizeSql(EXPECTED_ORCHESTRATOR_RETENTION_INDEX_SQL)
    assertAcceptance(authoritativeIndexSql, 'MIGRATION_INDEX_SQL')

    const indexColumns = await upgradeDatabase.client.execute(
      `PRAGMA index_xinfo('${ORCHESTRATOR_RETENTION_INDEX}')`
    )
    const authoritativeIndexColumns =
      JSON.stringify(
        indexColumns.rows
          .filter((row) => Number(row.key) === 1)
          .map((row) => ({ name: String(row.name), descending: Number(row.desc) }))
      ) ===
      JSON.stringify([
        { name: 'updated_at', descending: 0 },
        { name: 'id', descending: 0 }
      ])
    assertAcceptance(authoritativeIndexColumns, 'MIGRATION_INDEX_COLUMNS')

    const queryPlan = await upgradeDatabase.client.execute(
      `EXPLAIN QUERY PLAN ${ORCHESTRATOR_RETENTION_QUERY}`
    )
    const queryPlanDetail = queryPlan.rows.map((row) => String(row.detail)).join(' ')
    const authoritativeQueryPlan =
      queryPlanDetail.includes(ORCHESTRATOR_RETENTION_INDEX) &&
      !queryPlanDetail.includes('USE TEMP B-TREE')
    assertAcceptance(authoritativeQueryPlan, 'MIGRATION_INDEX_QUERY_PLAN')

    const productionPage = await createStore(
      upgradeDatabase.db
    ).listOrchestratorRunRetentionCandidates(CUTOFF_MS, undefined, 10)
    const productionQueryResult =
      JSON.stringify(productionPage.candidates.map((candidate) => candidate.runId)) ===
        JSON.stringify(['migration-run', 'migration-run-peer']) && !productionPage.hasMore
    assertAcceptance(productionQueryResult, 'MIGRATION_INDEX_QUERY')

    const foreignKeys = await upgradeDatabase.client.execute(
      `PRAGMA foreign_key_list('ai_orchestrator_events')`
    )
    const journalCount = numberValue(
      await scalar(upgradeDatabase.client, 'SELECT COUNT(*) FROM __drizzle_migrations')
    )
    upgraded =
      journalCount === target + 1 &&
      authoritativeIndexSql &&
      authoritativeIndexColumns &&
      authoritativeQueryPlan &&
      productionQueryResult &&
      foreignKeys.rows.some(
        (row) =>
          row.table === 'ai_orchestrator_runs' &&
          row.from === 'run_id' &&
          row.to === 'id' &&
          row.on_delete === 'CASCADE'
      ) &&
      numberValue(
        await scalar(
          upgradeDatabase.client,
          `SELECT COUNT(*) FROM ai_orchestrator_runs WHERE id = ?`,
          ['migration-run']
        )
      ) === 1
    assertAcceptance(upgraded, 'MIGRATION_UPGRADE')

    await upgradeDatabase.client.execute(
      `DELETE FROM ai_orchestrator_runs WHERE id = 'migration-run'`
    )
    migrationCascade =
      numberValue(
        await scalar(
          upgradeDatabase.client,
          `SELECT COUNT(*) FROM ai_orchestrator_events WHERE run_id = ?`,
          ['migration-run']
        )
      ) === 0
    assertAcceptance(migrationCascade, 'MIGRATION_CASCADE')
  } finally {
    upgradeDatabase.client.close()
  }

  const rollbackFolder = path.join(workspace, 'rollback-migrations')
  const rollbackDatabase = await openDatabase(path.join(workspace, 'rollback.sqlite'))
  let rolledBack = false
  try {
    await stageMigrationChain(migrationsFolder, journal, rollbackFolder, target)
    await migrate(rollbackDatabase.db, { migrationsFolder: rollbackFolder })
    await seedRun(rollbackDatabase.client, 'rollback-run', 'completed', 2)
    await seedEvent(rollbackDatabase.client, 'rollback-run', 1, 3)
    const migrationSql = await readFile(
      path.join(migrationsFolder, `${ORCHESTRATOR_RETENTION_MIGRATION}.sql`),
      'utf8'
    )
    await stageMigrationChain(
      migrationsFolder,
      journal,
      rollbackFolder,
      target + 1,
      `${migrationSql}
--> statement-breakpoint
ALTER TABLE ai_orchestrator_runs ADD COLUMN acceptance_rollback_probe text;
--> statement-breakpoint
UPDATE ai_orchestrator_runs
SET objective = 'MUTATED_OBJECTIVE', output = 'MUTATED_OUTPUT'
WHERE id = 'rollback-run';
--> statement-breakpoint
CREATE INDEX impossible_acceptance_index ON missing_acceptance_table (id);`
    )
    let migrationRejected = false
    try {
      await migrate(rollbackDatabase.db, { migrationsFolder: rollbackFolder })
    } catch {
      migrationRejected = true
    }
    const columns = await rollbackDatabase.client.execute(
      `PRAGMA table_info('ai_orchestrator_runs')`
    )
    const row = await rollbackDatabase.client.execute(
      `SELECT objective, output FROM ai_orchestrator_runs WHERE id = 'rollback-run'`
    )
    const indexCount = numberValue(
      await scalar(
        rollbackDatabase.client,
        `SELECT COUNT(*) FROM sqlite_master
         WHERE type = 'index' AND name = '${ORCHESTRATOR_RETENTION_INDEX}'`
      )
    )
    const journalCount = numberValue(
      await scalar(rollbackDatabase.client, 'SELECT COUNT(*) FROM __drizzle_migrations')
    )
    rolledBack =
      migrationRejected &&
      indexCount === 0 &&
      !columns.rows.some((column) => column.name === 'acceptance_rollback_probe') &&
      row.rows[0]?.objective === 'CANARY_OBJECTIVE_rollback-run' &&
      row.rows[0]?.output === 'CANARY_OUTPUT_rollback-run' &&
      journalCount === target
    assertAcceptance(rolledBack, 'MIGRATION_ROLLBACK')
  } finally {
    rollbackDatabase.client.close()
  }

  assertAcceptance(upgraded && rolledBack, 'JOURNALED_MIGRATION')
  return { cascadeDelete: true, journaledMigration: true }
}

export async function runOrchestratorPrivacyAcceptance(
  options: OrchestratorPrivacyAcceptanceOptions
): Promise<OrchestratorPrivacyGateChecks> {
  const workspace = await mkdtemp(path.join(options.temporaryRoot, 'orchestrator-privacy-'))
  try {
    const [deleteChecks, retentionChecks, migrationChecks] = await Promise.all([
      verifyDeleteLifecycle(workspace, options.migrationsFolder),
      verifyRetentionLifecycle(workspace, options.migrationsFolder),
      verifyJournaledMigration(workspace, options.migrationsFolder)
    ])
    assertAcceptance(deleteChecks.cascadeDelete && migrationChecks.cascadeDelete, 'CASCADE_PARITY')
    return Object.freeze({
      typedDeletePreview: deleteChecks.typedDeletePreview,
      authorityBoundOneShotDelete: deleteChecks.authorityBoundOneShotDelete,
      terminalRunDeletion: deleteChecks.terminalRunDeletion,
      activeRunProtected: deleteChecks.activeRunProtected,
      automaticRetention: retentionChecks.automaticRetention,
      keysetPagination: retentionChecks.keysetPagination,
      cancellationPartialCommit: retentionChecks.cancellationPartialCommit,
      cascadeDelete: true,
      journaledMigration: migrationChecks.journaledMigration,
      utf8ByteAccounting: retentionChecks.utf8ByteAccounting
    })
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
}
