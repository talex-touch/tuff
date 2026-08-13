import type {
  IntelligenceProviderConfig,
  IntelligenceStreamChunk
} from '@talex-touch/tuff-intelligence'
import { existsSync, readdirSync } from 'node:fs'
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

describe('PiCliProvider attachments', () => {
  const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const TEMP_ENV_KEYS = ['TMPDIR', 'TMP', 'TEMP'] as const
  let savedTempEnv: Array<string | undefined> = []

  beforeEach(() => {
    // Points `os.tmpdir()` at the per-test workspace, so "did the spill clean up after itself?" is
    // answered by listing a directory this test owns rather than the shared system one.
    savedTempEnv = TEMP_ENV_KEYS.map((key) => process.env[key])
    for (const key of TEMP_ENV_KEYS) process.env[key] = workDir
  })

  afterEach(() => {
    TEMP_ENV_KEYS.forEach((key, index) => {
      const previous = savedTempEnv[index]
      if (previous === undefined) delete process.env[key]
      else process.env[key] = previous
    })
  })

  function imageTurn(content = 'what is this') {
    return {
      messages: [
        {
          role: 'user' as const,
          content,
          attachments: [
            {
              type: 'image' as const,
              dataUrl: `data:image/png;base64,${PNG_BYTES.toString('base64')}`,
              name: 'shot.png'
            }
          ]
        }
      ]
    }
  }

  /** Echoes back every `@file` argument together with the bytes found at that path. */
  const ECHO_ATTACHMENTS = `
    const fs = require('node:fs')
    const emit = (o) => process.stdout.write(JSON.stringify(o) + '\\n')
    const files = process.argv.slice(2).filter((arg) => arg.startsWith('@')).map((arg) => arg.slice(1))
    const seen = files.map((path) => path + '|' + fs.readFileSync(path).toString('hex'))
    emit({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: seen.join(';') } })
    emit({ type: 'agent_settled' })
  `

  it('hands pi a readable file and takes it away once the turn ends', async () => {
    await writeStub(ECHO_ATTACHMENTS)

    let text = ''
    for await (const chunk of provider().chatStream(imageTurn(), {})) text += chunk.delta

    const [path = '', hex = ''] = text.split('|')
    expect(path).toMatch(/tuff-attach-[\w-]+\.png$/)
    expect(hex).toBe(PNG_BYTES.toString('hex'))
    // The bytes only exist for the length of the run; a settled turn must not leave them behind.
    expect(existsSync(path)).toBe(false)
  })

  it('passes no @file argument for a text-only turn', async () => {
    await writeStub(ECHO_ATTACHMENTS)

    let text = ''
    for await (const chunk of provider().chatStream(userTurn(), {})) text += chunk.delta

    expect(text).toBe('')
  })

  it('removes the file even when the consumer abandons the turn', async () => {
    await writeStub(`
      const emit = (o) => process.stdout.write(JSON.stringify(o) + '\\n')
      const file = process.argv.slice(2).find((arg) => arg.startsWith('@')).slice(1)
      emit({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: file } })
      setInterval(() => {}, 1000)
    `)

    let path = ''
    for await (const chunk of provider().chatStream(imageTurn(), {})) {
      if (chunk.delta) {
        path = chunk.delta
        break
      }
    }

    expect(path).toMatch(/tuff-attach-/)
    expect(existsSync(path)).toBe(false)
  })

  it('does not strand the file when the CLI is missing', async () => {
    resetPiExecutableCache()
    process.env.TUFF_PI_CLI_PATH = join(workDir, 'definitely-missing')

    await expect(async () => {
      for await (const _chunk of provider().chatStream(imageTurn(), {})) void _chunk
    }).rejects.toThrow(/PI_CLI_NOT_FOUND/)

    expect(readdirSync(workDir).filter((name) => name.startsWith('tuff-attach-'))).toEqual([])
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

/**
 * `pi`'s agent retries a failed turn inside the same process, and the text it already wrote to
 * stdout cannot be recalled — the whole reason the home surface used to show the same answer four
 * times over. The stubs below replay that event order from
 * `research/evidence-pi-retry-stall.ndjson`.
 */
describe('PiCliProvider retries inside one run', () => {
  const ANSWER = '我通过大量文本、代码和对话示例训练。'

  /** Three attempts pi threw away, then one it kept. */
  const RETRYING_RUN = `
    const emit = (o) => process.stdout.write(JSON.stringify(o) + '\\n')
    const answer = ${JSON.stringify(ANSWER)}
    for (const attempt of [1, 2, 3]) {
      emit({ type: 'message_start', message: { role: 'assistant', provider: 'codex', model: 'gpt-5.6-terra', stopReason: 'pending' } })
      emit({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: answer } })
      emit({ type: 'message_end', message: { role: 'assistant', stopReason: 'error', errorMessage: 'Request aborted' } })
      emit({ type: 'turn_end', message: { role: 'assistant', stopReason: 'error' } })
      emit({ type: 'agent_end', willRetry: true })
      emit({ type: 'auto_retry_start', attempt, maxAttempts: 3, delayMs: 2000 })
    }
    emit({ type: 'message_start', message: { role: 'assistant', stopReason: 'pending' } })
    emit({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: answer } })
    emit({ type: 'message_end', message: { role: 'assistant', stopReason: 'stop', usage: { input: 1, output: 2, totalTokens: 3 } } })
    emit({ type: 'auto_retry_end', success: true, attempt: 3 })
    emit({ type: 'agent_settled' })
  `

  it('keeps one copy of an answer pi wrote four times', async () => {
    await writeStub(RETRYING_RUN)

    const result = await provider().chat(userTurn(), {})

    expect(result.result).toBe(ANSWER)
  })

  it('still streams every attempt, and marks the three that were withdrawn', async () => {
    // The deltas are a live preview and stay on the wire; what the fix changes is that each
    // discarded attempt is followed by the rollback that takes it back off screen.
    await writeStub(RETRYING_RUN)

    const kinds: string[] = []
    let deltas = 0
    for await (const chunk of provider().chatStream(userTurn(), {})) {
      if (chunk.delta) deltas += 1
      if (chunk.partEvent) kinds.push(chunk.partEvent.kind)
    }

    expect(deltas).toBe(4)
    expect(kinds.filter((kind) => kind === 'text-reset')).toHaveLength(3)
    expect(kinds.filter((kind) => kind === 'message-commit')).toHaveLength(1)
  })

  it('rolls back only the rewritten message, not the tool call before it', async () => {
    // A turn holds several assistant messages; pi deletes just the last one. Rolling the whole
    // turn back would erase the text and tool card the user already watched settle.
    await writeStub(`
      const emit = (o) => process.stdout.write(JSON.stringify(o) + '\\n')
      const partial = { content: [{ type: 'toolCall', id: 'call_1', name: 'read', arguments: {} }] }
      emit({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Checking. ' } })
      emit({ type: 'message_update', assistantMessageEvent: { type: 'toolcall_start', contentIndex: 0, partial } })
      emit({ type: 'message_end', message: { role: 'assistant', stopReason: 'toolUse' } })
      emit({ type: 'message_end', message: { role: 'toolResult', toolCallId: 'call_1', toolName: 'read', content: [{ type: 'text', text: 'ok' }], isError: false } })
      emit({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'half an ans' } })
      emit({ type: 'message_end', message: { role: 'assistant', stopReason: 'error', errorMessage: 'Request aborted' } })
      emit({ type: 'auto_retry_start', attempt: 1, maxAttempts: 3, delayMs: 2000 })
      emit({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Done.' } })
      emit({ type: 'message_end', message: { role: 'assistant', stopReason: 'stop' } })
      emit({ type: 'agent_settled' })
    `)

    const result = await provider().chat(userTurn(), {})

    expect(result.result).toBe('Checking. Done.')
  })

  it('reports why a run that failed every attempt produced nothing', async () => {
    // `pi --mode json` exits 0 whatever happened, so before this the app showed an empty bubble
    // with no explanation while the reason sat in a line it had thrown away.
    await writeStub(`
      const emit = (o) => process.stdout.write(JSON.stringify(o) + '\\n')
      for (const attempt of [1, 2, 3]) {
        emit({ type: 'message_end', message: { role: 'assistant', stopReason: 'error', errorMessage: 'Request aborted' } })
        emit({ type: 'auto_retry_start', attempt, maxAttempts: 3, delayMs: 2000 })
      }
      emit({ type: 'message_end', message: { role: 'assistant', stopReason: 'error', errorMessage: 'Request aborted' } })
      emit({ type: 'auto_retry_end', success: false, attempt: 3, finalError: 'Request aborted\\n\\n[stall-watchdog-retry] provider returned error' })
      emit({ type: 'agent_settled' })
      process.exit(0)
    `)

    await expect(async () => {
      for await (const _chunk of provider().chatStream(userTurn(), {})) void _chunk
    }).rejects.toThrow(/stall-watchdog-retry/)
  })

  it('keeps a partial answer when only the closing message failed', async () => {
    // Something did settle, so the turn has an answer to show; failing it outright would throw
    // away text the user has already read.
    await writeStub(`
      const emit = (o) => process.stdout.write(JSON.stringify(o) + '\\n')
      emit({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Checking. ' } })
      emit({ type: 'message_end', message: { role: 'assistant', stopReason: 'toolUse' } })
      emit({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'and then' } })
      emit({ type: 'message_end', message: { role: 'assistant', stopReason: 'error', errorMessage: 'Request aborted' } })
      emit({ type: 'agent_settled' })
    `)

    await expect(provider().chat(userTurn(), {})).resolves.toMatchObject({
      result: 'Checking. and then'
    })
  })
})

describe('PiCliProvider.embedding', () => {
  it('refuses rather than silently returning an empty vector', async () => {
    await expect(provider().embedding({ text: 'x' }, {})).rejects.toThrow(/not supported/)
  })
})
