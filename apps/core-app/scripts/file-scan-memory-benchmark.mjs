#!/usr/bin/env node
/**
 * Measures whether file-scan memory is bounded by batch size or by directory cardinality.
 *
 * #318 asks for a reproducible synthetic-tree benchmark before the R3 memory risk can be
 * closed or narrowed. The claim under test is that peak memory tracks `batchSize`, not the
 * total file count — i.e. that scanning ten times as many files does not cost ten times the
 * heap. A run that grows with file count would mean something is still accumulating.
 *
 * Drives `scanDirectoryBatches` from @talex-touch/utils, which is the traversal the scan
 * worker calls. The worker adds an ack round-trip on top and awaits it before emitting the
 * next batch, so it holds at most one unacknowledged batch — the bound this measures is the
 * floor, and the worker cannot exceed it.
 *
 * Usage:
 *   node apps/core-app/scripts/file-scan-memory-benchmark.mjs
 *   node apps/core-app/scripts/file-scan-memory-benchmark.mjs --counts 20000,50000,100000 --batch 500
 *   node apps/core-app/scripts/file-scan-memory-benchmark.mjs --cancel-at 5000
 *
 * Run with --expose-gc for stable heap numbers.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

function parseArgs(argv) {
  const get = (flag, fallback) => {
    const index = argv.indexOf(flag)
    return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback
  }
  return {
    counts: get('--counts', '20000,50000,100000').split(',').map(Number).filter(Boolean),
    batchSizes: get('--batch', '500').split(',').map(Number).filter(Boolean),
    cancelAt: Number(get('--cancel-at', '0')),
    keep: argv.includes('--keep')
  }
}

/** Fan the files across nested directories so traversal recursion is exercised, not one flat dir. */
function buildTree(root, fileCount) {
  const perDir = 200
  const dirCount = Math.ceil(fileCount / perDir)
  let written = 0
  for (let d = 0; d < dirCount; d += 1) {
    const dir = path.join(root, `d${Math.floor(d / 50)}`, `s${d}`)
    mkdirSync(dir, { recursive: true })
    for (let f = 0; f < perDir && written < fileCount; f += 1) {
      writeFileSync(path.join(dir, `f${written}.txt`), '')
      written += 1
    }
  }
  return written
}

function sampleMemory() {
  const usage = process.memoryUsage()
  return { rss: usage.rss, heapUsed: usage.heapUsed }
}

const mib = (bytes) => Math.round((bytes / 1024 / 1024) * 10) / 10

async function measure(scanDirectoryBatches, root, fileCount, batchSize, cancelAt) {
  globalThis.gc?.()
  const before = sampleMemory()
  let peakRss = before.rss
  let peakHeap = before.heapUsed
  let seen = 0
  let batches = 0
  let largestBatch = 0

  const controller = new AbortController()
  const started = Date.now()
  let cancelled = false

  try {
    await scanDirectoryBatches(
      root,
      async (batch) => {
        batches += 1
        seen += batch.length
        largestBatch = Math.max(largestBatch, batch.length)
        // Sampling inside the callback is the point: this is the moment a batch is live.
        const now = sampleMemory()
        if (now.rss > peakRss) peakRss = now.rss
        if (now.heapUsed > peakHeap) peakHeap = now.heapUsed
        if (cancelAt > 0 && seen >= cancelAt) controller.abort()
      },
      // Path filters off: the synthetic tree lives under the OS temp dir, which the default
      // system/cache filters reject outright. Disabling them keeps every entry in play, which
      // is also the conservative direction — more entries means more memory, not less.
      {
        enablePhotosLibraryFilter: false,
        enableSystemPathFilter: false,
        enableDevPathFilter: false,
        enableCachePathFilter: false,
        strictMode: false
      },
      undefined,
      { batchSize, signal: controller.signal }
    )
  } catch (error) {
    if (controller.signal.aborted) cancelled = true
    else throw error
  }

  const durationMs = Date.now() - started
  globalThis.gc?.()
  const after = sampleMemory()

  return {
    fileCount,
    batchSize,
    seen,
    batches,
    largestBatch,
    cancelled,
    durationMs,
    peakRssMiB: mib(peakRss),
    peakHeapMiB: mib(peakHeap),
    deltaRssMiB: mib(peakRss - before.rss),
    retainedHeapMiB: mib(after.heapUsed - before.heapUsed)
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..')
  const modulePath = path.join(repoRoot, 'packages', 'utils', 'common', 'file-scan-utils.ts')
  const { scanDirectoryBatches } = await import(pathToFileURL(modulePath).href)

  const results = []
  for (const fileCount of args.counts) {
    const root = mkdtempSync(path.join(tmpdir(), `scan-bench-${fileCount}-`))
    try {
      const written = buildTree(root, fileCount)
      for (const batchSize of args.batchSizes) {
        const result = await measure(scanDirectoryBatches, root, written, batchSize, args.cancelAt)
        results.push(result)
        console.log(
          `files=${String(result.fileCount).padStart(7)} batch=${String(result.batchSize).padStart(5)} ` +
            `seen=${String(result.seen).padStart(7)} batches=${String(result.batches).padStart(5)} ` +
            `maxBatch=${String(result.largestBatch).padStart(5)} ` +
            `peakRSS=${String(result.peakRssMiB).padStart(7)}MiB ` +
            `ΔRSS=${String(result.deltaRssMiB).padStart(6)}MiB ` +
            `peakHeap=${String(result.peakHeapMiB).padStart(6)}MiB ` +
            `retained=${String(result.retainedHeapMiB).padStart(6)}MiB ` +
            `${result.durationMs}ms${result.cancelled ? ' CANCELLED' : ''}`
        )
      }
    } finally {
      if (!args.keep) rmSync(root, { recursive: true, force: true })
    }
  }

  // The verdict the issue actually asks for: does peak memory track file count?
  const byBatch = new Map()
  for (const r of results) {
    if (!byBatch.has(r.batchSize)) byBatch.set(r.batchSize, [])
    byBatch.get(r.batchSize).push(r)
  }
  console.log('')
  for (const [batchSize, runs] of byBatch) {
    if (runs.length < 2) continue
    const first = runs[0]
    const last = runs[runs.length - 1]
    const fileRatio = last.fileCount / first.fileCount
    const rssRatio = last.deltaRssMiB / Math.max(first.deltaRssMiB, 0.1)
    console.log(
      `batch=${batchSize}: ${fileRatio.toFixed(1)}x the files -> ${rssRatio.toFixed(2)}x the RSS delta ` +
        `(bounded by batch size if this stays near 1.0)`
    )
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
