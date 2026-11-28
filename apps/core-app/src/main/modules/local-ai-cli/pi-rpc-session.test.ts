import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const spawnSafeMock = vi.hoisted(() => vi.fn())

vi.mock('@talex-touch/utils/common/utils/safe-shell', () => ({
  spawnSafe: spawnSafeMock
}))

import { PersistentPiRpcSession } from './pi-rpc-session'

class FakeChildProcess extends EventEmitter {
  stdin = new PassThrough()
  stdout = new PassThrough()
  stderr = new PassThrough()
  kill = vi.fn((_signal?: NodeJS.Signals) => {
    this.emit('close', 0)
    return true
  })
}

describe('PersistentPiRpcSession backpressure and line-buffer bounds', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('drains stderr and fails closed when stdout exceeds the 4 MiB line buffer cap', async () => {
    const child = new FakeChildProcess()
    const resumeSpy = vi.spyOn(child.stderr, 'resume')
    spawnSafeMock.mockReturnValue(child)

    child.stdin.on('data', (chunk: Buffer) => {
      if (chunk.toString('utf8').includes('"get_state"')) {
        child.stdout.write(
          `${JSON.stringify({
            type: 'response',
            command: 'get_state',
            success: true,
            data: { sessionId: 'sess-1', sessionFile: '/tmp/sess-1.jsonl' }
          })}\n`
        )
      }
    })

    const session = await PersistentPiRpcSession.create({
      executable: 'pi',
      cwd: '/tmp',
      args: ['--mode', 'rpc'],
      env: {}
    })

    expect(resumeSpy).toHaveBeenCalled()

    const pendingRequest = session.request(
      { id: 'req-1', type: 'get_state' },
      (record) => record.type === 'response' && record.id === 'req-1'
    )

    // Emit an unterminated chunk larger than the 4 MiB line buffer cap.
    child.stdout.write('x'.repeat(4 * 1024 * 1024 + 64))

    await expect(pendingRequest).rejects.toThrow('RPC_LINE_BUFFER_OVERFLOW')
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
  })
})
