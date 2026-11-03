import type { PiRuntimeRunRecord } from './pi-agent-runtime-protocol'
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** The real secure store, rooted in a temp directory; only the app's own root lookup is replaced. */
const root = vi.hoisted(() => ({ path: '' }))

vi.mock('electron', () => ({ app: { isPackaged: false, getPath: () => root.path } }))
vi.mock('../../utils/app-root-path', () => ({ resolveRuntimeRootPath: () => root.path }))

import { SECURE_STORE_FILE } from '../../utils/secure-store'
import { openRunRecords, sealRunRecord } from './ai-run-record-seal'

const SECRET = 'ACME-CANARY-7731'

function record(text: string, modelSteps = 1): PiRuntimeRunRecord {
  return {
    message: { role: 'toolResult', toolCallId: 'c', content: [{ type: 'text', text }] },
    modelSteps,
    toolCalls: 1,
    usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    costKnown: true
  }
}

async function seal(runId: string, seq: number, rec: PiRuntimeRunRecord): Promise<string> {
  const envelope = await sealRunRecord(runId, seq, rec)
  if (!envelope) throw new Error('not sealed')
  return envelope
}

async function everythingOnDisk(): Promise<string> {
  const parts: string[] = []
  for (const entry of await readdir(root.path, { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) {
      parts.push(await readFile(path.join(entry.parentPath, entry.name), 'utf-8').catch(() => ''))
    }
  }
  return parts.join('\n')
}

describe('run record seal', () => {
  beforeEach(async () => {
    root.path = await mkdtemp(path.join(tmpdir(), 'tuff-run-record-'))
  })

  it('opens what it sealed, in order, for the run it was sealed for', async () => {
    const first = record(`first ${SECRET}`)
    const second = record('second', 2)
    const rows = [
      { seq: 1, envelope: await seal('run_a', 1, first) },
      { seq: 2, envelope: await seal('run_a', 2, second) }
    ]

    await expect(openRunRecords('run_a', rows)).resolves.toEqual([first, second])
    await expect(openRunRecords('run_a', [])).resolves.toEqual([])
  })

  it('never lets the clear text reach the envelope or the disk', async () => {
    const envelope = await seal('run_a', 1, record(`the file says ${SECRET}`))

    expect(envelope).not.toContain(SECRET)
    expect(await everythingOnDisk()).not.toContain(SECRET)
  })

  it('does not open an envelope at a position it was not sealed for', async () => {
    const one = await seal('run_a', 1, record('one'))
    const two = await seal('run_a', 2, record('two'))

    // Swapped: both are genuine, neither is where it was written.
    await expect(
      openRunRecords('run_a', [
        { seq: 1, envelope: two },
        { seq: 2, envelope: one }
      ])
    ).resolves.toBeNull()
  })

  it('does not open an envelope under another run', async () => {
    const envelope = await seal('run_a', 1, record('one'))

    await expect(openRunRecords('run_b', [{ seq: 1, envelope }])).resolves.toBeNull()
  })

  it('does not open a log with a gap, or one that does not start at 1', async () => {
    const one = await seal('run_a', 1, record('one'))
    const three = await seal('run_a', 3, record('three'))
    const two = await seal('run_a', 2, record('two'))

    await expect(
      openRunRecords('run_a', [
        { seq: 1, envelope: one },
        { seq: 3, envelope: three }
      ])
    ).resolves.toBeNull()
    await expect(openRunRecords('run_a', [{ seq: 2, envelope: two }])).resolves.toBeNull()
  })

  it('does not open a tampered envelope, or something that is not an envelope', async () => {
    const envelope = await seal('run_a', 1, record('one'))
    const parsed = JSON.parse(envelope) as { c: string }
    const flipped = JSON.stringify({
      ...parsed,
      c: `${parsed.c[0] === 'A' ? 'B' : 'A'}${parsed.c.slice(1)}`
    })

    await expect(openRunRecords('run_a', [{ seq: 1, envelope: flipped }])).resolves.toBeNull()
    await expect(openRunRecords('run_a', [{ seq: 1, envelope: 'plain text' }])).resolves.toBeNull()
  })

  it('reads an unreadable secret as "no log" instead of throwing', async () => {
    const envelope = await seal('run_a', 1, record('one'))
    // The root secret is the file next to the store; losing it must read as an untrustable log.
    for (const entry of await readdir(path.join(root.path, 'config'))) {
      if (entry !== SECURE_STORE_FILE) await writeFile(path.join(root.path, 'config', entry), 'x')
    }

    await expect(openRunRecords('run_a', [{ seq: 1, envelope }])).resolves.toBeNull()
  })
})
