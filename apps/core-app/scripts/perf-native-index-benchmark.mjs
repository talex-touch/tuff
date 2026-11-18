#!/usr/bin/env node
/**
 * Self-contained Phase 2 performance benchmark for `@talex-touch/tuff-native` file-index,
 * scanner, frontmost-app Darwin cache, SQLite WAL/keyset retention, and 64-dim semantic scoring.
 *
 * Usage:
 *   nice -n 10 node apps/core-app/scripts/perf-native-index-benchmark.mjs
 *   nice -n 10 node --expose-gc apps/core-app/scripts/perf-native-index-benchmark.mjs --root ~/Projects --json out.json
 *   nice -n 10 node apps/core-app/scripts/perf-native-index-benchmark.mjs --synthetic 25000
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, '../../..')
const NATIVE_FILE_INDEX_PATH = path.join(REPO_ROOT, 'packages/tuff-native/file-index.js')

function parseArgs(argv) {
  const get = (flag, fallback = null) => {
    const idx = argv.indexOf(flag)
    return idx >= 0 && argv[idx + 1] ? argv[idx + 1] : fallback
  }
  return {
    root: get('--root', null),
    syntheticCount: Number(get('--synthetic', '15000')),
    jsonOut: get('--json', null),
    cloneRoot: argv.includes('--clone'),
    skipOsascript: argv.includes('--skip-osascript'),
    skipSqlite: argv.includes('--skip-sqlite'),
    help: argv.includes('--help') || argv.includes('-h')
  }
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[idx]
}

function summarizeMs(samples) {
  const sorted = [...samples].sort((a, b) => a - b)
  const sum = sorted.reduce((acc, v) => acc + v, 0)
  return {
    count: sorted.length,
    minMs: Number((sorted[0] ?? 0).toFixed(3)),
    p50Ms: Number(percentile(sorted, 50).toFixed(3)),
    p95Ms: Number(percentile(sorted, 95).toFixed(3)),
    maxMs: Number((sorted[sorted.length - 1] ?? 0).toFixed(3)),
    meanMs: Number((sorted.length ? sum / sorted.length : 0).toFixed(3))
  }
}

function round(val, digits = 2) {
  return Number(val.toFixed(digits))
}

function buildSyntheticCorpus(rootDir, totalFiles) {
  const exts = ['ts', 'tsx', 'rs', 'md', 'json', 'pdf', 'png', 'py', 'go']
  const prefixes = [
    'file-provider-search-result-service',
    'native-file-index-arena',
    'recommendation-engine',
    'clipboard-capture-freshness',
    'wal-maintenance',
    'intelligence-audit-logger',
    '重庆架构方案',
    '智能推荐报告',
    '长风破浪文档',
    'alpha-beta-gamma'
  ]
  const dirs = 60
  const perDir = Math.max(1, Math.ceil(totalFiles / dirs))
  let created = 0
  for (let d = 0; d < dirs && created < totalFiles; d += 1) {
    const sub = path.join(rootDir, `group-${Math.floor(d / 10)}`, `pkg-${d}`)
    fs.mkdirSync(sub, { recursive: true })
    for (let f = 0; f < perDir && created < totalFiles; f += 1) {
      const prefix = prefixes[created % prefixes.length]
      const ext = exts[created % exts.length]
      const fileName = `${prefix}-${created}.${ext}`
      fs.writeFileSync(path.join(sub, fileName), '')
      created += 1
    }
  }
  return created
}

async function recursiveReaddirWalk(rootDir) {
  let files = 0
  let dirs = 0
  const stack = [rootDir]
  while (stack.length > 0) {
    const current = stack.pop()
    let entries
    try {
      entries = await fs.promises.readdir(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'target')
          continue
        dirs += 1
        stack.push(fullPath)
      } else if (entry.isFile()) {
        try {
          await fs.promises.lstat(fullPath)
          files += 1
        } catch {
          // ignore
        }
      }
    }
  }
  return { files, dirs }
}

async function benchArenaAndSearch(nativeFileIndex, scanRoot, tmpDir) {
  const filterOptions = {
    excludeNames: ['node_modules', '.git', '.DS_Store'],
    contextDependentNames: ['target', 'dist', 'build', 'out'],
    projectMarkers: ['package.json', 'cargo.toml', 'pyproject.toml'],
    excludeDirSuffixes: ['.app', '.photoslibrary'],
    excludeHidden: true,
    includeDirs: true,
    maxDepth: 16
  }

  globalThis.gc?.()
  const rssBefore = process.memoryUsage().rss
  const arena = nativeFileIndex.createNativeFileArena()
  if (!arena) {
    throw new Error(
      `NativeFileArena unavailable: ${JSON.stringify(nativeFileIndex.getFileIndexSupport())}`
    )
  }

  const indexStart = performance.now()
  const stats = await arena.indexRoots([scanRoot], filterOptions)
  const indexMs = performance.now() - indexStart
  const rssAfter = process.memoryUsage().rss

  const snapPath = path.join(tmpDir, 'arena-bench.bin')
  const saveStart = performance.now()
  const snapBytes = arena.saveSnapshot(snapPath)
  const saveSnapshotMs = performance.now() - saveStart

  const reloaded = nativeFileIndex.createNativeFileArena()
  const loadStart = performance.now()
  const reloadStats = reloaded.loadSnapshot(snapPath)
  const loadSnapshotMs = performance.now() - loadStart

  // Empty-query recency scan (tests mtimeMs/mtimeSec recency path)
  const recencyStart = performance.now()
  const recentRes = await reloaded.search('', { limit: 50, typeFilter: 'file' })
  const recencyMs = performance.now() - recencyStart

  // 15-query corpus (ASCII exact/fuzzy, extension-like, CJK heteronym cq/zq)
  const queries = [
    'fpsr',
    'file-provider',
    'native',
    'arena',
    'recommendation',
    'clipboard',
    'sqlite',
    'wal',
    'audit',
    'index.ts',
    'cargo',
    'cq',
    'zq',
    'zntj',
    'alpha'
  ]
  const queryLatencies = []
  const rustLatencies = []
  let sampleHitPath = null
  let sampleHitName = null
  for (const q of queries) {
    const t0 = performance.now()
    const res = await reloaded.search(q, { limit: 50 })
    queryLatencies.push(performance.now() - t0)
    rustLatencies.push(res.durationMs)
    if (!sampleHitPath && res.items.length > 0) {
      sampleHitPath = res.items[0].path
      sampleHitName = res.items[0].name
    }
  }

  // Fallback sample path if queries had 0 hits on custom root
  if (!sampleHitPath && recentRes.items.length > 0) {
    sampleHitPath = recentRes.items[0].path
    sampleHitName = recentRes.items[0].name
  }

  // O(1) hasPath vs search fallback
  let hasPathNsPerOp = null
  let searchLookupMs = null
  if (sampleHitPath && typeof reloaded.hasPath === 'function') {
    const iters = 10000
    const missingPath = path.join(scanRoot, '__definitely_missing_file__.xyz')
    const hpStart = performance.now()
    let hits = 0
    for (let i = 0; i < iters; i += 1) {
      if (reloaded.hasPath(i % 2 === 0 ? sampleHitPath : missingPath)) hits += 1
    }
    const hpElapsedMs = performance.now() - hpStart
    hasPathNsPerOp = round((hpElapsedMs * 1e6) / iters, 1)

    const slStart = performance.now()
    for (let i = 0; i < 20; i += 1) {
      await reloaded.search(sampleHitName || 'index', { limit: 20 })
    }
    searchLookupMs = round((performance.now() - slStart) / 20, 3)
    if (hits === 0) {
      throw new Error(`hasPath sanity check failed for ${sampleHitPath}`)
    }
  }

  // Scanner comparison: getattrlistbulk vs fs.promises.readdir + lstat
  const bulkStart = performance.now()
  const bulkRes = await nativeFileIndex.scanDirectoryBulk([scanRoot], filterOptions)
  const bulkMs = performance.now() - bulkStart

  const walkStart = performance.now()
  const walkRes = await recursiveReaddirWalk(scanRoot)
  const walkMs = performance.now() - walkStart

  let fdMs = null
  let fdFiles = null
  try {
    const fdStart = performance.now()
    const fdOut = execFileSync('fd', ['--type', 'f', '.', scanRoot], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore']
    })
    fdMs = round(performance.now() - fdStart, 2)
    fdFiles = fdOut ? fdOut.trim().split('\n').filter(Boolean).length : 0
  } catch {
    // fd binary not available on PATH
  }

  return {
    arena: {
      fileCount: stats.fileCount,
      dirCount: stats.dirCount,
      activeCount: stats.activeCount,
      arenaMiB: round(stats.arenaBytes / (1024 * 1024), 2),
      rssDeltaMiB: round(Math.max(0, rssAfter - rssBefore) / (1024 * 1024), 2),
      indexMs: round(indexMs, 2),
      snapshotMiB: round(snapBytes / (1024 * 1024), 2),
      saveSnapshotMs: round(saveSnapshotMs, 2),
      loadSnapshotMs: round(loadSnapshotMs, 2),
      reloadedActiveCount: reloadStats.activeCount,
      hasPathNsPerOp,
      searchLookupMs
    },
    search: {
      recencyScanMs: round(recencyMs, 3),
      recencyReturned: recentRes.items.length,
      hasMtimeField: recentRes.items[0] ? typeof recentRes.items[0].mtimeSec === 'number' : null,
      hasMtimeMsField: recentRes.items[0] ? typeof recentRes.items[0].mtimeMs === 'number' : null,
      jsLatency: summarizeMs(queryLatencies),
      rustLatency: summarizeMs(rustLatencies)
    },
    scanner: {
      backend: bulkRes.backend,
      bulkFiles: bulkRes.fileCount,
      bulkDirs: bulkRes.dirCount,
      bulkMs: round(bulkMs, 2),
      readdirWalkFiles: walkRes.files,
      readdirWalkMs: round(walkMs, 2),
      fdFiles,
      fdMs,
      speedupVsReaddir: walkMs > 0 ? round(walkMs / Math.max(0.01, bulkMs), 2) : null,
      speedupVsFd: fdMs !== null ? round(fdMs / Math.max(0.01, bulkMs), 2) : null
    }
  }
}

function benchDarwinFrontmostApp(nativeFileIndex, skipOsascript) {
  if (process.platform !== 'darwin') {
    return { supported: false }
  }
  const coldStart = performance.now()
  const first = nativeFileIndex.getFrontmostApplicationDarwin()
  const coldMs = performance.now() - coldStart

  const samples = []
  for (let i = 0; i < 200; i += 1) {
    const t0 = performance.now()
    nativeFileIndex.getFrontmostApplicationDarwin()
    samples.push(performance.now() - t0)
  }

  let osascriptSamples = null
  if (!skipOsascript) {
    const osa = []
    for (let i = 0; i < 5; i += 1) {
      const t0 = performance.now()
      try {
        execFileSync(
          'osascript',
          [
            '-e',
            'tell application "System Events" to get name of first application process whose frontmost is true'
          ],
          { stdio: 'pipe', timeout: 3000 }
        )
        osa.push(performance.now() - t0)
      } catch {
        break
      }
    }
    if (osa.length > 0) osascriptSamples = summarizeMs(osa)
  }

  return {
    supported: true,
    bundleId: first?.bundleId ?? null,
    coldMs: round(coldMs, 3),
    warmCache: summarizeMs(samples),
    osascript: osascriptSamples
  }
}

async function benchSqliteRetentionAndWal(tmpDir) {
  let sqlite
  try {
    sqlite = await import('node:sqlite')
  } catch {
    return { supported: false, reason: 'node:sqlite unavailable' }
  }
  const { DatabaseSync } = sqlite
  const dbPath = path.join(tmpDir, 'audit-bench.sqlite')
  const db = new DatabaseSync(dbPath)
  try {
    db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA auto_vacuum = INCREMENTAL;
      CREATE TABLE audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at INTEGER NOT NULL,
        caller TEXT NOT NULL,
        detail TEXT
      );
      CREATE INDEX idx_audit_created ON audit_logs(created_at);
    `)

    // 1. Coalesced 200-item batch flush (detail: false => NULL detail) vs individual inserts
    const insertStmt = db.prepare(
      'INSERT INTO audit_logs (created_at, caller, detail) VALUES (?, ?, ?)'
    )
    const singleStart = performance.now()
    for (let i = 0; i < 200; i += 1) {
      insertStmt.run(1000 + i, 'bench', null)
    }
    const individual200Ms = performance.now() - singleStart

    const batchStart = performance.now()
    db.exec('BEGIN IMMEDIATE')
    for (let i = 0; i < 200; i += 1) {
      insertStmt.run(2000 + i, 'bench', null)
    }
    db.exec('COMMIT')
    const coalesced200Ms = performance.now() - batchStart

    // Populate 10,000 rows for keyset retention delete benchmark
    db.exec('BEGIN IMMEDIATE')
    for (let i = 0; i < 10000; i += 1) {
      insertStmt.run(3000 + i, 'bench', i % 5 === 0 ? '{"payload":"x"}' : null)
    }
    db.exec('COMMIT')

    const keysetStart = performance.now()
    const delStmt = db.prepare('DELETE FROM audit_logs WHERE id > ? AND id <= ?')
    let cursor = 0
    let deleted = 0
    while (cursor < 8000) {
      const next = Math.min(8000, cursor + 500)
      const res = delStmt.run(cursor, next)
      deleted += Number(res.changes || 0)
      cursor = next
    }
    const keysetDeleteMs = performance.now() - keysetStart

    const vacStart = performance.now()
    db.exec('PRAGMA wal_checkpoint(TRUNCATE); PRAGMA incremental_vacuum(200);')
    const walMaintenanceMs = performance.now() - vacStart

    return {
      supported: true,
      individual200Ms: round(individual200Ms, 3),
      coalesced200Ms: round(coalesced200Ms, 3),
      coalescedSpeedup: round(individual200Ms / Math.max(0.01, coalesced200Ms), 2),
      keysetDeletedRows: deleted,
      keysetDeleteMs: round(keysetDeleteMs, 3),
      walMaintenanceMs: round(walMaintenanceMs, 3)
    }
  } finally {
    db.close()
  }
}

function benchSemanticProfileScoring() {
  const DIMS = 64
  const CANDIDATES = 500
  const PASSES = 200

  function hashTok(token) {
    let hash = 2166136261
    for (let i = 0; i < token.length; i += 1) {
      hash ^= token.charCodeAt(i)
      hash = Math.imul(hash, 16777619)
    }
    return hash >>> 0
  }

  function vectorizeUncached(tokens) {
    const vec = Array.from({ length: DIMS }, () => 0)
    for (const t of tokens) vec[hashTok(t) % DIMS] += 1
    const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0))
    return mag === 0 ? vec : vec.map((v) => v / mag)
  }

  function vectorizeF32(tokens) {
    const vec = new Float32Array(DIMS)
    for (const t of tokens) vec[hashTok(t) % DIMS] += 1
    let sq = 0
    for (let i = 0; i < DIMS; i += 1) sq += vec[i] * vec[i]
    const mag = Math.sqrt(sq)
    if (mag > 0) {
      for (let i = 0; i < DIMS; i += 1) vec[i] /= mag
    }
    return vec
  }

  const candidateTokens = Array.from({ length: CANDIDATES }, (_, c) => [
    `cand:${c}`,
    `source:app`,
    `task:dev`,
    `pkg:${c % 17}`,
    `ext:${c % 9}`
  ])
  const ctxF32 = vectorizeF32(['task:dev', 'app:ide', 'code', 'work'])
  const ctxArr = Array.from(ctxF32)

  // Baseline: uncached per-pass vectorizeTokens (Array.from + reduce + map) + cosine
  const t0 = performance.now()
  let sinkA = 0
  for (let p = 0; p < PASSES; p += 1) {
    for (let c = 0; c < CANDIDATES; c += 1) {
      const vec = vectorizeUncached(candidateTokens[c])
      let dot = 0
      for (let i = 0; i < DIMS; i += 1) dot += ctxArr[i] * vec[i]
      sinkA += dot
    }
  }
  const uncachedNumberArrayMs = performance.now() - t0

  // Optimized: memoized Float32Array profile + dot product
  const memoizedF32s = candidateTokens.map((toks) => vectorizeF32(toks))
  const t1 = performance.now()
  let sinkB = 0
  for (let p = 0; p < PASSES; p += 1) {
    for (let c = 0; c < CANDIDATES; c += 1) {
      const vec = memoizedF32s[c]
      let dot = 0
      for (let i = 0; i < DIMS; i += 1) dot += ctxF32[i] * vec[i]
      sinkB += dot
    }
  }
  const memoizedFloat32Ms = performance.now() - t1

  return {
    candidates: CANDIDATES,
    passes: PASSES,
    totalScores: CANDIDATES * PASSES,
    uncachedNumberArrayMs: round(uncachedNumberArrayMs, 3),
    memoizedFloat32Ms: round(memoizedFloat32Ms, 3),
    speedup: round(uncachedNumberArrayMs / Math.max(0.01, memoizedFloat32Ms), 2),
    checksumDiff: round(Math.abs(sinkA - sinkB), 4)
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(
      'Usage: node perf-native-index-benchmark.mjs [--root <dir>] [--synthetic <n>] [--clone] [--json <file>] [--skip-osascript] [--skip-sqlite]'
    )
    process.exit(0)
  }

  const nativeFileIndex = require(NATIVE_FILE_INDEX_PATH)
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tuff-native-bench-'))

  try {
    let scanRoot
    let corpusKind
    if (args.root) {
      const resolvedRoot = args.root.startsWith('~')
        ? path.join(os.homedir(), args.root.slice(1))
        : path.resolve(args.root)
      if (args.cloneRoot && process.platform === 'darwin') {
        const cloned = path.join(tmpDir, 'corpus-clone')
        execFileSync('cp', ['-cR', resolvedRoot, cloned], { stdio: 'inherit' })
        scanRoot = cloned
        corpusKind = `apfs-clone(${resolvedRoot})`
      } else {
        scanRoot = resolvedRoot
        corpusKind = `direct(${resolvedRoot})`
      }
    } else {
      const synthRoot = path.join(tmpDir, 'synthetic-corpus')
      const count = buildSyntheticCorpus(synthRoot, args.syntheticCount)
      scanRoot = synthRoot
      corpusKind = `synthetic(${count} files)`
    }

    const arenaAndSearch = await benchArenaAndSearch(nativeFileIndex, scanRoot, tmpDir)
    const darwinApp = benchDarwinFrontmostApp(nativeFileIndex, args.skipOsascript)
    const sqlite = args.skipSqlite ? { skipped: true } : await benchSqliteRetentionAndWal(tmpDir)
    const semanticProfile = benchSemanticProfileScoring()

    const report = {
      timestamp: new Date().toISOString(),
      platform: `${process.platform}-${process.arch}`,
      nodeVersion: process.version,
      cpus: os.cpus().length,
      corpus: corpusKind,
      ...arenaAndSearch,
      darwinApp,
      sqlite,
      semanticProfile
    }

    if (args.jsonOut) {
      fs.mkdirSync(path.dirname(path.resolve(args.jsonOut)), { recursive: true })
      fs.writeFileSync(path.resolve(args.jsonOut), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    }

    console.log(JSON.stringify(report, null, 2))
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
