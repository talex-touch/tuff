import { describe, expect, it, vi } from 'vitest'
import {
  buildRootOnlyExcludePaths,
  FileProviderFullScanCheckpointService,
  FULL_SCAN_CHECKPOINT_CLEAR_REASON,
  FULL_SCAN_CHECKPOINT_REASON,
  listScanChildDirectories
} from './file-provider-full-scan-checkpoint-service'

function createService(overrides: {
  children?: string[]
  completed?: string[]
  listError?: Error
}) {
  const recordCompleted = vi.fn(async () => undefined)
  const clearCompleted = vi.fn(async () => undefined)
  // The real store looks a path up under its raw and its normalized form (see
  // expandIndexedSourceProgressPaths), so the fake answers when either form was recorded.
  const getCompletedPaths = vi.fn(async (paths: string[]) => {
    const completed = new Set((overrides.completed ?? []).map((path) => path.toLowerCase()))
    return new Set(paths.filter((path) => completed.has(path.toLowerCase())))
  })
  const service = new FileProviderFullScanCheckpointService({
    listChildDirectories: vi.fn(async () => {
      if (overrides.listError) throw overrides.listError
      return overrides.children ?? []
    }),
    getCompletedPaths,
    recordCompleted,
    clearCompleted,
    normalizePath: (path) => path.toLowerCase()
  })
  return { service, recordCompleted, clearCompleted, getCompletedPaths }
}

describe('FileProviderFullScanCheckpointService', () => {
  it('splits a root into pending and already-completed children', async () => {
    const { service, getCompletedPaths } = createService({
      children: ['/h/a', '/h/b', '/h/c'],
      completed: ['/h/b']
    })
    const plan = await service.plan('/h')
    expect(getCompletedPaths).toHaveBeenCalledWith(['/h/a', '/h/b', '/h/c'])
    expect(plan.pending).toEqual(['/h/a', '/h/c'])
    expect(plan.completed).toEqual(['/h/b'])
  })

  it('matches completion records through the path normalizer', async () => {
    const { service } = createService({ children: ['/h/Docs'], completed: ['/h/docs'] })
    const plan = await service.plan('/h')
    expect(plan.pending).toEqual([])
    expect(plan.completed).toEqual(['/h/Docs'])
  })

  it('falls back to a whole-root walk when the root has no children or cannot be listed', async () => {
    const empty = createService({ children: [] })
    expect(await empty.service.plan('/h')).toEqual({
      rootPath: '/h',
      children: [],
      pending: [],
      completed: []
    })
    expect(empty.getCompletedPaths).not.toHaveBeenCalled()

    const broken = createService({ listError: new Error('EACCES') })
    expect((await broken.service.plan('/h')).children).toEqual([])
  })

  it('records a child with the checkpoint reason and clears children with the clear reason', async () => {
    const { service, recordCompleted, clearCompleted } = createService({ children: ['/h/a'] })
    await service.markChildCompleted('/h/a')
    expect(recordCompleted).toHaveBeenCalledWith('/h/a', FULL_SCAN_CHECKPOINT_REASON)
    await service.clearRootCheckpoints(['/h/a', '/h/b'])
    expect(clearCompleted).toHaveBeenCalledWith(['/h/a', '/h/b'], FULL_SCAN_CHECKPOINT_CLEAR_REASON)
    await service.clearRootCheckpoints([])
    expect(clearCompleted).toHaveBeenCalledTimes(1)
  })
})

describe('buildRootOnlyExcludePaths', () => {
  it('adds every child to the caller exclude set without mutating it', () => {
    const original = new Set(['/h/db.sqlite'])
    const combined = buildRootOnlyExcludePaths(['/h/a', '/h/b'], original)
    expect([...combined].sort()).toEqual(['/h/a', '/h/b', '/h/db.sqlite'])
    expect([...original]).toEqual(['/h/db.sqlite'])
  })
})

describe('listScanChildDirectories', () => {
  const entry = (name: string, directory = true, symlink = false) => ({
    name,
    isDirectory: () => directory,
    isSymbolicLink: () => symlink
  })

  it('keeps only real directories the traversal filter admits, sorted', async () => {
    const getTraversalExclusionReason = vi.fn((path: string) =>
      path.endsWith('/node_modules') ? ('development-path' as const) : null
    )
    const children = await listScanChildDirectories('/h', {
      readdir: async () => [
        entry('zeta'),
        entry('node_modules'),
        entry('notes.txt', false),
        entry('link', true, true),
        entry('alpha')
      ],
      join: (root, name) => `${root}/${name}`,
      hooks: { getTraversalExclusionReason },
      excludePathsSet: new Set(['/h/zeta'])
    })
    expect(children).toEqual(['/h/alpha'])
    expect(getTraversalExclusionReason).toHaveBeenCalledWith('/h/alpha', {
      siblingNames: ['zeta', 'node_modules', 'notes.txt', 'link', 'alpha']
    })
  })
})
