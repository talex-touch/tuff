'use strict'

const assert = require('node:assert/strict')
const { Buffer } = require('node:buffer')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const nativeFileIndex = require('./file-index')

function cleanupTempDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
}

test('exposes capability flags and optional disable toggle cleanly', () => {
  const support = nativeFileIndex.getFileIndexSupport()
  assert.equal(support.supported, true)
  assert.equal(typeof support.platform, 'string')
  if (process.platform === 'darwin') {
    assert.equal(support.hasBulkScanner, true)
    assert.equal(support.hasNativeFsevents, true)
    assert.equal(support.hasNativeSpotlight, true)
    assert.equal(support.hasNativeFrontmostApp, true)
  }
  else {
    assert.equal(support.hasBulkScanner, false)
    assert.equal(support.hasNativeFsevents, false)
    assert.equal(support.hasNativeSpotlight, false)
    assert.equal(support.hasNativeFrontmostApp, false)
    assert.equal(nativeFileIndex.getFrontmostApplicationDarwin(), null)
    assert.equal(nativeFileIndex.getFseventsVolumeCheckpoint(os.tmpdir()).supported, false)
  }
})

test('NativeFileArena indexes, searches (exact/fzf/pinyin/UTF-16), mutates delta, and reloads snapshot', async () => {
  const arena = nativeFileIndex.createNativeFileArena()
  assert.ok(arena, 'NativeFileArena should be constructed')

  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tuff-arena-test-')))
  try {
    const nmDir = path.join(tmp, 'node_modules', 'pkg')
    fs.mkdirSync(nmDir, { recursive: true })
    fs.writeFileSync(path.join(nmDir, 'ignored.js'), 'ignored')
    fs.writeFileSync(path.join(tmp, 'file-provider-search-result-service.ts'), 'export {}')
    fs.writeFileSync(path.join(tmp, '重庆架构方案😀.md'), '# test')
    const snapPath = path.join(tmp, 'arena.bin')

    const bulk = await nativeFileIndex.scanDirectoryBulk([tmp], {
      excludeNames: ['node_modules', '.git'],
      includeDirs: false,
      maxDepth: 12,
    })
    assert.equal(bulk.fileCount, 2)
    assert.equal(bulk.backend, process.platform === 'darwin' ? 'getattrlistbulk' : 'readdir')

    const idxStats = await arena.indexRoots([tmp], {
      excludeNames: ['node_modules', '.git'],
      includeDirs: true,
      maxDepth: 12,
    })
    assert.equal(idxStats.fileCount, 2)
    assert.equal(arena.hasPath(path.join(tmp, 'file-provider-search-result-service.ts')), true)
    assert.equal(arena.hasPath(path.join(tmp, 'missing-file.ts')), false)

    const fzf = await arena.search('fpsr', { limit: 10 })
    assert.equal(fzf.items.length, 1)
    assert.equal(fzf.items[0].name, 'file-provider-search-result-service.ts')

    const cq = await arena.search('cq', { limit: 10 })
    assert.equal(cq.items.length, 1)
    assert.equal(cq.items[0].name, '重庆架构方案😀.md')
    assert.deepEqual(cq.items[0].matchedRanges, [[0, 2]])

    const extFilter = await arena.search('', { limit: 5, extensions: ['.md'], typeFilter: 'file' })
    assert.equal(extFilter.items.length, 1)
    assert.equal(extFilter.items[0].extension, '.md')
    assert.equal(typeof extFilter.items[0].mtimeMs, 'number')
    assert.equal(extFilter.items[0].mtimeMs, extFilter.items[0].mtimeSec * 1000)

    const recencyFiles = await arena.search('', { limit: 5, typeFilter: 'file' })
    assert.equal(recencyFiles.items.length, 2)
    assert.ok(recencyFiles.items[0].mtimeMs >= recencyFiles.items[1].mtimeMs)

    const snapshotBytes = arena.saveSnapshot(snapPath)
    assert.ok(snapshotBytes > 24)
    assert.equal(fs.readFileSync(snapPath).subarray(0, 8).toString('ascii'), 'TUFFIDX3')

    const reloaded = nativeFileIndex.createNativeFileArena()
    const reloadedStats = reloaded.loadSnapshot(snapPath)
    assert.equal(reloadedStats.fileCount, 2)
    assert.equal(reloaded.hasPath(path.join(tmp, '重庆架构方案😀.md')), true)

    // Reject legacy TUFFIDX2 snapshots cleanly so caller rebuilds
    const legacySnap = path.join(tmp, 'legacy.bin')
    fs.writeFileSync(legacySnap, Buffer.from('TUFFIDX2\x00\x00\x00\x00'))
    assert.throws(() => reloaded.loadSnapshot(legacySnap), /TUFFIDX3/)

    const liveNew = path.join(tmp, '微信测试.txt')
    reloaded.applyDelta([{ dir: tmp, name: '微信测试.txt', isDir: false, mtimeSec: 123456 }], [], [])
    assert.equal(reloaded.hasPath(liveNew), true)
    const wx = await reloaded.search('wx', { limit: 10 })
    assert.equal(wx.items.length, 1)
    assert.equal(wx.items[0].path, liveNew)
    assert.equal(wx.items[0].mtimeSec, 123456)
    assert.equal(wx.items[0].mtimeMs, 123456000)

    reloaded.applyDelta([], [liveNew], [])
    assert.equal(reloaded.hasPath(liveNew), false)
    const afterDelete = await reloaded.search('wx', { limit: 10 })
    assert.equal(afterDelete.items.length, 0)
  }
  finally {
    cleanupTempDir(tmp)
  }
})

test('scan filter enforces excludeDirSuffixes, excludeHidden, and case-insensitive projectMarkers', async () => {
  const arena = nativeFileIndex.createNativeFileArena()
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tuff-filter-test-')))
  try {
    fs.mkdirSync(path.join(tmp, 'rust-proj', 'target'), { recursive: true })
    fs.mkdirSync(path.join(tmp, 'rust-proj', 'src'), { recursive: true })
    fs.writeFileSync(path.join(tmp, 'rust-proj', 'Cargo.toml'), '[package]')
    fs.writeFileSync(path.join(tmp, 'rust-proj', 'target', 'artifact.bin'), 'x')
    fs.writeFileSync(path.join(tmp, 'rust-proj', 'src', 'lib.rs'), 'pub fn x() {}')

    fs.mkdirSync(path.join(tmp, 'Pics.photoslibrary'), { recursive: true })
    fs.writeFileSync(path.join(tmp, 'Pics.photoslibrary', 'uuid.jpg'), 'x')
    fs.writeFileSync(path.join(tmp, '.hidden-note.md'), 'secret')

    await arena.indexRoots([tmp], {
      contextDependentNames: ['target'],
      projectMarkers: ['cargo.toml'],
      excludeDirSuffixes: ['.photoslibrary', '.app'],
      excludeHidden: true,
      includeDirs: true,
    })

    assert.equal(arena.hasPath(path.join(tmp, 'rust-proj', 'src', 'lib.rs')), true)
    assert.equal(arena.hasPath(path.join(tmp, 'rust-proj', 'target', 'artifact.bin')), false)
    assert.equal(arena.hasPath(path.join(tmp, 'Pics.photoslibrary', 'uuid.jpg')), false)
    assert.equal(arena.hasPath(path.join(tmp, '.hidden-note.md')), false)
  }
  finally {
    cleanupTempDir(tmp)
  }
})

if (process.platform === 'darwin') {
  test('getFrontmostApplicationDarwin returns valid metadata and hits PID cache cleanly', () => {
    const first = nativeFileIndex.getFrontmostApplicationDarwin()
    const second = nativeFileIndex.getFrontmostApplicationDarwin()
    assert.ok(first === null || typeof first === 'object')
    if (first && second && first.processId && second.processId === first.processId) {
      assert.equal(second.bundleId ?? null, first.bundleId ?? null)
      assert.equal(second.executablePath ?? null, first.executablePath ?? null)
    }
  })
}

if (process.platform === 'darwin') {
  test('NativeFsEventsWatcher delivers live events and validated sinceEventId offline replay', async () => {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tuff-fsev-test-')))
    try {
      const ck = nativeFileIndex.getFseventsVolumeCheckpoint(tmp)
      assert.equal(ck.supported, true)
      assert.ok(ck.volumeUuid)
      assert.ok(ck.currentEventId)

      const watcher = nativeFileIndex.createNativeFsEventsWatcher()
      const seen = []
      const res = watcher.start({
        roots: [tmp],
        sinceEventId: ck.currentEventId,
        volumeUuid: ck.volumeUuid,
        latencyMs: 25,
      }, ev => seen.push(...ev))
      assert.equal(res.replayingSinceWhen, true)

      const offlineFile = path.join(tmp, 'replay-check.txt')
      fs.writeFileSync(offlineFile, 'hello')
      const deadline = Date.now() + 2000
      while (Date.now() < deadline && !seen.some(e => e.path === offlineFile)) {
        await new Promise(r => setTimeout(r, 40))
      }
      watcher.stop()
      assert.ok(seen.some(e => e.path === offlineFile), 'should deliver new file via FSEventStream')
    }
    finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })
}
