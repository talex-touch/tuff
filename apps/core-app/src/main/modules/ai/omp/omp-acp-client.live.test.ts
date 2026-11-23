import { describe, expect, it } from 'vitest'
import { OmpAcpClient } from '@talex-touch/tuff-intelligence'
import { resolveOmpExecutable } from '../providers/pi-cli-runtime'

describe('ompAcpClient live integration smoke', () => {
  it('connects to real omp CLI via ACP when installed', async () => {
    const ompPath = await resolveOmpExecutable()
    if (!ompPath) {
      return
    }

    const client = await OmpAcpClient.spawn({
      executablePath: ompPath,
      cwd: '/tmp'
    })

    let session: Awaited<ReturnType<typeof client.createSession>> | undefined
    try {
      expect(client.agentInfo).toBeDefined()
      expect(client.agentInfo?.name).toBe('omp')

      const liveModel = process.env.TUFF_OMP_LIVE_MODEL?.trim()
      session = await client.createSession({
        cwd: '/tmp',
        ...(liveModel ? { model: liveModel } : {})
      })

      expect(session.sessionId).toBeDefined()

      const receivedChunks: string[] = []
      const res = await session.prompt('Say "Live ACP Smoke Pass" in exactly 4 words.', (ev) => {
        if (ev.type === 'delta' && ev.text) {
          receivedChunks.push(ev.text)
        }
      })

      expect(res.output).toBeDefined()
      expect(res.output.toLowerCase()).toContain('live acp smoke pass')
      expect(receivedChunks.length).toBeGreaterThan(0)
    } finally {
      await session?.close()
      await client.close()
    }
  }, 60000)
})
