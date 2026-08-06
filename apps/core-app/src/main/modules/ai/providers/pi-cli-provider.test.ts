import type {
  IntelligenceProviderConfig,
  IntelligenceStreamChunk
} from '@talex-touch/tuff-intelligence'
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PiCliProvider } from './pi-cli-provider'
import { PI_CLI_ORIGIN, PI_CLI_PROVIDER_ID, resetPiExecutableCache } from './pi-cli-runtime'

/**
 * These run against a stub executable rather than a mocked `spawn`, because the behaviours under
 * test — line framing across chunk boundaries, exit codes, and whether cancellation actually reaps
 * the child — only exist at the process boundary a mock would replace.
 */
let workDir: string
let stubPath: string

const CONFIG: IntelligenceProviderConfig = {
  id: PI_CLI_PROVIDER_ID,
  type: IntelligenceProviderType.LOCAL,
  name: 'Pi (local CLI)',
  enabled: true,
  priority: 0,
  models: [],
  timeout: 120000,
  capabilities: ['text.chat'],
  metadata: { origin: PI_CLI_ORIGIN }
}

async function writeStub(body: string): Promise<void> {
  await writeFile(stubPath, `#!/usr/bin/env node\n${body}\n`, 'utf8')
  await chmod(stubPath, 0o755)
  resetPiExecutableCache()
  process.env.TUFF_PI_CLI_PATH = stubPath
}

function provider(): PiCliProvider {
  return new PiCliProvider({ ...CONFIG })
}

function userTurn(content = 'hi') {
  return { messages: [{ role: 'user' as const, content }] }
}

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'pi-cli-provider-'))
  stubPath = join(workDir, 'pi-stub.js')
})

afterEach(async () => {
  delete process.env.TUFF_PI_CLI_PATH
  resetPiExecutableCache()
  await rm(workDir, { recursive: true, force: true })
})

describe('PiCliProvider.chatStream', () => {
  it('yields one chunk per text delta and carries provider/model through', async () => {
    await writeStub(`
      const emit = (o) => process.stdout.write(JSON.stringify(o) + '\\n')
      emit({ type: 'message_start', message: { role: 'assistant', provider: 'codex', model: 'gpt-5.6-terra' } })
      emit({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'he' } })
      emit({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'llo' } })
      emit({ type: 'agent_settled' })
    `)

    const chunks: Array<{ delta: string; model?: string }> = []
    for await (const chunk of provider().chatStream(userTurn(), {})) {
      chunks.push({ delta: chunk.delta, model: chunk.model })
    }

    expect(chunks.filter((chunk) => chunk.delta).map((chunk) => chunk.delta)).toEqual(['he', 'llo'])
    expect(chunks[0]?.model).toBe('gpt-5.6-terra')
    expect(chunks.at(-1)).toEqual({ delta: '', model: 'gpt-5.6-terra' })
  })

  it('reassembles a delta split across two stdout writes', async () => {
    // A JSON object arriving in two pieces must not be parsed as two lines; without line framing
    // this drops the delta entirely.
    await writeStub(`
      const line = JSON.stringify({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'split' } })
      process.stdout.write(line.slice(0, 20))
      setTimeout(() => process.stdout.write(line.slice(20) + '\\n'), 10)
    `)

    const deltas: string[] = []
    for await (const chunk of provider().chatStream(userTurn(), {})) {
      if (chunk.delta) deltas.push(chunk.delta)
    }

    expect(deltas).toEqual(['split'])
  })

  it('reports usage on the final chunk', async () => {
    await writeStub(`
      const emit = (o) => process.stdout.write(JSON.stringify(o) + '\\n')
      emit({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'x' } })
      emit({ type: 'message_end', message: { role: 'assistant', usage: { input: 7, output: 3, totalTokens: 10 } } })
    `)

    const chunks: IntelligenceStreamChunk[] = []
    for await (const chunk of provider().chatStream(userTurn(), {})) chunks.push(chunk)

    expect(chunks.at(-1)?.usage).toEqual({
      promptTokens: 7,
      completionTokens: 3,
      totalTokens: 10
    })
  })

  it('surfaces stderr when pi exits non-zero before producing anything', async () => {
    await writeStub(`
      process.stderr.write('no credentials configured')
      process.exit(2)
    `)

    await expect(async () => {
      for await (const _chunk of provider().chatStream(userTurn(), {})) void _chunk
    }).rejects.toThrow(/no credentials configured/)
  })

  it('keeps deltas that already arrived when pi exits non-zero afterwards', async () => {
    // Discarding a partial answer because of a late failure would be worse than showing it: the
    // user already read those tokens on screen.
    await writeStub(`
      process.stdout.write(JSON.stringify({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'partial' } }) + '\\n')
      setTimeout(() => process.exit(3), 10)
    `)

    const deltas: string[] = []
    for await (const chunk of provider().chatStream(userTurn(), {})) {
      if (chunk.delta) deltas.push(chunk.delta)
    }

    expect(deltas).toEqual(['partial'])
  })

  it('reports a clear failure when the CLI is absent instead of a raw spawn error', async () => {
    resetPiExecutableCache()
    process.env.TUFF_PI_CLI_PATH = join(workDir, 'definitely-missing')

    await expect(async () => {
      for await (const _chunk of provider().chatStream(userTurn(), {})) void _chunk
    }).rejects.toThrow(/PI_CLI_NOT_FOUND/)
  })

  it('kills the child when the consumer stops reading mid-stream', async () => {
    // The stub reports its own pid and then idles; if cancellation failed to reap it, the process
    // would still be alive after the loop breaks.
    await writeStub(`
      const emit = (o) => process.stdout.write(JSON.stringify(o) + '\\n')
      emit({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: String(process.pid) } })
      setInterval(() => {}, 1000)
    `)

    let childPid = 0
    for await (const chunk of provider().chatStream(userTurn(), {})) {
      if (chunk.delta) {
        childPid = Number(chunk.delta)
        break
      }
    }

    expect(childPid).toBeGreaterThan(0)
    await new Promise((resolve) => setTimeout(resolve, 150))
    // `kill(pid, 0)` throws ESRCH once the process is gone; a live process returns cleanly.
    expect(() => process.kill(childPid, 0)).toThrow()
  })
})

describe('PiCliProvider.chat', () => {
  it('accumulates the stream into a single result', async () => {
    await writeStub(`
      const emit = (o) => process.stdout.write(JSON.stringify(o) + '\\n')
      emit({ type: 'message_start', message: { role: 'assistant', provider: 'codex', model: 'gpt-5.6-terra' } })
      emit({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'one ' } })
      emit({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'two' } })
      emit({ type: 'message_end', message: { role: 'assistant', usage: { input: 1, output: 2, totalTokens: 3 } } })
    `)

    const result = await provider().chat(userTurn(), {})

    expect(result.result).toBe('one two')
    expect(result.model).toBe('gpt-5.6-terra')
    expect(result.usage.totalTokens).toBe(3)
  })
})

describe('PiCliProvider.embedding', () => {
  it('refuses rather than silently returning an empty vector', async () => {
    await expect(provider().embedding({ text: 'x' }, {})).rejects.toThrow(/not supported/)
  })
})
