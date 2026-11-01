import { mkdir, mkdtemp, open, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { checkDatabases, findDatabases } from './db-integrity'

let dir = ''
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'stress-db-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

function makeDatabase(file: string, rows = 400): void {
  const db = new DatabaseSync(file)
  db.exec(
    'CREATE TABLE files (id INTEGER PRIMARY KEY, name TEXT); CREATE INDEX files_name ON files (name)'
  )
  const insert = db.prepare('INSERT INTO files (name) VALUES (?)')
  for (let index = 0; index < rows; index += 1) insert.run(`file-${index}-${'x'.repeat(40)}.png`)
  db.close()
}

describe('findDatabases', () => {
  it('lists database files at any depth and nothing else', async () => {
    await mkdir(path.join(dir, 'tuff-dev', 'database'), { recursive: true })
    for (const name of [
      'database.db',
      'database.db-wal',
      'database.db-shm',
      'database.db.running',
      'old.db.corrupt',
      'notes.txt'
    ]) {
      await writeFile(path.join(dir, 'tuff-dev', 'database', name), '')
    }
    await writeFile(path.join(dir, 'tuff-dev', 'extra.sqlite'), '')
    await writeFile(path.join(dir, 'a.sqlite3'), '')

    expect(await findDatabases(dir)).toEqual([
      'a.sqlite3',
      'tuff-dev/database/database.db',
      'tuff-dev/extra.sqlite'
    ])
  })

  it('answers an empty list for a profile that does not exist', async () => {
    expect(await findDatabases(path.join(dir, 'missing'))).toEqual([])
  })
})

describe('checkDatabases', () => {
  it('passes a sound database and does not change it', async () => {
    const file = path.join(dir, 'tuff-dev', 'index.db')
    await mkdir(path.dirname(file))
    makeDatabase(file)
    const before = await stat(file)
    const result = await checkDatabases(dir)

    expect(result).toEqual({ checked: true, results: [{ file: 'tuff-dev/index.db', ok: true }] })
    const after = await stat(file)
    expect(after.size).toBe(before.size)
    expect(after.mtimeMs).toBe(before.mtimeMs)
  })

  it('fails a database whose pages are damaged and says what quick_check found', async () => {
    const file = path.join(dir, 'broken.db')
    makeDatabase(file, 2_000)
    const handle = await open(file, 'r+')
    const size = (await handle.stat()).size
    await handle.write(Buffer.alloc(4096, 0xab), 0, 4096, Math.floor(size / 2 / 4096) * 4096)
    await handle.close()
    const result = await checkDatabases(dir)

    expect(result.checked).toBe(true)
    expect(result.results[0]).toMatchObject({ file: 'broken.db', ok: false })
    expect(result.results[0].detail).toBeTruthy()
  })

  it('fails a file that is not a database instead of throwing', async () => {
    await writeFile(path.join(dir, 'garbage.db'), 'this is not sqlite at all, '.repeat(200))
    const result = await checkDatabases(dir)
    expect(result.results[0]).toMatchObject({ file: 'garbage.db', ok: false })
    expect(result.results[0].detail).toContain('quick_check')
  })

  it('is not "checked" when there was nothing to check, so a pass cannot come from an empty profile', async () => {
    expect(await checkDatabases(dir)).toEqual({ checked: false, results: [] })
  })

  it('keeps going after one database fails', async () => {
    await writeFile(path.join(dir, 'a-garbage.db'), 'nope'.repeat(500))
    makeDatabase(path.join(dir, 'b-good.db'))
    const result = await checkDatabases(dir)
    expect(result.results.map((entry) => [entry.file, entry.ok])).toEqual([
      ['a-garbage.db', false],
      ['b-good.db', true]
    ])
  })
})
