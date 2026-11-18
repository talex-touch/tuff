import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => `/tmp/tuff-native-index-test-${name}`)
  }
}))

import { normalizeFsPath } from '@talex-touch/utils/common/file-scan-utils'
import { TuffInputType } from '@talex-touch/utils'
import { getTypeTagsForExtension, WHITELISTED_EXTENSIONS } from '../constants'
import { FileProviderNativeIndexService } from './file-provider-native-index-service'
import { resolveExtensionsForTypeFilters, resolveTypeTag } from './file-provider-search-service'
import { mapFileToTuffItem } from '../utils'

function extractSimpleFilters(rawText: string) {
  const retained: string[] = []
  const extensionFilters: string[] = []
  const typeFilters = new Set<
    ReturnType<typeof resolveTypeTag> extends infer T ? Exclude<T, null> : never
  >()

  for (const token of rawText.split(/\s+/).filter(Boolean)) {
    const lower = token.toLowerCase()
    if (lower.startsWith('ext:')) {
      const ext = `.${lower.slice(4)}`
      if (WHITELISTED_EXTENSIONS.has(ext)) {
        extensionFilters.push(ext)
        continue
      }
    }
    if (lower.startsWith('type:') || lower.startsWith('kind:')) {
      const tag = resolveTypeTag(lower.slice(5))
      if (tag) {
        typeFilters.add(tag)
        continue
      }
    }
    const simpleGlob = lower.match(/^\*\.(\w+)$/)
    if (simpleGlob) {
      const ext = `.${simpleGlob[1]}`
      if (WHITELISTED_EXTENSIONS.has(ext)) {
        extensionFilters.push(ext)
        continue
      }
    }
    retained.push(token)
  }

  return {
    text: retained.join(' '),
    typeFilters,
    extensionFilters
  }
}

describe('FileProviderNativeIndexService (integration)', () => {
  let tmpRoot = ''
  let watchDir = ''
  let storageDir = ''
  let contentEnabled = false
  let service: FileProviderNativeIndexService

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tuff-native-service-'))
    watchDir = normalizeFsPath(path.join(tmpRoot, 'watch'))
    storageDir = normalizeFsPath(path.join(tmpRoot, 'storage'))
    contentEnabled = false
    await fs.mkdir(watchDir, { recursive: true })
    await fs.mkdir(storageDir, { recursive: true })

    service = new FileProviderNativeIndexService({
      providerId: 'file-provider',
      providerName: 'File Provider',
      getWatchPaths: () => [watchDir],
      getStorageDir: () => storageDir,
      isContentIndexingEnabled: () => contentEnabled,
      isPathAdmitted: (p) => normalizeFsPath(p).startsWith(watchDir),
      normalizePath: (p) => normalizeFsPath(p),
      buildItem: (file, exts) => mapFileToTuffItem(file, exts, 'file-provider', 'File Provider'),
      extractFilters: extractSimpleFilters,
      resolveExtensionsForTypeFilters,
      logInfo: vi.fn(),
      logDebug: vi.fn(),
      logWarn: vi.fn()
    })
  })

  afterEach(async () => {
    await service.stop()
    if (tmpRoot) {
      await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => undefined)
    }
  })

  it('scans with traversal policy, searches fuzzy/pinyin/filters, evicts stale hits, and persists snapshots', async () => {
    if (!service.isSupported()) return

    // Valid files + personal build folder (no project marker -> must stay indexed!)
    await fs.mkdir(path.join(watchDir, 'src'), { recursive: true })
    await fs.mkdir(path.join(watchDir, 'Documents', 'build'), { recursive: true })
    await fs.writeFile(path.join(watchDir, 'src', 'file-provider-search-result.ts'), 'export {}\n')
    await fs.writeFile(path.join(watchDir, 'src', '重庆架构方案😀.md'), '# plan\n')
    await fs.writeFile(path.join(watchDir, 'Documents', 'build', 'roadmap-notes.md'), '# keep\n')

    // Excluded trees: dependency folder, project dist, bundle, and linked git worktree
    await fs.mkdir(path.join(watchDir, 'project', 'dist'), { recursive: true })
    await fs.writeFile(path.join(watchDir, 'project', 'package.json'), '{}')
    await fs.writeFile(path.join(watchDir, 'project', 'dist', 'bundle-secret.js'), 'bundle')
    await fs.mkdir(path.join(watchDir, 'project', 'node_modules', 'pkg'), { recursive: true })
    await fs.writeFile(path.join(watchDir, 'project', 'node_modules', 'pkg', 'dep-secret.js'), 'x')
    await fs.mkdir(path.join(watchDir, 'Pics.photoslibrary'), { recursive: true })
    await fs.writeFile(path.join(watchDir, 'Pics.photoslibrary', 'uuid-photo.jpg'), 'x')
    await fs.mkdir(path.join(watchDir, 'worktree-clone'), { recursive: true })
    await fs.writeFile(
      path.join(watchDir, 'worktree-clone', '.git'),
      'gitdir: /tmp/main/.git/worktrees/w\n'
    )
    await fs.writeFile(path.join(watchDir, 'worktree-clone', 'wt-file.ts'), 'export {}\n')

    const started = await service.start()
    expect(started).toBe(true)
    expect(service.isReady()).toBe(true)

    // 1. Subsequence fzf search
    const fuzzy = await service.search(
      { text: 'fpsr', inputs: [{ type: TuffInputType.Text, content: 'fpsr' }] },
      new AbortController().signal
    )
    expect(fuzzy?.items.map((item) => item.render.basic?.title)).toContain(
      'file-provider-search-result.ts'
    )

    // 2. Heteronym CJK pinyin + UTF-16 matchResult highlights
    for (const pyQuery of ['cq', 'zq']) {
      const res = await service.search(
        { text: pyQuery, inputs: [{ type: TuffInputType.Text, content: pyQuery }] },
        new AbortController().signal
      )
      const hit = res?.items.find((item) => item.render.basic?.title === '重庆架构方案😀.md')
      expect(hit).toBeDefined()
      expect(hit?.meta?.extension?.matchResult).toEqual([{ start: 0, end: 2 }])
    }

    // 3. Personal build folder kept; project dist / node_modules / photoslibrary / worktree excluded
    const personal = await service.search(
      { text: 'roadmap', inputs: [{ type: TuffInputType.Text, content: 'roadmap' }] },
      new AbortController().signal
    )
    expect(personal?.items.map((item) => item.render.basic?.title)).toContain('roadmap-notes.md')

    for (const hiddenQuery of ['bundle-secret', 'dep-secret', 'uuid-photo', 'wt-file']) {
      const hidden = await service.search(
        { text: hiddenQuery, inputs: [{ type: TuffInputType.Text, content: hiddenQuery }] },
        new AbortController().signal
      )
      expect(hidden?.items).toEqual([])
    }

    // 4. Filter-only extension query
    const mdOnly = await service.search(
      { text: '*.md', inputs: [{ type: TuffInputType.Text, content: '*.md' }] },
      new AbortController().signal
    )
    const mdTitles = mdOnly?.items.map((item) => item.render.basic?.title) ?? []
    expect(mdTitles).toContain('重庆架构方案😀.md')
    expect(mdTitles).toContain('roadmap-notes.md')
    for (const item of mdOnly?.items ?? []) {
      const tags = getTypeTagsForExtension(
        path.extname(item.render.basic?.title ?? '').toLowerCase()
      )
      expect(tags.length).toBeGreaterThan(0)
    }

    // 5. Lazy lstat stale eviction
    const roadmapPath = path.join(watchDir, 'Documents', 'build', 'roadmap-notes.md')
    await fs.unlink(roadmapPath)
    const afterDelete = await service.search(
      { text: 'roadmap', inputs: [{ type: TuffInputType.Text, content: 'roadmap' }] },
      new AbortController().signal
    )
    expect(afterDelete?.items).toEqual([])

    // 6. Snapshot & checkpoint saved on disk and reloaded cleanly on restart
    await service.stop()
    await expect(fs.stat(path.join(storageDir, 'file-index.arena.bin'))).resolves.toBeDefined()
    await expect(
      fs.stat(path.join(storageDir, 'file-index.checkpoint.json'))
    ).resolves.toBeDefined()

    const reloaded = new FileProviderNativeIndexService({
      providerId: 'file-provider',
      providerName: 'File Provider',
      getWatchPaths: () => [watchDir],
      getStorageDir: () => storageDir,
      isContentIndexingEnabled: () => contentEnabled,
      isPathAdmitted: (p) => normalizeFsPath(p).startsWith(watchDir),
      normalizePath: (p) => normalizeFsPath(p),
      buildItem: (file, exts) => mapFileToTuffItem(file, exts, 'file-provider', 'File Provider'),
      extractFilters: extractSimpleFilters,
      resolveExtensionsForTypeFilters,
      logInfo: vi.fn(),
      logDebug: vi.fn(),
      logWarn: vi.fn()
    })
    service = reloaded
    await expect(reloaded.start()).resolves.toBe(true)
    const afterReload = await reloaded.search(
      { text: 'cq', inputs: [{ type: TuffInputType.Text, content: 'cq' }] },
      new AbortController().signal
    )
    expect(afterReload?.items.map((i) => i.render.basic?.title)).toContain('重庆架构方案😀.md')

    // 7. Content indexing ON yields null
    contentEnabled = true
    await expect(
      reloaded.search(
        { text: 'cq', inputs: [{ type: TuffInputType.Text, content: 'cq' }] },
        new AbortController().signal
      )
    ).resolves.toBeNull()
  })

  it('recovers cleanly from incompatible snapshot magic and checks duplicate basenames accurately', async () => {
    if (!service.isSupported()) return

    await fs.mkdir(path.join(watchDir, 'Projects', 'alpha', 'dev'), { recursive: true })
    await fs.writeFile(path.join(watchDir, 'Projects', 'alpha', 'dev', 'guide.md'), '# guide\n')
    for (let i = 0; i < 30; i += 1) {
      const folder = path.join(watchDir, `dir-${String(i).padStart(2, '0')}`)
      await fs.mkdir(folder, { recursive: true })
      await fs.writeFile(path.join(folder, 'index.ts'), `export const id = ${i}\n`)
    }

    // Write incompatible stale snapshot magic + matching checkpoint before start()
    await fs.writeFile(path.join(storageDir, 'file-index.arena.bin'), 'TUFFIDX1-corrupt')
    await fs.writeFile(
      path.join(storageDir, 'file-index.checkpoint.json'),
      JSON.stringify({
        version: 1,
        watchRootsKey: watchDir,
        volumeUuid: null,
        lastEventId: null,
        updatedAt: Date.now()
      })
    )

    await expect(service.start()).resolves.toBe(true)
    expect(service.isReady()).toBe(true)

    // `Projects/alpha/dev` is NOT pruned by root-anchored macOS `/dev` rule
    const devRes = await service.search(
      { text: 'guide', inputs: [{ type: TuffInputType.Text, content: 'guide' }] },
      new AbortController().signal
    )
    expect(devRes?.items.map((i) => i.render.basic?.title)).toContain('guide.md')

    // All 30 duplicate basenames are accurately verified via checkIndexedFile
    await expect(service.checkIndexedFile(path.join(watchDir, 'dir-29', 'index.ts'))).resolves.toBe(
      true
    )
    await expect(service.checkIndexedFile(path.join(watchDir, 'dir-99', 'index.ts'))).resolves.toBe(
      false
    )
  })
})
