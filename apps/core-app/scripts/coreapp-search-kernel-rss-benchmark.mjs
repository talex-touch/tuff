#!/usr/bin/env node
/**
 * Cross-process Search & Index Kernel SQLite + RSS Isolation Benchmark (Pure Node, NO Electron).
 *
 * Compares:
 *   Mode A (current architecture): Main process hosts `search-index-worker.js` and
 *     `search-index-read-worker.js` as in-process `worker_threads.Worker` instances.
 *   Mode B (Phase 1 kernel architecture): Main process forks the built
 *     `out/main/search-kernel-process.js` as a separate OS child process via `child_process.fork`
 *     with a `process.parentPort` shim, routing writes/queries/semantic-search over IPC.
 *
 * Usage:
 *   node apps/core-app/scripts/coreapp-search-kernel-rss-benchmark.mjs
 *   node apps/core-app/scripts/coreapp-search-kernel-rss-benchmark.mjs --items=5000 --embeddings=500
 */
import { execFileSync, fork } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const coreAppDir = path.resolve(__dirname, '..')
const defaultOutMainDir = path.join(coreAppDir, 'out', 'main')

const SEARCH_KERNEL_PROTOCOL_VERSION = 1
const SEARCH_KERNEL_TASKS = {
  WRITER_REQUEST: 'search-index.writer.request',
  WRITER_CLOSE: 'search-index.writer.close',
  READER_QUERY: 'search-index.reader.query',
  READER_SEMANTIC_SEARCH: 'search-index.reader.semantic-search',
  READER_CANCEL: 'search-index.reader.cancel',
  READER_RETIRE: 'search-index.reader.retire'
}

const EMBEDDING_MODEL = 'bench-embed-v1'
const PROVIDER_ID = 'file-provider'
const VOCAB = [
  'invoice',
  'quarterly',
  'architecture',
  'telemetry',
  'benchmark',
  'roadmap',
  'kernel',
  'sqlite',
  'embedding',
  'snapshot',
  'renderer',
  'workflow',
  'migration',
  'diagnostics',
  'transcript',
  'manifest',
  'protocol',
  'schedule',
  'compaction',
  'workspace'
]

function parseArgs(argv) {
  const result = {}
  for (const token of argv) {
    if (!token.startsWith('--')) continue
    const eq = token.indexOf('=')
    if (eq === -1) {
      result[token.slice(2)] = 'true'
    } else {
      result[token.slice(2, eq)] = token.slice(eq + 1)
    }
  }
  return result
}

function positiveInt(raw, fallback) {
  const num = Number(raw)
  return Number.isFinite(num) && num > 0 ? Math.floor(num) : fallback
}

function bytesToMiB(bytes) {
  return Number((bytes / (1024 * 1024)).toFixed(2))
}

function roundMs(ms) {
  return Number(ms.toFixed(1))
}

function encodeVectorBlob(vector) {
  const bytes = new Uint8Array(vector.length * Float32Array.BYTES_PER_ELEMENT)
  const view = new DataView(bytes.buffer)
  for (let i = 0; i < vector.length; i += 1) {
    view.setFloat32(i * Float32Array.BYTES_PER_ELEMENT, vector[i], true)
  }
  return bytes
}

function makeNormalizedVector(seed, dims) {
  const vec = new Array(dims)
  let sumSq = 0
  for (let i = 0; i < dims; i += 1) {
    const val = Math.sin((seed + 1) * 0.37 + i * 0.19) + Math.cos((seed + 3) * 0.11 - i * 0.07)
    vec[i] = val
    sumSq += val * val
  }
  const norm = Math.sqrt(sumSq) || 1
  for (let i = 0; i < dims; i += 1) {
    vec[i] = vec[i] / norm
  }
  return vec
}

function buildSyntheticBatch(startIndex, count) {
  const records = []
  const items = []
  const nowSec = Math.floor(Date.now() / 1000)

  for (let offset = 0; offset < count; offset += 1) {
    const idx = startIndex + offset
    const wordA = VOCAB[idx % VOCAB.length]
    const wordB = VOCAB[(idx * 7 + 3) % VOCAB.length]
    const wordC = VOCAB[(idx * 13 + 5) % VOCAB.length]
    const fileName = `${wordA}-${wordB}-${String(idx).padStart(5, '0')}.md`
    const filePath = `/bench/workspace/${wordC}/${fileName}`
    const itemId = `file:${filePath}`

    records.push({
      path: filePath,
      name: fileName,
      extension: '.md',
      size: 1024 + (idx % 4096),
      mtime: (nowSec - (idx % 86400)) * 1000,
      ctime: (nowSec - (idx % 86400)) * 1000,
      lastIndexedAt: nowSec * 1000,
      isDir: false,
      type: 'file'
    })

    items.push({
      itemId,
      providerId: PROVIDER_ID,
      type: 'file',
      name: fileName,
      displayName: `${wordA} ${wordB} report #${idx}`,
      description: `Synthetic benchmark document covering ${wordA}, ${wordB}, and ${wordC}`,
      path: filePath,
      extension: '.md',
      tags: [wordA, wordB],
      keywords: [
        { value: wordA, priority: 1.5 },
        { value: wordB, priority: 1.2 },
        { value: `${wordA}${idx % 50}`, priority: 1.0 }
      ],
      content: `Document ${idx}: ${wordA} ${wordB} ${wordC} latency isolation benchmark corpus entry.`,
      indexPathKeywords: false
    })
  }

  return { records, items }
}

function readOsPidRssBytes(pid) {
  if (!pid || pid <= 0) return 0
  try {
    const output = execFileSync('ps', ['-o', 'rss=', '-p', String(pid)], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim()
    const kb = Number.parseInt(output, 10)
    return Number.isFinite(kb) && kb > 0 ? kb * 1024 : 0
  } catch {
    return 0
  }
}

async function runInitDbRole(args) {
  const dbPath = args.db
  if (!dbPath) throw new Error('--db is required for init-db role')
  const requireFromCoreApp = createRequire(path.join(coreAppDir, 'package.json'))
  const { createClient } = requireFromCoreApp('@libsql/client')
  const client = createClient({ url: `file:${dbPath}` })
  try {
    await client.execute('PRAGMA journal_mode = WAL')
    await client.execute(`
      CREATE TABLE IF NOT EXISTS files (
        id INTEGER PRIMARY KEY,
        path TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        display_name TEXT,
        extension TEXT,
        size INTEGER,
        mtime INTEGER NOT NULL,
        ctime INTEGER NOT NULL,
        last_indexed_at INTEGER NOT NULL DEFAULT 0,
        is_dir INTEGER NOT NULL DEFAULT 0,
        type TEXT NOT NULL DEFAULT 'file',
        content TEXT,
        embedding_status TEXT NOT NULL DEFAULT 'none'
      )
    `)
    await client.execute(`
      CREATE TABLE IF NOT EXISTS file_extensions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
        key TEXT NOT NULL,
        value TEXT NOT NULL
      )
    `)
    await client.execute(`
      CREATE TABLE IF NOT EXISTS file_index_progress (
        file_id INTEGER NOT NULL PRIMARY KEY REFERENCES files(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'pending',
        progress INTEGER NOT NULL DEFAULT 0,
        processed_bytes INTEGER,
        total_bytes INTEGER,
        last_error TEXT,
        started_at INTEGER,
        updated_at INTEGER NOT NULL DEFAULT 0
      )
    `)
    await client.execute(`
      CREATE TABLE IF NOT EXISTS embeddings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_id TEXT NOT NULL,
        source_type TEXT NOT NULL,
        embedding TEXT NOT NULL,
        model TEXT NOT NULL,
        content_hash TEXT,
        created_at INTEGER NOT NULL DEFAULT 0
      )
    `)
    await client.execute(`
      CREATE TABLE IF NOT EXISTS scan_progress (
        file_path TEXT NOT NULL,
        source_id TEXT NOT NULL DEFAULT 'file-provider',
        last_scanned INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (file_path, source_id)
      )
    `)
    await client.execute(`
      CREATE TABLE IF NOT EXISTS keyword_mappings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        keyword TEXT NOT NULL,
        item_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        priority REAL NOT NULL
      )
    `)
    await client.execute(`
      CREATE TABLE IF NOT EXISTS search_index_meta (
        provider_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        keyword_hash TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        fts_rowid INTEGER,
        document_hash TEXT,
        doc_id INTEGER,
        PRIMARY KEY (provider_id, item_id)
      )
    `)
    await client.execute(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_search_index_meta_doc_id
      ON search_index_meta(doc_id) WHERE doc_id IS NOT NULL
    `)
    await client.execute(`
      CREATE TABLE IF NOT EXISTS search_keyword_postings (
        provider_id TEXT NOT NULL,
        keyword TEXT NOT NULL,
        doc_id INTEGER NOT NULL,
        priority REAL NOT NULL,
        PRIMARY KEY (provider_id, keyword, doc_id)
      ) WITHOUT ROWID
    `)
    await client.execute(`
      CREATE INDEX IF NOT EXISTS idx_search_keyword_postings_doc
      ON search_keyword_postings(doc_id, priority)
    `)
    await client.execute('PRAGMA wal_checkpoint(TRUNCATE)')
  } finally {
    client.close()
  }
}

function runKernelHostRole(args) {
  const entryPath = args.entry
  if (!entryPath) throw new Error('--entry is required for kernel-host role')
  if (typeof process.send !== 'function') {
    throw new Error('kernel-host role must be started via child_process.fork')
  }

  // Shim Electron's `process.parentPort` over Node's built-in IPC channel so the REAL built
  // `out/main/search-kernel-process.js` boots identically without launching Electron.
  const listenerMap = new Map()
  process.parentPort = {
    on(event, listener) {
      if (event !== 'message') return
      const wrapped = (data) => listener({ data })
      listenerMap.set(listener, wrapped)
      process.on('message', wrapped)
    },
    off(event, listener) {
      if (event !== 'message') return
      const wrapped = listenerMap.get(listener)
      if (!wrapped) return
      listenerMap.delete(listener)
      process.off('message', wrapped)
    },
    postMessage(message) {
      process.send(message)
    }
  }

  const req = createRequire(import.meta.url)
  req(entryPath)
}

function createWorkerRpcClient(worker) {
  const pending = new Map()
  worker.on('message', (msg) => {
    if (!msg || typeof msg !== 'object') return
    const key = typeof msg.taskId === 'string' ? msg.taskId : msg.requestId
    if (typeof key !== 'string') return
    const waiter = pending.get(key)
    if (!waiter) return
    pending.delete(key)
    if (msg.type === 'error') {
      const errMsg =
        typeof msg.error === 'string' ? msg.error : msg.error?.message || 'Worker error'
      waiter.reject(new Error(errMsg))
      return
    }
    waiter.resolve(msg)
  })
  worker.on('error', (error) => {
    for (const waiter of pending.values()) waiter.reject(error)
    pending.clear()
  })
  return {
    send(key, message) {
      return new Promise((resolve, reject) => {
        pending.set(key, { resolve, reject })
        worker.postMessage(message)
      })
    }
  }
}

async function runModeA(args) {
  const dbPath = args.db
  const outMainDir = args['out-dir'] || defaultOutMainDir
  const itemCount = positiveInt(args.items, 5000)
  const embeddingCount = positiveInt(args.embeddings, 500)
  const dims = positiveInt(args.dims, 384)
  const batchSize = positiveInt(args['batch-size'], 250)
  const ftsQueryCount = positiveInt(args['fts-queries'], 30)
  const semanticQueryCount = positiveInt(args['semantic-queries'], 10)

  const mainBaselineRssBytes = process.memoryUsage().rss
  let mainPeakRssBytes = mainBaselineRssBytes
  const sampleRss = () => {
    const rss = process.memoryUsage().rss
    if (rss > mainPeakRssBytes) mainPeakRssBytes = rss
  }
  const sampler = setInterval(sampleRss, 40)

  const writerWorker = new Worker(path.join(outMainDir, 'search-index-worker.js'))
  const writerRpc = createWorkerRpcClient(writerWorker)

  let readerWorker = null
  let readerRpc = null

  try {
    const writeStart = performance.now()
    await writerRpc.send('init-1', { type: 'init', taskId: 'init-1', dbPath })
    sampleRss()

    let seq = 0
    for (let offset = 0; offset < itemCount; offset += batchSize) {
      const size = Math.min(batchSize, itemCount - offset)
      const { records, items } = buildSyntheticBatch(offset, size)
      const taskId = `persist-${++seq}`
      await writerRpc.send(taskId, {
        type: 'persistAndApplyProviderItems',
        taskId,
        providerId: PROVIDER_ID,
        records,
        items,
        legacyItemIds: []
      })
      sampleRss()
    }

    // Write embeddings in batches via writer's execWrite transaction mode.
    const embBatchSize = 100
    for (let offset = 0; offset < embeddingCount; offset += embBatchSize) {
      const size = Math.min(embBatchSize, embeddingCount - offset)
      const statements = []
      for (let i = 0; i < size; i += 1) {
        const idx = offset + i
        const vec = makeNormalizedVector(idx, dims)
        const blob = encodeVectorBlob(vec)
        statements.push({
          sql: 'INSERT INTO embeddings (source_id, source_type, embedding, model, content_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          args: [
            `file:/bench/workspace/doc-${idx}.md`,
            'file',
            blob,
            EMBEDDING_MODEL,
            `hash-${idx}`,
            Date.now()
          ]
        })
      }
      const taskId = `emb-${++seq}`
      await writerRpc.send(taskId, {
        type: 'execWrite',
        taskId,
        statements,
        mode: 'transaction'
      })
      sampleRss()
    }

    const countResp = await writerRpc.send('count-1', {
      type: 'countByProvider',
      taskId: 'count-1',
      providerId: PROVIDER_ID
    })
    const writeDurationMs = performance.now() - writeStart

    readerWorker = new Worker(path.join(outMainDir, 'search-index-read-worker.js'), {
      workerData: { databasePath: dbPath },
      resourceLimits: {
        maxOldGenerationSizeMb: 64,
        maxYoungGenerationSizeMb: 16,
        stackSizeMb: 4
      }
    })
    readerRpc = createWorkerRpcClient(readerWorker)

    const queryStart = performance.now()
    let totalFtsRows = 0
    for (let q = 0; q < ftsQueryCount; q += 1) {
      const term = VOCAB[q % VOCAB.length]
      const requestId = `fts-${q}`
      const res = await readerRpc.send(requestId, {
        type: 'query',
        requestId,
        sql: 'SELECT item_id, title FROM search_index WHERE search_index MATCH ? LIMIT 25',
        args: [`${term}*`]
      })
      totalFtsRows += Array.isArray(res.rows) ? res.rows.length : 0
      sampleRss()
    }
    const queryDurationMs = performance.now() - queryStart

    const semanticStart = performance.now()
    let totalSemanticMatches = 0
    for (let s = 0; s < semanticQueryCount; s += 1) {
      const requestId = `sem-${s}`
      const res = await readerRpc.send(requestId, {
        type: 'semantic-search',
        requestId,
        vector: makeNormalizedVector(s * 17, dims),
        model: EMBEDDING_MODEL,
        limit: 20,
        cancelFlag: new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
      })
      totalSemanticMatches += Array.isArray(res.rows) ? res.rows.length : 0
      sampleRss()
    }
    const semanticDurationMs = performance.now() - semanticStart

    sampleRss()
    const mainEndRssBytes = process.memoryUsage().rss

    await writerRpc.send('shutdown-1', { type: 'shutdown', taskId: 'shutdown-1' })
    await writerWorker.terminate()
    if (readerWorker) {
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 2000)
        readerWorker.once('exit', () => {
          clearTimeout(timer)
          resolve()
        })
        readerWorker.postMessage({ type: 'shutdown' })
      })
    }

    process.stdout.write(
      `${JSON.stringify({
        mode: 'in-process-worker-threads',
        mainBaselineRssMiB: bytesToMiB(mainBaselineRssBytes),
        mainPeakRssMiB: bytesToMiB(mainPeakRssBytes),
        mainPeakDeltaMiB: bytesToMiB(Math.max(0, mainPeakRssBytes - mainBaselineRssBytes)),
        mainEndRssMiB: bytesToMiB(mainEndRssBytes),
        kernelPeakRssMiB: 0,
        kernelEndRssMiB: 0,
        writeDurationMs: roundMs(writeDurationMs),
        queryDurationMs: roundMs(queryDurationMs),
        semanticDurationMs: roundMs(semanticDurationMs),
        verified: {
          indexedItems: Number(countResp.result ?? 0),
          embeddingsWritten: embeddingCount,
          totalFtsRows,
          totalSemanticMatches
        }
      })}\n`
    )
  } finally {
    clearInterval(sampler)
  }
}

async function runModeB(args) {
  const dbPath = args.db
  const outMainDir = args['out-dir'] || defaultOutMainDir
  const itemCount = positiveInt(args.items, 5000)
  const embeddingCount = positiveInt(args.embeddings, 500)
  const dims = positiveInt(args.dims, 384)
  const batchSize = positiveInt(args['batch-size'], 250)
  const ftsQueryCount = positiveInt(args['fts-queries'], 30)
  const semanticQueryCount = positiveInt(args['semantic-queries'], 10)

  const mainBaselineRssBytes = process.memoryUsage().rss
  let mainPeakRssBytes = mainBaselineRssBytes
  let kernelPeakRssBytes = 0
  let kernelLastRssBytes = 0

  const kernelEntryPath = path.join(outMainDir, 'search-kernel-process.js')
  const kernelChild = fork(__filename, ['--role=kernel-host', `--entry=${kernelEntryPath}`], {
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    serialization: 'advanced',
    env: {
      ...process.env,
      NODE_ENV: 'production'
    }
  })

  const pending = new Map()
  let reqSeq = 0
  let capabilities = []

  const readyPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Kernel ready timeout')), 15_000)
    const onMessage = (msg) => {
      if (msg && typeof msg === 'object' && msg.kind === 'event' && msg.event === 'kernel.ready') {
        clearTimeout(timer)
        capabilities = Array.isArray(msg.capabilities) ? msg.capabilities : []
        resolve(msg)
      }
    }
    kernelChild.on('message', onMessage)
    kernelChild.once('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`Kernel exited before ready (code=${String(code)})`))
    })
  })

  kernelChild.on('message', (msg) => {
    if (!msg || typeof msg !== 'object' || msg.kind !== 'response') return
    const waiter = pending.get(msg.requestId)
    if (!waiter) return
    pending.delete(msg.requestId)
    if (!msg.ok) {
      waiter.reject(
        new Error(`${msg.error?.code || 'KERNEL_ERROR'}: ${msg.error?.message || 'failed'}`)
      )
      return
    }
    waiter.resolve(msg.result)
  })

  const sendKernelOp = (op, extra = {}) => {
    const requestId = `kreq-${++reqSeq}`
    return new Promise((resolve, reject) => {
      pending.set(requestId, { resolve, reject })
      kernelChild.send({
        kind: 'request',
        protocolVersion: SEARCH_KERNEL_PROTOCOL_VERSION,
        requestId,
        op,
        ...extra
      })
    })
  }

  const invokeTask = (taskType, payload) => sendKernelOp('kernel.task', { taskType, payload })

  const sampleMainRss = () => {
    const mainRss = process.memoryUsage().rss
    if (mainRss > mainPeakRssBytes) mainPeakRssBytes = mainRss
  }

  const sampleKernelPidRss = () => {
    sampleMainRss()
    const kRss = readOsPidRssBytes(kernelChild.pid)
    if (kRss > 0) {
      kernelLastRssBytes = kRss
      if (kRss > kernelPeakRssBytes) kernelPeakRssBytes = kRss
    }
  }

  const sampler = setInterval(sampleMainRss, 40)

  try {
    await readyPromise
    sampleKernelPidRss()

    const writeStart = performance.now()
    const initRes = await invokeTask(SEARCH_KERNEL_TASKS.WRITER_REQUEST, {
      message: { type: 'init', taskId: 'init-1', dbPath }
    })
    if (initRes.type === 'error') throw new Error(initRes.error?.message || 'init failed')
    sampleMainRss()

    let seq = 0
    for (let offset = 0; offset < itemCount; offset += batchSize) {
      const size = Math.min(batchSize, itemCount - offset)
      const { records, items } = buildSyntheticBatch(offset, size)
      const taskId = `persist-${++seq}`
      const res = await invokeTask(SEARCH_KERNEL_TASKS.WRITER_REQUEST, {
        message: {
          type: 'persistAndApplyProviderItems',
          taskId,
          providerId: PROVIDER_ID,
          records,
          items,
          legacyItemIds: []
        }
      })
      if (res.type === 'error') throw new Error(res.error?.message || 'persist failed')
      sampleMainRss()
    }

    const embBatchSize = 100
    for (let offset = 0; offset < embeddingCount; offset += embBatchSize) {
      const size = Math.min(embBatchSize, embeddingCount - offset)
      const statements = []
      for (let i = 0; i < size; i += 1) {
        const idx = offset + i
        const vec = makeNormalizedVector(idx, dims)
        const blob = encodeVectorBlob(vec)
        statements.push({
          sql: 'INSERT INTO embeddings (source_id, source_type, embedding, model, content_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          args: [
            `file:/bench/workspace/doc-${idx}.md`,
            'file',
            blob,
            EMBEDDING_MODEL,
            `hash-${idx}`,
            Date.now()
          ]
        })
      }
      const taskId = `emb-${++seq}`
      const res = await invokeTask(SEARCH_KERNEL_TASKS.WRITER_REQUEST, {
        message: {
          type: 'execWrite',
          taskId,
          statements,
          mode: 'transaction'
        }
      })
      if (res.type === 'error') throw new Error(res.error?.message || 'emb write failed')
      sampleMainRss()
    }

    const countResp = await invokeTask(SEARCH_KERNEL_TASKS.WRITER_REQUEST, {
      message: {
        type: 'countByProvider',
        taskId: 'count-1',
        providerId: PROVIDER_ID
      }
    })
    const writeDurationMs = performance.now() - writeStart

    const memAfterWrite = await sendKernelOp('kernel.memory')
    if (memAfterWrite.rssBytes > kernelPeakRssBytes) kernelPeakRssBytes = memAfterWrite.rssBytes
    sampleKernelPidRss()

    const queryStart = performance.now()
    let totalFtsRows = 0
    for (let q = 0; q < ftsQueryCount; q += 1) {
      const term = VOCAB[q % VOCAB.length]
      const res = await invokeTask(SEARCH_KERNEL_TASKS.READER_QUERY, {
        lane: 'deferred',
        databasePath: dbPath,
        requestId: `fts-${q}`,
        sql: 'SELECT item_id, title FROM search_index WHERE search_index MATCH ? LIMIT 25',
        args: [`${term}*`]
      })
      if (res.error) throw new Error(res.error.message)
      totalFtsRows += Array.isArray(res.rows) ? res.rows.length : 0
      sampleMainRss()
    }
    const queryDurationMs = performance.now() - queryStart

    const memAfterQuery = await sendKernelOp('kernel.memory')
    if (memAfterQuery.rssBytes > kernelPeakRssBytes) kernelPeakRssBytes = memAfterQuery.rssBytes
    sampleKernelPidRss()

    const semanticStart = performance.now()
    let totalSemanticMatches = 0
    for (let s = 0; s < semanticQueryCount; s += 1) {
      const res = await invokeTask(SEARCH_KERNEL_TASKS.READER_SEMANTIC_SEARCH, {
        lane: 'deferred',
        databasePath: dbPath,
        requestId: `sem-${s}`,
        vector: makeNormalizedVector(s * 17, dims),
        model: EMBEDDING_MODEL,
        limit: 20
      })
      if (res.error) throw new Error(res.error.message)
      totalSemanticMatches += Array.isArray(res.rows) ? res.rows.length : 0
      sampleMainRss()
    }
    const semanticDurationMs = performance.now() - semanticStart

    const memEnd = await sendKernelOp('kernel.memory')
    if (memEnd.rssBytes > kernelPeakRssBytes) kernelPeakRssBytes = memEnd.rssBytes
    kernelLastRssBytes = Math.max(kernelLastRssBytes, memEnd.rssBytes)
    sampleKernelPidRss()
    const mainEndRssBytes = process.memoryUsage().rss

    const exitPromise = new Promise((resolve) => {
      const timer = setTimeout(resolve, 4000)
      kernelChild.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
    })
    await sendKernelOp('kernel.shutdown', { reason: 'benchmark-complete' })
    await exitPromise

    process.stdout.write(
      `${JSON.stringify({
        mode: 'separate-kernel-process',
        kernelPid: kernelChild.pid,
        kernelCapabilities: capabilities,
        mainBaselineRssMiB: bytesToMiB(mainBaselineRssBytes),
        mainPeakRssMiB: bytesToMiB(mainPeakRssBytes),
        mainPeakDeltaMiB: bytesToMiB(Math.max(0, mainPeakRssBytes - mainBaselineRssBytes)),
        mainEndRssMiB: bytesToMiB(mainEndRssBytes),
        kernelPeakRssMiB: bytesToMiB(kernelPeakRssBytes),
        kernelEndRssMiB: bytesToMiB(kernelLastRssBytes),
        writeDurationMs: roundMs(writeDurationMs),
        queryDurationMs: roundMs(queryDurationMs),
        semanticDurationMs: roundMs(semanticDurationMs),
        verified: {
          indexedItems: Number(countResp.result ?? 0),
          embeddingsWritten: embeddingCount,
          totalFtsRows,
          totalSemanticMatches
        }
      })}\n`
    )
  } finally {
    clearInterval(sampler)
    if (!kernelChild.killed && kernelChild.exitCode === null) {
      kernelChild.kill()
    }
  }
}

function runSubprocessRole(roleArgs) {
  return new Promise((resolve, reject) => {
    const child = fork(__filename, roleArgs, {
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      env: { ...process.env }
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Sub-run ${roleArgs.join(' ')} exited with code ${code}\n${stderr}`))
        return
      }
      resolve(stdout.trim())
    })
  })
}

async function runOrchestrator(args) {
  const outMainDir = path.resolve(args['out-dir'] || defaultOutMainDir)
  const itemCount = positiveInt(args.items, 5000)
  const embeddingCount = positiveInt(args.embeddings, 500)
  const dims = positiveInt(args.dims, 384)
  const batchSize = positiveInt(args['batch-size'], 250)
  const ftsQueryCount = positiveInt(args['fts-queries'], 30)
  const semanticQueryCount = positiveInt(args['semantic-queries'], 10)

  const requiredFiles = [
    'search-kernel-process.js',
    'search-index-worker.js',
    'search-index-read-worker.js'
  ]
  for (const file of requiredFiles) {
    const fullPath = path.join(outMainDir, file)
    if (!existsSync(fullPath)) {
      throw new Error(
        `Built artifact missing: ${fullPath}. Run "pnpm --filter @talex-touch/core-app exec electron-vite build" first.`
      )
    }
  }

  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'tuff-search-kernel-rss-'))
  try {
    const dbA = path.join(tempDir, 'search-index-mode-a.db')
    const dbB = path.join(tempDir, 'search-index-mode-b.db')

    await runSubprocessRole(['--role=init-db', `--db=${dbA}`])
    await runSubprocessRole(['--role=init-db', `--db=${dbB}`])

    const commonArgs = [
      `--out-dir=${outMainDir}`,
      `--items=${itemCount}`,
      `--embeddings=${embeddingCount}`,
      `--dims=${dims}`,
      `--batch-size=${batchSize}`,
      `--fts-queries=${ftsQueryCount}`,
      `--semantic-queries=${semanticQueryCount}`
    ]

    const modeARaw = await runSubprocessRole(['--role=mode-a', `--db=${dbA}`, ...commonArgs])
    const modeBRaw = await runSubprocessRole(['--role=mode-b', `--db=${dbB}`, ...commonArgs])

    const modeA = JSON.parse(modeARaw.split('\n').at(-1))
    const modeB = JSON.parse(modeBRaw.split('\n').at(-1))

    const mainPeakRssSavedMiB = Number((modeA.mainPeakRssMiB - modeB.mainPeakRssMiB).toFixed(2))
    const mainPeakRssReductionPct =
      modeA.mainPeakRssMiB > 0
        ? Number(((mainPeakRssSavedMiB / modeA.mainPeakRssMiB) * 100).toFixed(2))
        : 0
    const mainDeltaRssSavedMiB = Number(
      (modeA.mainPeakDeltaMiB - modeB.mainPeakDeltaMiB).toFixed(2)
    )
    const mainDeltaRssReductionPct =
      modeA.mainPeakDeltaMiB > 0
        ? Number(((mainDeltaRssSavedMiB / modeA.mainPeakDeltaMiB) * 100).toFixed(2))
        : 0

    const summary = {
      capturedAt: new Date().toISOString(),
      nodeVersion: process.version,
      platform: `${process.platform}-${process.arch}`,
      workload: {
        items: itemCount,
        embeddings: embeddingCount,
        embeddingDims: dims,
        batchSize,
        ftsQueries: ftsQueryCount,
        semanticQueries: semanticQueryCount
      },
      modeA_inProcessWorkerThreads: modeA,
      modeB_separateKernelProcess: modeB,
      comparison: {
        mainPeakRssSavedMiB,
        mainPeakRssReductionPct,
        mainDeltaRssSavedMiB,
        mainDeltaRssReductionPct,
        kernelIsolatedPeakRssMiB: modeB.kernelPeakRssMiB,
        parityVerified:
          modeA.verified.indexedItems === itemCount &&
          modeB.verified.indexedItems === itemCount &&
          modeA.verified.totalFtsRows === modeB.verified.totalFtsRows &&
          modeA.verified.totalSemanticMatches === modeB.verified.totalSemanticMatches &&
          modeB.verified.totalFtsRows > 0 &&
          modeB.verified.totalSemanticMatches > 0
      }
    }

    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
    if (!summary.comparison.parityVerified) {
      throw new Error(
        'Mode A and Mode B verification counts did not match expected workload parity'
      )
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

const args = parseArgs(process.argv.slice(2))
const role = args.role || 'orchestrator'

if (role === 'kernel-host') {
  runKernelHostRole(args)
} else if (role === 'init-db') {
  await runInitDbRole(args)
} else if (role === 'mode-a') {
  await runModeA(args)
} else if (role === 'mode-b') {
  await runModeB(args)
} else {
  await runOrchestrator(args)
}
