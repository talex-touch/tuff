import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** The real secure store, rooted in a temp directory; only the app's own root lookup is replaced. */
const root = vi.hoisted(() => ({ path: '' }))

vi.mock('electron', () => ({ app: { isPackaged: false, getPath: () => root.path } }))
vi.mock('../../utils/app-root-path', () => ({ resolveRuntimeRootPath: () => root.path }))

import { SECURE_STORE_FILE } from '../../utils/secure-store'
import { discardRunInput, loadRunInput, saveRunInput } from './ai-run-input-vault'

const SECRET_PROMPT = 'summarise the quarterly numbers for ACME-CANARY-7731'

async function everythingOnDisk(): Promise<string> {
  const parts: string[] = []
  for (const entry of await readdir(root.path, { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) {
      parts.push(await readFile(path.join(entry.parentPath, entry.name), 'utf-8').catch(() => ''))
    }
  }
  return parts.join('\n')
}

describe('run input vault', () => {
  beforeEach(async () => {
    root.path = await mkdtemp(path.join(tmpdir(), 'tuff-run-input-'))
  })

  it('returns exactly what was stored, for the run it was stored under', async () => {
    const input = { task: SECRET_PROMPT, nested: { n: [1, 2, 3], flag: true } }
    await expect(saveRunInput('run_a', input)).resolves.toBe(true)
    await expect(loadRunInput('run_a')).resolves.toEqual({ input })
    await expect(loadRunInput('run_b')).resolves.toBeNull()
  })

  it('never writes the input to disk in the clear', async () => {
    await saveRunInput('run_a', { task: SECRET_PROMPT })
    const onDisk = await everythingOnDisk()
    expect(onDisk.length).toBeGreaterThan(0)
    expect(onDisk).not.toContain('ACME-CANARY-7731')
  })

  it('forgets an input once discarded without touching a run whose id starts the same', async () => {
    await saveRunInput('run_a', { task: SECRET_PROMPT })
    await saveRunInput('run_ab', { task: 'another run' })
    await discardRunInput('run_a')
    await expect(loadRunInput('run_a')).resolves.toBeNull()
    await expect(loadRunInput('run_ab')).resolves.toEqual({ input: { task: 'another run' } })
    await expect(discardRunInput('never-stored')).resolves.toBeUndefined()
  })

  it('refuses an input too large for the store and stores nothing', async () => {
    const tooLarge = { task: 'x'.repeat(1024 * 1024 + 1) }
    await expect(saveRunInput('run_big', tooLarge)).resolves.toBe(false)
    await expect(loadRunInput('run_big')).resolves.toBeNull()
  })

  it('reads an unreadable store as "no input" instead of throwing', async () => {
    await saveRunInput('run_a', { task: SECRET_PROMPT })
    await writeFile(path.join(root.path, 'config', SECURE_STORE_FILE), '{corrupt', 'utf-8')
    await expect(loadRunInput('run_a')).resolves.toBeNull()
  })
})
