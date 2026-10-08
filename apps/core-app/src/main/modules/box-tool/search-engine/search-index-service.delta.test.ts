import { createClient, type Client } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SearchIndexService } from './search-index-service'

describe('SearchIndexService provider replacement transactions', () => {
  it('keeps committed provider data visible until staged replacement commit and preserves it on abort', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tuff-search-index-replacement-'))
    let client: Client | undefined
    try {
      client = createClient({ url: `file:${join(directory, 'search-index.sqlite')}` })
      await client.execute(`
        CREATE TABLE keyword_mappings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          keyword TEXT NOT NULL,
          item_id TEXT NOT NULL,
          provider_id TEXT NOT NULL DEFAULT '',
          priority REAL NOT NULL DEFAULT 1.0
        )
      `)
      await client.execute(`
        CREATE TABLE search_index_meta (
          provider_id TEXT NOT NULL,
          item_id TEXT NOT NULL,
          keyword_hash TEXT NOT NULL,
          updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
          PRIMARY KEY (provider_id, item_id)
        )
      `)
      const db = drizzle(client)
      const service = new SearchIndexService(db as never, {
        directMode: true,
        initializationMode: 'writer'
      })
      await service.warmup()
      await service.indexItems([
        { itemId: 'file:old', providerId: 'file-provider', type: 'file', name: 'old-visible' }
      ])

      await client.execute(`
        CREATE TRIGGER reject_atomic_provider_apply
        BEFORE INSERT ON keyword_mappings
        WHEN NEW.item_id = 'file:atomic-new'
        BEGIN
          SELECT RAISE(ABORT, 'atomic provider apply blocked');
        END
      `)
      try {
        await expect(
          service.applyProviderItems(
            'file-provider',
            [
              {
                itemId: 'file:atomic-new',
                providerId: 'file-provider',
                type: 'file',
                name: 'atomic-new-visible'
              }
            ],
            ['file:old']
          )
        ).rejects.toThrow('Failed query: insert into "keyword_mappings"')
        await expect(service.countByProvider('file-provider')).resolves.toBe(1)
        await expect(service.search('file-provider', 'old-visible')).resolves.toEqual([
          expect.objectContaining({ itemId: 'file:old' })
        ])
        await expect(service.search('file-provider', 'atomic-new-visible')).resolves.toEqual([])
      } finally {
        await client.execute('DROP TRIGGER IF EXISTS reject_atomic_provider_apply')
      }

      await service.beginProviderReplacement('file-provider', 'replace-new')
      await service.stageProviderReplacementItems('file-provider', 'replace-new', [
        { itemId: 'file:new', providerId: 'file-provider', type: 'file', name: 'new-visible' }
      ])

      await expect(service.countByProvider('file-provider')).resolves.toBe(1)
      await expect(service.search('file-provider', 'old-visible')).resolves.toEqual([
        expect.objectContaining({ itemId: 'file:old' })
      ])
      await expect(service.search('file-provider', 'new-visible')).resolves.toEqual([])

      await expect(
        service.commitProviderReplacement('file-provider', 'replace-new')
      ).resolves.toMatchObject({
        removedItems: 1,
        indexedItems: 1
      })
      await expect(service.countByProvider('file-provider')).resolves.toBe(1)
      await expect(service.search('file-provider', 'old-visible')).resolves.toEqual([])
      await expect(service.search('file-provider', 'new-visible')).resolves.toEqual([
        expect.objectContaining({ itemId: 'file:new' })
      ])

      await service.beginProviderReplacement('file-provider', 'replace-invalid')
      await service.stageProviderReplacementItems('file-provider', 'replace-invalid', [
        {
          itemId: 'file:invalid',
          providerId: 'file-provider',
          type: 'file',
          name: 'invalid-candidate'
        }
      ])
      await client.execute({
        sql: `
          UPDATE search_index_replacement_stage
          SET document = ?
          WHERE replacement_id = ? AND provider_id = ?
        `,
        args: [
          JSON.stringify({ providerId: 'another-provider' }),
          'replace-invalid',
          'file-provider'
        ]
      })

      await expect(
        service.commitProviderReplacement('file-provider', 'replace-invalid')
      ).rejects.toThrow('SEARCH_INDEX_STAGED_PROVIDER_MISMATCH:file-provider')
      await expect(service.countByProvider('file-provider')).resolves.toBe(1)
      await expect(service.search('file-provider', 'new-visible')).resolves.toEqual([
        expect.objectContaining({ itemId: 'file:new' })
      ])
      await service.abortProviderReplacement('file-provider', 'replace-invalid')

      await service.beginProviderReplacement('file-provider', 'replace-abort')
      await service.stageProviderReplacementItems('file-provider', 'replace-abort', [
        {
          itemId: 'file:aborted',
          providerId: 'file-provider',
          type: 'file',
          name: 'aborted-visible'
        }
      ])
      await service.abortProviderReplacement('file-provider', 'replace-abort')

      await expect(service.countByProvider('file-provider')).resolves.toBe(1)
      await expect(service.search('file-provider', 'new-visible')).resolves.toEqual([
        expect.objectContaining({ itemId: 'file:new' })
      ])
      await expect(service.search('file-provider', 'aborted-visible')).resolves.toEqual([])
    } finally {
      client?.close()
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('keeps same-named replacement staging isolated by provider when one replacement aborts', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tuff-search-index-scoped-replacement-'))
    let client: Client | undefined
    try {
      client = createClient({ url: `file:${join(directory, 'search-index.sqlite')}` })
      await client.execute(`
        CREATE TABLE keyword_mappings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          keyword TEXT NOT NULL,
          item_id TEXT NOT NULL,
          provider_id TEXT NOT NULL DEFAULT '',
          priority REAL NOT NULL DEFAULT 1.0
        )
      `)
      await client.execute(`
        CREATE TABLE search_index_meta (
          provider_id TEXT NOT NULL,
          item_id TEXT NOT NULL,
          keyword_hash TEXT NOT NULL,
          updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
          PRIMARY KEY (provider_id, item_id)
        )
      `)
      const service = new SearchIndexService(drizzle(client) as never, {
        directMode: true,
        initializationMode: 'writer'
      })
      await service.warmup()
      await service.indexItems([
        {
          itemId: 'file:provider-a-live',
          providerId: 'provider-a',
          type: 'file',
          name: 'provider a live'
        },
        {
          itemId: 'file:provider-b-live',
          providerId: 'provider-b',
          type: 'file',
          name: 'provider b live'
        }
      ])

      await service.beginProviderReplacement('provider-a', 'shared-replacement')
      await service.stageProviderReplacementItems('provider-a', 'shared-replacement', [
        {
          itemId: 'file:provider-a-staged',
          providerId: 'provider-a',
          type: 'file',
          name: 'provider a staged'
        }
      ])
      await service.beginProviderReplacement('provider-b', 'shared-replacement')
      await service.stageProviderReplacementItems('provider-b', 'shared-replacement', [
        {
          itemId: 'file:provider-b-replacement',
          providerId: 'provider-b',
          type: 'file',
          name: 'provider b replacement'
        }
      ])

      await service.abortProviderReplacement('provider-a', 'shared-replacement')
      await expect(
        client.execute({
          sql: `
            SELECT provider_id
            FROM search_index_replacement_stage
            WHERE replacement_id = ?
            ORDER BY provider_id
          `,
          args: ['shared-replacement']
        })
      ).resolves.toMatchObject({ rows: [{ provider_id: 'provider-b' }] })

      await expect(
        service.commitProviderReplacement('provider-b', 'shared-replacement')
      ).resolves.toEqual({ removedItems: 1, indexedItems: 1 })
      await expect(service.search('provider-a', 'provider a live')).resolves.toEqual([
        expect.objectContaining({ itemId: 'file:provider-a-live' })
      ])
      await expect(service.search('provider-a', 'provider a staged')).resolves.toEqual([])
      await expect(service.search('provider-b', 'provider b live')).resolves.toEqual([])
      await expect(service.search('provider-b', 'provider b replacement')).resolves.toEqual([
        expect.objectContaining({ itemId: 'file:provider-b-replacement' })
      ])
    } finally {
      client?.close()
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('rolls back every earlier no-legacy document when a later provider apply fails', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tuff-search-index-no-legacy-atomic-'))
    let client: Client | undefined
    try {
      client = createClient({ url: `file:${join(directory, 'search-index.sqlite')}` })
      await client.execute(`
        CREATE TABLE keyword_mappings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          keyword TEXT NOT NULL,
          item_id TEXT NOT NULL,
          provider_id TEXT NOT NULL DEFAULT '',
          priority REAL NOT NULL DEFAULT 1.0
        )
      `)
      await client.execute(`
        CREATE TABLE search_index_meta (
          provider_id TEXT NOT NULL,
          item_id TEXT NOT NULL,
          keyword_hash TEXT NOT NULL,
          updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
          PRIMARY KEY (provider_id, item_id)
        )
      `)
      const service = new SearchIndexService(drizzle(client) as never, {
        directMode: true,
        initializationMode: 'writer'
      })
      await service.warmup()
      await client.execute(`
        CREATE TRIGGER reject_late_no_legacy_document
        BEFORE INSERT ON keyword_mappings
        WHEN NEW.item_id = 'file:no-legacy-four'
        BEGIN
          SELECT RAISE(ABORT, 'late no-legacy document blocked');
        END
      `)

      try {
        await expect(
          service.applyProviderItems(
            'no-legacy-provider',
            [
              {
                itemId: 'file:no-legacy-one',
                providerId: 'no-legacy-provider',
                type: 'file',
                name: 'first committed candidate'
              },
              {
                itemId: 'file:no-legacy-two',
                providerId: 'no-legacy-provider',
                type: 'file',
                name: 'second committed candidate'
              },
              {
                itemId: 'file:no-legacy-three',
                providerId: 'no-legacy-provider',
                type: 'file',
                name: 'third committed candidate'
              },
              {
                itemId: 'file:no-legacy-four',
                providerId: 'no-legacy-provider',
                type: 'file',
                name: 'blocked candidate'
              }
            ],
            []
          )
        ).rejects.toThrow('Failed query: insert into "keyword_mappings"')

        await expect(service.countByProvider('no-legacy-provider')).resolves.toBe(0)
        await expect(service.search('no-legacy-provider', 'committed candidate')).resolves.toEqual(
          []
        )
        await expect(
          client.execute({
            sql: 'SELECT item_id FROM search_index WHERE provider = ?',
            args: ['no-legacy-provider']
          })
        ).resolves.toMatchObject({ rows: [] })
        await expect(
          client.execute({
            sql: 'SELECT item_id FROM keyword_mappings WHERE provider_id = ?',
            args: ['no-legacy-provider']
          })
        ).resolves.toMatchObject({ rows: [] })
      } finally {
        await client.execute('DROP TRIGGER IF EXISTS reject_late_no_legacy_document')
      }
    } finally {
      client?.close()
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('atomically persists replacement outcomes and retains recovery only for the current provider replacement', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tuff-search-index-replacement-outcome-'))
    let client: Client | undefined
    try {
      client = createClient({ url: `file:${join(directory, 'search-index.sqlite')}` })
      await client.execute(`
        CREATE TABLE keyword_mappings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          keyword TEXT NOT NULL,
          item_id TEXT NOT NULL,
          provider_id TEXT NOT NULL DEFAULT '',
          priority REAL NOT NULL DEFAULT 1.0
        )
      `)
      await client.execute(`
        CREATE TABLE search_index_meta (
          provider_id TEXT NOT NULL,
          item_id TEXT NOT NULL,
          keyword_hash TEXT NOT NULL,
          updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
          PRIMARY KEY (provider_id, item_id)
        )
      `)
      const service = new SearchIndexService(drizzle(client) as never, {
        directMode: true,
        initializationMode: 'writer'
      })
      await service.warmup()
      await service.indexItems([
        {
          itemId: 'file:replacement-old',
          providerId: 'replacement-provider',
          type: 'file',
          name: 'replacement old visible'
        }
      ])
      await service.beginProviderReplacement('replacement-provider', 'replacement-a')
      await service.stageProviderReplacementItems('replacement-provider', 'replacement-a', [
        {
          itemId: 'file:replacement-new',
          providerId: 'replacement-provider',
          type: 'file',
          name: 'replacement new visible'
        }
      ])
      await client.execute(`
        CREATE TRIGGER reject_replacement_outcome
        BEFORE INSERT ON search_index_replacement_outcome
        BEGIN
          SELECT RAISE(ABORT, 'replacement outcome blocked');
        END
      `)

      try {
        await expect(
          service.commitProviderReplacement('replacement-provider', 'replacement-a')
        ).rejects.toThrow(/search_index_replacement_outcome/)
        await expect(service.search('replacement-provider', 'old visible')).resolves.toEqual([
          expect.objectContaining({ itemId: 'file:replacement-old' })
        ])
        await expect(service.search('replacement-provider', 'new visible')).resolves.toEqual([])
        await expect(
          service.getProviderReplacementOutcome('replacement-provider', 'replacement-a')
        ).resolves.toBeNull()
        await expect(
          client.execute({
            sql: 'SELECT replacement_id FROM search_index_replacement_stage WHERE provider_id = ?',
            args: ['replacement-provider']
          })
        ).resolves.toMatchObject({ rows: [{ replacement_id: 'replacement-a' }] })
      } finally {
        await client.execute('DROP TRIGGER IF EXISTS reject_replacement_outcome')
      }

      const committed = await service.commitProviderReplacement(
        'replacement-provider',
        'replacement-a'
      )
      expect(committed).toEqual({ removedItems: 1, indexedItems: 1 })
      await expect(
        client.execute({
          sql: `
            SELECT replacement_id, provider_id, removed_items, indexed_items
            FROM search_index_replacement_outcome
            WHERE provider_id = ?
          `,
          args: ['replacement-provider']
        })
      ).resolves.toMatchObject({
        rows: [
          {
            replacement_id: 'replacement-a',
            provider_id: 'replacement-provider',
            removed_items: 1,
            indexed_items: 1
          }
        ]
      })
      await expect(
        client.execute({
          sql: 'SELECT replacement_id FROM search_index_replacement_stage WHERE provider_id = ?',
          args: ['replacement-provider']
        })
      ).resolves.toMatchObject({ rows: [] })

      await client.execute(`
        CREATE TRIGGER reject_duplicate_replacement_clear
        BEFORE DELETE ON search_index_meta
        WHEN OLD.provider_id = 'replacement-provider'
        BEGIN
          SELECT RAISE(ABORT, 'duplicate replacement re-cleared metadata');
        END
      `)
      try {
        await expect(
          service.commitProviderReplacement('replacement-provider', 'replacement-a')
        ).resolves.toEqual(committed)
      } finally {
        await client.execute('DROP TRIGGER IF EXISTS reject_duplicate_replacement_clear')
      }
      await service.abortProviderReplacement('replacement-provider', 'replacement-a')
      await expect(
        service.getProviderReplacementOutcome('replacement-provider', 'replacement-a')
      ).resolves.toEqual(committed)

      await service.beginProviderReplacement('other-provider', 'other-replacement')
      await service.stageProviderReplacementItems('other-provider', 'other-replacement', [
        {
          itemId: 'file:other-current',
          providerId: 'other-provider',
          type: 'file',
          name: 'other provider current'
        }
      ])
      const otherCommitted = await service.commitProviderReplacement(
        'other-provider',
        'other-replacement'
      )

      await service.beginProviderReplacement('replacement-provider', 'replacement-b')
      await expect(
        service.getProviderReplacementOutcome('replacement-provider', 'replacement-a')
      ).resolves.toBeNull()
      await expect(
        service.getProviderReplacementOutcome('other-provider', 'other-replacement')
      ).resolves.toEqual(otherCommitted)

      await service.stageProviderReplacementItems('replacement-provider', 'replacement-b', [
        {
          itemId: 'file:replacement-current',
          providerId: 'replacement-provider',
          type: 'file',
          name: 'replacement current visible'
        }
      ])
      const currentCommitted = await service.commitProviderReplacement(
        'replacement-provider',
        'replacement-b'
      )
      await service.beginProviderReplacement('replacement-provider', 'replacement-b')
      await expect(
        service.getProviderReplacementOutcome('replacement-provider', 'replacement-b')
      ).resolves.toEqual(currentCommitted)
    } finally {
      client?.close()
      await rm(directory, { recursive: true, force: true })
    }
  })
})
