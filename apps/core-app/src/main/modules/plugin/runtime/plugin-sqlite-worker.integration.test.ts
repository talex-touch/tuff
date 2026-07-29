import type {
  PluginSqliteWorkerOperation,
  PluginSqliteWorkerResponse
} from './plugin-sqlite-worker-protocol'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Worker } from 'node:worker_threads'
import { afterEach, describe, expect, it } from 'vitest'
import { resolvePluginSqliteDatabasePath } from './plugin-sqlite-resource-owner'
import { PluginSqliteWorkerClient } from './plugin-sqlite-worker-client'

const workerPath = path.resolve('out/main/plugin-sqlite-worker.js')
const describeBuiltWorker = existsSync(workerPath) ? describe : describe.skip

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

  it('maps the worker-owned database cap to a stable quota error', async () => {
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
    for (let index = 0; index < 700; index += 1) {
      const response = await invokeWorker(worker, {
        type: 'execute',
        sql: 'INSERT INTO blobs VALUES (?)',
        params: [new Uint8Array(100_000)]
      })
      if (response.type === 'error') {
        quotaResponse = response
        break
      }
    }

    expect(quotaResponse).toMatchObject({ type: 'error', code: 'PLUGIN_SQLITE_DISK_QUOTA' })
  }, 15_000)
})
