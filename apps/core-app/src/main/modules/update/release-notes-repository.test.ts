import type { Client } from '@libsql/client'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '../../db/schema'
import { ReleaseNotesRepository } from './release-notes-repository'

const migration = new URL(
  '../../../../resources/db/migrations/0033_app_release_notes_state.sql',
  import.meta.url
)

describe('ReleaseNotesRepository', () => {
  let directory: string
  let client: Client
  let db: LibSQLDatabase<typeof schema>
  let repository: ReleaseNotesRepository

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'tuff-release-notes-state-'))
    client = createClient({ url: `file:${join(directory, 'release-notes.sqlite')}` })
    const sql = await readFile(migration, 'utf8')
    await client.execute(sql)
    db = drizzle(client, { schema })
    repository = new ReleaseNotesRepository(db)
  })

  afterEach(async () => {
    client.close()
    await rm(directory, { recursive: true, force: true })
  })

  it('persists one last acknowledged version across restarts', async () => {
    await expect(repository.getLastAcknowledgedVersion()).resolves.toBeNull()

    await repository.acknowledge('2.4.14-beta.1', 100)
    await expect(repository.getLastAcknowledgedVersion()).resolves.toBe('2.4.14-beta.1')

    await repository.acknowledge('2.4.14', 200)
    client.close()
    client = createClient({ url: `file:${join(directory, 'release-notes.sqlite')}` })
    db = drizzle(client, { schema })
    repository = new ReleaseNotesRepository(db)

    await expect(repository.getLastAcknowledgedVersion()).resolves.toBe('2.4.14')
  })

  it('rejects an empty acknowledgement', async () => {
    await expect(repository.acknowledge('   ', 100)).rejects.toThrow('version is required')
    await expect(repository.getLastAcknowledgedVersion()).resolves.toBeNull()
  })
})
