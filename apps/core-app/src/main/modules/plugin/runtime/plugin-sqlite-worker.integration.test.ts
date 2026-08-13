import type {
  PluginSqliteWorkerOperation,
  PluginSqliteWorkerResponse
} from './plugin-sqlite-worker-protocol'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import { Worker } from 'node:worker_threads'
import { afterEach, describe, expect, it } from 'vitest'
import { resolvePluginSqliteDatabasePath } from './plugin-sqlite-resource-owner'
import { PluginSqliteWorkerClient } from './plugin-sqlite-worker-client'

/**
 * Resolved from this file, not from process.cwd().
 *
 * `path.resolve('out/main/...')` is CWD-relative, so running vitest from the repository root
 * rather than from apps/core-app pointed at a path that does not exist — and the suite then
 * skipped itself rather than saying so (#926).
 */
const workerPath = fileURLToPath(
  new URL('../../../../../out/main/plugin-sqlite-worker.js', import.meta.url)
)

/**
 * Skipping is now opt-in rather than automatic.
 *
 * These are the plugin SQLite sandbox checks, including the symlink-escape assertions. When
 * the worker artifact was missing the whole describe block became `describe.skip`, so a
 * regression in resolvePluginSqliteDatabasePath shipped as a green run. A suite that converts
 * itself to a no-op is indistinguishable from a suite that passed.
 *
 * Set TUFF_SKIP_SQLITE_WORKER_TESTS=1 to skip deliberately; otherwise a missing artifact is a
 * failure that names the build command.
 */
const SKIP_ENV_VAR = 'TUFF_SKIP_SQLITE_WORKER_TESTS'
const skipRequested = process.env[SKIP_ENV_VAR] === '1'
const workerBuilt = existsSync(workerPath)

describe('plugin sqlite worker artifact', () => {
  it('is built, or skipping was asked for explicitly', () => {
    if (skipRequested || workerBuilt) {
      expect(true).toBe(true)
      return
    }

    throw new Error(
      `Missing ${workerPath}.\n` +
        'These are the plugin SQLite sandbox tests; without the worker they cannot run.\n' +
        'Build it with `pnpm -C apps/core-app exec electron-vite build`, or set ' +
        `${SKIP_ENV_VAR}=1 to skip deliberately.`
    )
  })
})

const describeBuiltWorker = workerBuilt ? describe : describe.skip

function createWorker(databasePath: string): Worker {
  return new Worker(workerPath, {
    workerData: { databasePath },
    resourceLimits: {
      maxOldGenerationSizeMb: 64,
      maxYoungGenerationSizeMb: 16,
      stackSizeMb: 4
    }
  })
}

function invokeWorker(
  worker: Worker,
  operation: PluginSqliteWorkerOperation
): Promise<PluginSqliteWorkerResponse> {
  const requestId = `integration-${Date.now()}-${Math.random()}`
  return new Promise((resolve, reject) => {
    let timeout: ReturnType<typeof setTimeout>
    const handlers = {
      onMessage(response: PluginSqliteWorkerResponse) {
        if (response.requestId !== requestId) return
        clearTimeout(timeout)
        worker.off('message', handlers.onMessage)
        worker.off('error', handlers.onError)
        resolve(response)
      },
      onError(error: Error) {
        clearTimeout(timeout)
        worker.off('message', handlers.onMessage)
        worker.off('error', handlers.onError)
        reject(error)
      }
    }
    timeout = setTimeout(() => {
      worker.off('message', handlers.onMessage)
      worker.off('error', handlers.onError)
      reject(new Error('PLUGIN_SQLITE_INTEGRATION_TIMEOUT'))
    }, 10_000)
    worker.on('message', handlers.onMessage)
    worker.on('error', handlers.onError)
    worker.postMessage({ requestId, operation })
  })
}

/**
 * The quota test's budget, spelled out rather than picked (#1688).
 *
 * Its cost is `round trips x per-round-trip latency`, and the second term is scheduling time on a
 * shared runner. 90ms is 30x the 3.0ms measured on an idle CI runner, which is what it takes to
 * survive the tail rather than the median.
 */
const QUOTA_WRITE_BYTES = 100_000
const QUOTA_ROUND_TRIP_CEILING = 700
const QUOTA_MS_PER_ROUND_TRIP = 90
const QUOTA_TIMEOUT_MS = QUOTA_ROUND_TRIP_CEILING * QUOTA_MS_PER_ROUND_TRIP

describeBuiltWorker('built plugin SQLite worker', () => {
  const workers: Worker[] = []
  const clients: PluginSqliteWorkerClient[] = []
  const roots: string[] = []

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((client) => client.close()))
    await Promise.all(workers.splice(0).map((worker) => worker.terminate()))
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
  })

  it('enforces worker-side SQL policy and executes bounded CRUD', async () => {
    const root = await realpath(await mkdtemp(path.join(tmpdir(), 'tuff-plugin-sqlite-worker-')))
    roots.push(root)
    const worker = createWorker(path.join(root, 'plugin.sqlite'))
    workers.push(worker)

    await expect(
      invokeWorker(worker, {
        type: 'query',
        sql: 'SELECT * FROM pragma_database_list',
        params: []
      })
    ).resolves.toMatchObject({
      type: 'error',
      code: 'PLUGIN_SQLITE_STATEMENT_DENIED'
    })
    await expect(
      invokeWorker(worker, {
        type: 'execute',
        sql: 'CREATE TABLE notes(id INTEGER, body TEXT)',
        params: []
      })
    ).resolves.toMatchObject({ type: 'result' })
    await expect(
      invokeWorker(worker, {
        type: 'transaction',
        statements: [
          { sql: 'INSERT INTO notes VALUES (?, ?)', params: [1, 'alpha'] },
          { sql: 'INSERT INTO notes VALUES (?, ?)', params: [2, 'beta'] }
        ]
      })
    ).resolves.toMatchObject({ type: 'result' })
    await expect(
      invokeWorker(worker, {
        type: 'query',
        sql: 'SELECT id, body FROM notes ORDER BY id',
        params: []
      })
    ).resolves.toMatchObject({
      type: 'result',
      result: {
        rows: [
          { id: 1, body: 'alpha' },
          { id: 2, body: 'beta' }
        ]
      }
    })
  })

  it('opens browser-history copies query-only and rejects every non-fixed SQL shape', async () => {
    const root = await realpath(await mkdtemp(path.join(tmpdir(), 'tuff-plugin-sqlite-readonly-')))
    roots.push(root)
    const databasePath = path.join(root, 'browser-history.sqlite')
    const setupClient = new PluginSqliteWorkerClient(databasePath, { workerPath })
    clients.push(setupClient)
    await setupClient.execute('CREATE TABLE urls(url TEXT)', [])
    await setupClient.execute('INSERT INTO urls VALUES (?)', ['https://example.com/'])
    await setupClient.close()
    clients.splice(clients.indexOf(setupClient), 1)

    const readOnlyClient = new PluginSqliteWorkerClient(databasePath, {
      workerPath,
      readOnly: true
    })
    clients.push(readOnlyClient)
    await expect(readOnlyClient.query('SELECT url FROM urls', [])).resolves.toMatchObject({
      rows: [{ url: 'https://example.com/' }]
    })
    await expect(
      readOnlyClient.execute('INSERT INTO urls VALUES (?)', ['https://forbidden.example/'])
    ).rejects.toMatchObject({ code: 'PLUGIN_SQLITE_SQL_INVALID' })
    await expect(
      readOnlyClient.transaction([
        { sql: 'INSERT INTO urls VALUES (?)', params: ['https://forbidden.example/'] }
      ])
    ).rejects.toMatchObject({ code: 'PLUGIN_SQLITE_SQL_INVALID' })
    await expect(
      readOnlyClient.query('SELECT url FROM urls; SELECT url FROM urls', [])
    ).rejects.toMatchObject({ code: 'PLUGIN_SQLITE_STATEMENT_LIMIT' })
    await expect(readOnlyClient.query('PRAGMA database_list', [])).rejects.toMatchObject({
      code: 'PLUGIN_SQLITE_STATEMENT_DENIED'
    })
    await expect(
      readOnlyClient.query("ATTACH DATABASE '/tmp/other.sqlite' AS other", [])
    ).rejects.toMatchObject({ code: 'PLUGIN_SQLITE_STATEMENT_DENIED' })
  })

  it('returns stable row and result byte limit errors', async () => {
    const root = await realpath(await mkdtemp(path.join(tmpdir(), 'tuff-plugin-sqlite-limits-')))
    roots.push(root)
    const worker = createWorker(path.join(root, 'plugin.sqlite'))
    workers.push(worker)

    await invokeWorker(worker, {
      type: 'execute',
      sql: 'CREATE TABLE numbers(value INTEGER)',
      params: []
    })
    const values = Array.from({ length: 1_001 }, (_, index) => `(${index})`).join(',')
    await invokeWorker(worker, {
      type: 'execute',
      sql: `INSERT INTO numbers VALUES ${values}`,
      params: []
    })
    await expect(
      invokeWorker(worker, { type: 'query', sql: 'SELECT value FROM numbers', params: [] })
    ).resolves.toMatchObject({ type: 'error', code: 'PLUGIN_SQLITE_ROW_LIMIT' })

    await invokeWorker(worker, {
      type: 'execute',
      sql: 'CREATE TABLE blobs(value BLOB)',
      params: []
    })
    for (let index = 0; index < 5; index += 1) {
      await invokeWorker(worker, {
        type: 'execute',
        sql: 'INSERT INTO blobs VALUES (?)',
        params: [new Uint8Array(900_000)]
      })
    }
    await expect(
      invokeWorker(worker, { type: 'query', sql: 'SELECT value FROM blobs', params: [] })
    ).resolves.toMatchObject({ type: 'error', code: 'PLUGIN_SQLITE_RESULT_TOO_LARGE' })
  })

  it('rejects a database symlink inserted after host path validation', async () => {
    const root = await realpath(await mkdtemp(path.join(tmpdir(), 'tuff-plugin-sqlite-swap-')))
    roots.push(root)
    const ownerPath = path.join(root, 'plugins', 'alpha')
    await mkdir(path.join(ownerPath, 'data'), { recursive: true })
    const databasePath = await resolvePluginSqliteDatabasePath(path.join(ownerPath, 'data'))
    const outsideDatabase = path.join(root, 'outside.sqlite')
    await writeFile(outsideDatabase, '')
    await symlink(outsideDatabase, databasePath)

    const client = new PluginSqliteWorkerClient(databasePath, { workerPath })
    clients.push(client)
    await expect(client.query('SELECT 1', [])).rejects.toMatchObject({
      code: 'PLUGIN_SQLITE_SYMLINK_DENIED'
    })
  })

  it('terminates timed-out read and write workers and recovers without a late write', async () => {
    const root = await realpath(await mkdtemp(path.join(tmpdir(), 'tuff-plugin-sqlite-timeout-')))
    roots.push(root)
    const databasePath = path.join(root, 'plugin.sqlite')
    const setupWorker = createWorker(databasePath)
    workers.push(setupWorker)

    await invokeWorker(setupWorker, {
      type: 'execute',
      sql: 'CREATE TABLE numbers(value INTEGER)',
      params: []
    })
    const values = Array.from({ length: 500 }, (_, index) => `(${index + 1})`).join(',')
    await invokeWorker(setupWorker, {
      type: 'execute',
      sql: `INSERT INTO numbers VALUES ${values}`,
      params: []
    })
    await setupWorker.terminate()
    workers.splice(workers.indexOf(setupWorker), 1)

    const slowCount = 'SELECT count(*) AS total FROM numbers a, numbers b, numbers c'
    const readClient = new PluginSqliteWorkerClient(databasePath, {
      workerPath,
      queryTimeoutMs: 20
    })
    clients.push(readClient)
    await expect(readClient.query(slowCount, [])).rejects.toMatchObject({
      code: 'PLUGIN_SQLITE_TIMEOUT'
    })
    expect(readClient.isClosed).toBe(true)

    const writeClient = new PluginSqliteWorkerClient(databasePath, {
      workerPath,
      writeTimeoutMs: 20
    })
    clients.push(writeClient)
    await expect(
      writeClient.execute(
        `UPDATE numbers SET value = value + (${slowCount.replace(' AS total', '')})`,
        []
      )
    ).rejects.toMatchObject({ code: 'PLUGIN_SQLITE_TIMEOUT' })
    expect(writeClient.isClosed).toBe(true)

    const replacement = new PluginSqliteWorkerClient(databasePath, { workerPath })
    clients.push(replacement)
    await expect(
      replacement.query('SELECT min(value) AS minimum, max(value) AS maximum FROM numbers', [])
    ).resolves.toMatchObject({
      rows: [{ minimum: 1, maximum: 500 }]
    })
  })

  /**
   * This is the file's only flaky test (#1688), and the reason is its shape rather than its
   * logic: filling a 64 MiB database 100 KB at a time is 668 serialised worker round trips.
   *
   * Each round trip is a `postMessage` and a reply, so its cost is a scheduling quantity. On an
   * idle CI runner the whole test is 2.02s (~3.0ms per round trip); on the run that failed it
   * passed 15s (>22ms per round trip) while the suite as a whole was only 40% slower. Contention
   * does not slow this test proportionally — it multiplies by 668.
   *
   * ## Why the round trips cannot be reduced
   *
   * Four ways of writing more per round trip were measured against the built worker, and each
   * one dies on a *different* limit before reaching the disk quota:
   *
   * | attempt | outcome |
   * | --- | --- |
   * | 1 MiB rows (the `PLUGIN_SQL_MAX_PARAM_BYTES` ceiling) | `PLUGIN_SQLITE_UNAVAILABLE` at ~40 |
   * | 8 × 100 KB rows per statement | `PLUGIN_SQLITE_UNAVAILABLE` at ~38 |
   * | `INSERT INTO blobs SELECT value FROM blobs` (doubling) | `PLUGIN_SQLITE_UNAVAILABLE` at 9 |
   * | `randomblob(100000)`, generated server-side | `PLUGIN_SQLITE_STATEMENT_DENIED` |
   *
   * The first three are the worker's own `maxOldGenerationSizeMb: 64`: a bigger param means a
   * bigger retained copy per message, and the worker runs out of V8 heap long before the
   * database runs out of its 64 MiB. The fourth is `plugin-sql-policy` refusing a function call,
   * which is a rule this suite exists to protect. 100 KB × 1 row is the largest write that
   * survives to the quota, which is why the loop looks like this.
   *
   * ## What the budget is
   *
   * 668 round trips × 90ms, which is 30× the measured idle-CI rate. It is derived from the round
   * trip count rather than raised until the failure stopped, and the assertion below pins that
   * count so a change making the loop need ten times as many round trips fails on the count
   * rather than quietly eating the budget.
   */
  it(
    'maps the worker-owned database cap to a stable quota error',
    { timeout: QUOTA_TIMEOUT_MS },
    async () => {
      const root = await realpath(await mkdtemp(path.join(tmpdir(), 'tuff-plugin-sqlite-quota-')))
      roots.push(root)
      const worker = createWorker(path.join(root, 'plugin.sqlite'))
      workers.push(worker)

      await invokeWorker(worker, {
        type: 'execute',
        sql: 'CREATE TABLE blobs(value BLOB)',
        params: []
      })
      let quotaResponse: PluginSqliteWorkerResponse | undefined
      let roundTrips = 0
      for (let index = 0; index < QUOTA_ROUND_TRIP_CEILING; index += 1) {
        roundTrips += 1
        const response = await invokeWorker(worker, {
          type: 'execute',
          sql: 'INSERT INTO blobs VALUES (?)',
          params: [new Uint8Array(QUOTA_WRITE_BYTES)]
        })
        if (response.type === 'error') {
          quotaResponse = response
          break
        }
      }

      expect(quotaResponse).toMatchObject({ type: 'error', code: 'PLUGIN_SQLITE_DISK_QUOTA' })

      // The budget above is round trips x 90ms, so the count is what it has to hold. 668 on every
      // machine measured; the window allows for page-size and overhead differences without
      // allowing a change that makes the loop an order of magnitude longer.
      expect(roundTrips).toBeGreaterThan(600)
      expect(roundTrips).toBeLessThan(700)
    }
  )
})
