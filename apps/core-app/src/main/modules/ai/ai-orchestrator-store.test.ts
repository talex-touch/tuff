import type { AiImportCandidate } from '@talex-touch/utils/types/ai-orchestrator'
import type { AiPreparedImportItem } from './ai-import-types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const storeMocks = vi.hoisted(() => {
  const imports: Array<Record<string, unknown>> = []
  const scans: Array<Record<string, unknown>> = []
  const revisions: Array<Record<string, unknown>> = []
  const secrets = new Map<string, string>()
  let rejectSecretRemovalFor: string | undefined

  const currentImports = () => imports.filter((item) => item.current === true)
  const tableName = (table: object) => {
    const symbolValues = table as Record<symbol, unknown>
    return Object.getOwnPropertySymbols(table)
      .map((symbol) => symbolValues[symbol])
      .find(
        (value): value is string =>
          value === 'ai_import_scans' ||
          value === 'ai_import_items' ||
          value === 'ai_import_revisions'
      )
  }
  const rowsFor = (table: object) => {
    if (tableName(table) === 'ai_import_scans') return scans
    if (tableName(table) === 'ai_import_items') return imports
    if (tableName(table) === 'ai_import_revisions') return revisions
    return []
  }
  const conditionReferencesCurrent = (condition: unknown, seen = new Set<object>()): boolean => {
    if (!condition || typeof condition !== 'object' || seen.has(condition)) return false
    seen.add(condition)
    if ('name' in condition && condition.name === 'current') return true
    return Object.values(condition).some((value) => conditionReferencesCurrent(value, seen))
  }
  const query = (table: object) => {
    const rows = rowsFor(table)
    const filteredRows = (condition: unknown) =>
      tableName(table) === 'ai_import_items' && conditionReferencesCurrent(condition)
        ? currentImports()
        : rows
    const awaitableRows = (selectedRows: Array<Record<string, unknown>>) => ({
      limit: async (limit: number) => selectedRows.slice(0, limit),
      orderBy: async () => selectedRows,
      then: <TResult1 = Array<Record<string, unknown>>, TResult2 = never>(
        onfulfilled?:
          | ((value: Array<Record<string, unknown>>) => TResult1 | PromiseLike<TResult1>)
          | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
      ) => Promise.resolve(selectedRows).then(onfulfilled, onrejected)
    })
    return {
      where: (condition: unknown) => awaitableRows(filteredRows(condition)),
      orderBy: async () => rows
    }
  }
  const db = {
    select: () => ({ from: query }),
    insert: (table: object) => ({
      values: async (values: Record<string, unknown> | Array<Record<string, unknown>>) => {
        const target = rowsFor(table)
        target.push(...(Array.isArray(values) ? values : [values]))
        return { onConflictDoUpdate: async () => undefined }
      }
    }),
    update: (table: object) => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          if (tableName(table) !== 'ai_import_items') return
          for (const row of currentImports()) Object.assign(row, values)
        }
      })
    }),
    delete: (table: object) => ({
      where: async () => {
        if (tableName(table) !== 'ai_import_items') return
        const current = new Set(currentImports())
        const survivors = imports.filter((row) => !current.has(row))
        imports.splice(0, imports.length, ...survivors)
      }
    }),
    transaction: async (operation: (tx: typeof db) => Promise<void>) => await operation(db)
  }

  return {
    imports,
    scans,
    revisions,
    secrets,
    get rejectSecretRemovalFor() {
      return rejectSecretRemovalFor
    },
    set rejectSecretRemovalFor(value: string | undefined) {
      rejectSecretRemovalFor = value
    },
    db
  }
})

vi.mock('electron', () => ({ app: {} }))
vi.mock('../../db/db-write-scheduler', () => ({
  dbWriteScheduler: {
    schedule: async (_label: string, operation: () => Promise<void>) => await operation()
  }
}))
vi.mock('../database', () => ({ databaseModule: { getDb: () => storeMocks.db } }))
vi.mock('../../utils/app-root-path', () => ({ resolveRuntimeRootPath: () => '/isolated-profile' }))
vi.mock('../../utils/secure-store', () => ({
  getSecureStoreValue: vi.fn(
    async (_root: string, authRef: string) => storeMocks.secrets.get(authRef) ?? null
  ),
  setSecureStoreValue: vi.fn(async (_root: string, authRef: string, value: string | null) => {
    if (value === null && authRef === storeMocks.rejectSecretRemovalFor) return false
    if (value === null) storeMocks.secrets.delete(authRef)
    else storeMocks.secrets.set(authRef, value)
    return true
  })
}))

import { AiOrchestratorStore } from './ai-orchestrator-store'

function candidate(overrides: Partial<AiImportCandidate> = {}): AiImportCandidate {
  return {
    id: 'candidate-release',
    sourceId: 'pi:project:release',
    provider: 'pi',
    scope: 'project',
    targetScope: 'workspace',
    canonicalRootId: '/workspace/release',
    sourceKey: 'skill:release',
    kind: 'skill',
    name: 'release',
    path: '/workspace/release/.pi/skills/release/SKILL.md',
    fingerprint: 'fingerprint-v1',
    state: 'changed',
    warnings: [],
    ignoredFields: [],
    blockingIssues: [],
    description: 'Release procedure',
    manifestPath: '/workspace/release/.pi/skills/release/SKILL.md',
    ...overrides
  } as AiImportCandidate
}

function prepared(
  input: AiImportCandidate,
  overrides: Partial<AiPreparedImportItem> = {}
): AiPreparedImportItem {
  return {
    candidate: input,
    targetScope: input.targetScope,
    workspaceRoot: '/workspace/release',
    contentRef: `content:${input.id}`,
    projection: { description: input.name },
    secrets: [],
    mcpProfiles: [],
    ...overrides
  }
}

function seedScan(candidates: AiImportCandidate[]): void {
  storeMocks.scans.push({
    id: 'scan-release',
    createdAt: 1,
    cwd: '/workspace/release',
    sources: '[]',
    candidates: JSON.stringify(candidates)
  })
}

function seedCurrentImport(overrides: Record<string, unknown> = {}): void {
  storeMocks.imports.push({
    id: 'candidate-release:revision-old',
    candidateId: 'candidate-release',
    sourceId: 'pi:project:release',
    provider: 'pi',
    scope: 'project',
    targetScope: 'workspace',
    workspaceRoot: '/workspace/release',
    kind: 'skill',
    name: 'release',
    alias: 'release',
    sourceKey: 'skill:release',
    path: '/workspace/release/.pi/skills/release/SKILL.md',
    fingerprint: 'fingerprint-v1',
    snapshot: '{}',
    contentRef: 'content:candidate-release',
    projection: JSON.stringify({ description: 'release' }),
    secrets: '[]',
    state: 'active',
    revisionId: 'revision-old',
    current: true,
    active: false,
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  })
}

describe('AiOrchestratorStore imported configuration lifecycle', () => {
  beforeEach(() => {
    storeMocks.imports.length = 0
    storeMocks.scans.length = 0
    storeMocks.revisions.length = 0
    storeMocks.secrets.clear()
    storeMocks.rejectSecretRemovalFor = undefined
    vi.clearAllMocks()
  })

  it('replaces a current item when alias or scope changes despite an unchanged source fingerprint and preserves disabled state', async () => {
    const scanned = candidate()
    seedScan([scanned])
    seedCurrentImport()
    const store = new AiOrchestratorStore()

    const result = await store.applyPreparedImportScan('scan-release', [
      prepared(scanned, { targetScope: 'global', workspaceRoot: undefined, alias: 'ship' })
    ])

    expect(result).toMatchObject({ imported: 1, unchanged: 0 })
    const current = await store.listImportedItems()
    expect(current).toHaveLength(1)
    expect(current[0]).toMatchObject({
      candidateId: 'candidate-release',
      targetScope: 'global',
      alias: 'ship',
      active: false
    })
    const allRevisions = await store.listImportedItems(true)
    expect(allRevisions.filter((item) => item.candidateId === 'candidate-release')).toHaveLength(2)
  })

  it('rejects duplicate aliases in the same effective scope before creating either imported item', async () => {
    const first = candidate({ id: 'candidate-one', name: 'one', sourceKey: 'skill:one' })
    const second = candidate({ id: 'candidate-two', name: 'two', sourceKey: 'skill:two' })
    seedScan([first, second])
    const store = new AiOrchestratorStore()

    await expect(
      store.applyPreparedImportScan('scan-release', [
        prepared(first, { alias: 'shared' }),
        prepared(second, { alias: 'shared' })
      ])
    ).rejects.toThrow('Import alias shared is already assigned')

    expect(await store.listImportedItems()).toEqual([])
    expect(storeMocks.revisions).toEqual([])
  })

  it('removes a superseded auth reference only after the replacement retains a different reference', async () => {
    const scanned = candidate({
      kind: 'mcp',
      name: 'release-mcp',
      sourceKey: 'mcp:release'
    } as Partial<AiImportCandidate>)
    seedScan([scanned])
    seedCurrentImport({
      kind: 'mcp',
      sourceKey: 'mcp:release',
      fingerprint: 'fingerprint-old',
      secrets: JSON.stringify([{ keyPath: 'env.RELEASE_TOKEN', authRef: 'auth-old' }])
    })
    storeMocks.secrets.set('auth-old', 'old-secret')
    storeMocks.secrets.set('auth-new', 'new-secret')
    const store = new AiOrchestratorStore()

    await store.applyPreparedImportScan('scan-release', [
      prepared(scanned, {
        secrets: [{ keyPath: 'env.RELEASE_TOKEN', authRef: 'auth-new' }]
      })
    ])

    expect(storeMocks.secrets.has('auth-old')).toBe(false)
    expect(storeMocks.secrets.get('auth-new')).toBe('new-secret')
  })

  it('versions a source-missing current item once while retaining its enabled state, content, and secrets', async () => {
    const missing = candidate({ state: 'source-missing' })
    seedScan([missing])
    seedCurrentImport({
      active: true,
      contentRef: 'content:release-preserved',
      secrets: JSON.stringify([{ keyPath: 'env.RELEASE_TOKEN', authRef: 'auth-release' }])
    })
    storeMocks.secrets.set('auth-release', 'release-secret')
    const store = new AiOrchestratorStore()

    const first = await store.applyPreparedImportScan('scan-release', [])
    expect(first).toMatchObject({ imported: 0, unchanged: 0, removed: 1 })
    expect(storeMocks.revisions.at(-1)).toMatchObject({ removedCount: 1 })
    await expect(store.listImportedItems()).resolves.toEqual([
      expect.objectContaining({
        candidateId: 'candidate-release',
        state: 'source-missing',
        active: true,
        contentRef: 'content:release-preserved',
        secrets: [{ keyPath: 'env.RELEASE_TOKEN', authRef: 'auth-release' }]
      })
    ])
    expect(storeMocks.secrets.get('auth-release')).toBe('release-secret')

    const second = await store.applyPreparedImportScan('scan-release', [])
    expect(second).toMatchObject({ imported: 0, unchanged: 0, removed: 0 })
    expect(storeMocks.revisions.at(-1)).toMatchObject({ removedCount: 0 })
    expect(await store.listImportedItems(true)).toHaveLength(2)
    expect(await store.listImportedItems()).toHaveLength(1)
  })

  it('restores earlier secrets and leaves the item current when serial verified deletion cannot remove a later secret', async () => {
    seedCurrentImport({
      secrets: JSON.stringify([
        { keyPath: 'env.FIRST', authRef: 'auth-first' },
        { keyPath: 'env.SECOND', authRef: 'auth-second' }
      ])
    })
    storeMocks.secrets.set('auth-first', 'first-secret')
    storeMocks.secrets.set('auth-second', 'second-secret')
    storeMocks.rejectSecretRemovalFor = 'auth-second'
    const store = new AiOrchestratorStore()

    await expect(store.deleteImportedItem('candidate-release:revision-old')).rejects.toThrow(
      'Failed to remove imported secret reference auth-second'
    )

    expect(storeMocks.secrets).toEqual(
      new Map([
        ['auth-first', 'first-secret'],
        ['auth-second', 'second-secret']
      ])
    )
    expect(await store.getImportedItem('candidate-release:revision-old')).toMatchObject({
      active: false,
      candidateId: 'candidate-release'
    })
  })
})
