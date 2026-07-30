import type { Client } from '@libsql/client'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@libsql/client'
import { afterEach } from 'vitest'

const resourcesRoot = new URL('../../../../resources/db/migrations/', import.meta.url)
const openClients: Client[] = []
const tempDirectories: string[] = []

export async function createPrivacyTestClient(name: string): Promise<{
  client: Client
  directory: string
}> {
  const directory = await mkdtemp(join(tmpdir(), `tuff-privacy-${name}-`))
  const client = createClient({ url: `file:${join(directory, `${name}.sqlite`)}` })
  await client.execute('PRAGMA foreign_keys = ON')
  openClients.push(client)
  tempDirectories.push(directory)
  return { client, directory }
}

export async function getPrivacyMigrationNames(): Promise<string[]> {
  const { readFile } = await import('node:fs/promises')
  const journal = JSON.parse(
    await readFile(new URL('meta/_journal.json', resourcesRoot), 'utf8')
  ) as { entries?: Array<{ tag?: unknown }> }
  return (journal.entries ?? [])
    .map((entry) => (typeof entry.tag === 'string' ? `${entry.tag}.sql` : null))
    .filter((name): name is string => name !== null)
}

export async function applyPrivacyMigrations(
  client: Client,
  names: readonly string[]
): Promise<void> {
  const { readFile } = await import('node:fs/promises')
  for (const name of names) {
    const migration = await readFile(new URL(name, resourcesRoot), 'utf8')
    for (const statement of migration.split('--> statement-breakpoint')) {
      if (statement.trim()) await client.execute(statement)
    }
  }
}

export function rowsAffected(result: Awaited<ReturnType<Client['execute']>>): number {
  return Number(result.rowsAffected ?? 0)
}

afterEach(async () => {
  while (openClients.length > 0) {
    openClients.pop()?.close()
  }
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  )
})
