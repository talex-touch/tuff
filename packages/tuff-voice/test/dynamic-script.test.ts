import type { DynamicVoiceScriptExports } from '../src/index'
import { Buffer } from 'node:buffer'
import { describe, expect, it, vi } from 'vitest'
import {
  assertSafeRemoteUrlAsync,
  DynamicScriptVoiceProvider,
  isSafeRemoteUrl,
  safeFetchWithRedirects,
  VoiceProviderError,
} from '../src/index'

describe('dynamic-script provider and SSRF protection', () => {
  describe('isSafeRemoteUrl & assertSafeRemoteUrlAsync', () => {
    it('allows valid HTTPS and WSS remote endpoints', () => {
      expect(isSafeRemoteUrl('https://api.example.com/v1/voice')).toBe(true)
      expect(isSafeRemoteUrl('wss://stream.example.com/audio')).toBe(true)
    })

    it('denies insecure HTTP or WS when only HTTPS/WSS allowed', () => {
      expect(isSafeRemoteUrl('http://api.example.com/v1/voice')).toBe(false)
      expect(isSafeRemoteUrl('ws://stream.example.com/audio')).toBe(false)
    })

    it('denies IPv4, IPv6, IPv4-mapped, ULA, CGNAT, link-local, and metadata IPs', () => {
      const blocked = [
        'https://localhost/api',
        'https://127.0.0.1/api',
        'https://0.0.0.0/api',
        'https://10.0.0.1/api',
        'https://100.64.0.1/api',
        'https://172.16.0.1/api',
        'https://192.168.1.1/api',
        'https://169.254.169.254/latest/meta-data',
        'https://[::1]/api',
        'https://[::]/api',
        'https://[::ffff:127.0.0.1]/api',
        'https://[::ffff:169.254.169.254]/api',
        'https://[fe80::1]/api',
        'https://[fc00::1]/api',
        'https://[fd12:3456::1]/api',
        'https://[64:ff9b::127.0.0.1]/api',
      ]
      for (const url of blocked) {
        expect(isSafeRemoteUrl(url), `${url} should be denied`).toBe(false)
      }
    })

    it('denies credentials in URL even when allowLocalhost is enabled', () => {
      expect(isSafeRemoteUrl('https://admin:secret@api.example.com/api')).toBe(false)
      expect(isSafeRemoteUrl('http://admin:secret@localhost:8080/api', ['http:', 'https:'], { allowLocalhost: true })).toBe(false)
    })

    it('keeps scheme and non-loopback private IP checks active when allowLocalhost is true', () => {
      expect(isSafeRemoteUrl('http://127.0.0.1:8080/v1', ['http:', 'https:'], { allowLocalhost: true })).toBe(true)
      expect(isSafeRemoteUrl('http://[::1]:8080/v1', ['http:', 'https:'], { allowLocalhost: true })).toBe(true)
      expect(isSafeRemoteUrl('http://localhost:8080/v1', ['http:', 'https:'], { allowLocalhost: true })).toBe(true)
      expect(isSafeRemoteUrl('file:///etc/passwd', ['http:', 'https:'], { allowLocalhost: true })).toBe(false)
      expect(isSafeRemoteUrl('http://169.254.169.254/latest/meta-data', ['http:', 'https:'], { allowLocalhost: true })).toBe(false)
      expect(isSafeRemoteUrl('http://10.0.0.1/internal', ['http:', 'https:'], { allowLocalhost: true })).toBe(false)
    })

    it('blocks hostnames whose DNS resolves to private or loopback IPs', async () => {
      await expect(
        assertSafeRemoteUrlAsync('https://rebind.example.test/api', {
          lookup: async () => [{ address: '127.0.0.1', family: 4 }],
        }),
      ).rejects.toMatchObject({ code: 'VOICE_SCRIPT_URL_DENIED' })

      await expect(
        assertSafeRemoteUrlAsync('https://rebind6.example.test/api', {
          lookup: async () => [{ address: 'fe80::1', family: 6 }],
        }),
      ).rejects.toMatchObject({ code: 'VOICE_SCRIPT_URL_DENIED' })

      await expect(
        assertSafeRemoteUrlAsync('https://public.example.test/api', {
          lookup: async () => [{ address: '93.184.216.34', family: 4 }],
        }),
      ).resolves.toBeInstanceOf(URL)
    })

    it('blocks 30x redirects to loopback/metadata and strips auth headers cross-origin', async () => {
      const seenHeaders: Array<Record<string, string>> = []
      const redirectToLoopback = vi.fn(async () =>
        new Response(null, {
          status: 302,
          headers: { location: 'http://127.0.0.1/secret' },
        }),
      )

      await expect(
        safeFetchWithRedirects(
          {
            url: 'https://public.example.test/start',
            headers: { Authorization: 'Bearer top-secret' },
          },
          {
            fetchImpl: redirectToLoopback as unknown as typeof fetch,
            lookup: async () => [{ address: '93.184.216.34', family: 4 }],
          },
        ),
      ).rejects.toMatchObject({ code: 'VOICE_SCRIPT_URL_DENIED' })

      const crossOriginFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const hdrs = new Headers(init?.headers)
        const snapshot: Record<string, string> = {}
        hdrs.forEach((v, k) => {
          snapshot[k] = v
        })
        seenHeaders.push(snapshot)
        if (String(input).startsWith('https://origin-a.example.test/')) {
          return new Response(null, {
            status: 302,
            headers: { location: 'https://origin-b.example.test/final' },
          })
        }
        return new Response('ok', { status: 200 })
      })

      const res = await safeFetchWithRedirects(
        {
          url: 'https://origin-a.example.test/start',
          headers: { 'Authorization': 'Bearer top-secret', 'X-Api-Key': 'k1', 'Accept': 'application/json' },
        },
        {
          fetchImpl: crossOriginFetch as unknown as typeof fetch,
          lookup: async () => [{ address: '93.184.216.34', family: 4 }],
        },
      )
      expect(res.status).toBe(200)
      expect(seenHeaders[0].authorization).toBe('Bearer top-secret')
      expect(seenHeaders[1].authorization).toBeUndefined()
      expect(seenHeaders[1]['x-api-key']).toBeUndefined()
      expect(seenHeaders[1].accept).toBe('application/json')
    })

    it('runs DNS SSRF validation by default for wrapped fetchImpl and cancels 30x response bodies', async () => {
      const wrappedFetch = vi.fn(async () => new Response('should not execute', { status: 200 }))
      // Without lookup or skipDnsLookup, a wrapped fetchImpl must still run DNS validation
      // (failing closed on an unresolvable/invalid host instead of silently opting out).
      await expect(
        safeFetchWithRedirects(
          { url: 'https://nonexistent.invalid/secret' },
          { fetchImpl: wrappedFetch as unknown as typeof fetch },
        ),
      ).rejects.toMatchObject({ code: 'VOICE_SCRIPT_URL_DENIED' })
      expect(wrappedFetch).not.toHaveBeenCalled()

      // Intermediate 30x response bodies must be canceled before following the redirect.
      let cancelCalled = false
      const redirectFetch = vi.fn(async (input: string | URL | Request) => {
        if (String(input).endsWith('/hop1')) {
          const stream = new ReadableStream({
            cancel() {
              cancelCalled = true
            },
          })
          return new Response(stream, {
            status: 302,
            headers: { location: 'https://public.example.test/final' },
          })
        }
        return new Response('done', { status: 200 })
      })

      const finalRes = await safeFetchWithRedirects(
        { url: 'https://public.example.test/hop1' },
        {
          fetchImpl: redirectFetch as unknown as typeof fetch,
          lookup: async () => [{ address: '93.184.216.34', family: 4 }],
        },
      )
      expect(finalRes.status).toBe(200)
      expect(cancelCalled).toBe(true)
    })
  })

  describe('main-process RCE prevention (fail-closed scriptContent)', () => {
    it('refuses to evaluate arbitrary scriptContent via node:vm', () => {
      const dangerousScript = `
        module.exports = {
          createSession: () => {
            const p = this.constructor.constructor('return process')();
            return { writePcm: () => {}, end: () => {} };
          }
        };
      `
      expect(
        () => new DynamicScriptVoiceProvider({ scriptContent: dangerousScript }),
      ).toThrowError(expect.objectContaining({ code: 'VOICE_SCRIPT_EXECUTION_DISABLED' }))

      expect(
        () => new DynamicScriptVoiceProvider({ scriptContent: 'this is not valid js {' }),
      ).toThrowError(expect.objectContaining({ code: 'VOICE_SCRIPT_EXECUTION_DISABLED' }))
    })

    it('rejects missing or invalid programmatic adapter', () => {
      expect(
        () => new DynamicScriptVoiceProvider({}),
      ).toThrowError(VoiceProviderError)

      expect(
        () => new DynamicScriptVoiceProvider({ adapter: {} as DynamicVoiceScriptExports }),
      ).toThrowError(expect.objectContaining({ code: 'VOICE_SCRIPT_EXPORTS_INVALID' }))
    })
  })

  describe('programmatic adapter execution', () => {
    it('streams chunks and emits text via a trusted programmatic adapter', async () => {
      const adapter: DynamicVoiceScriptExports = {
        name: 'trusted-voice-adapter',
        defaultStreamModel: 'trusted-v1',
        createSession: (ctx) => {
          let bufferLen = 0
          return {
            writePcm: (chunk) => {
              bufferLen += chunk.length
              ctx.emit({ type: 'partial', text: `正在识别...${bufferLen}` })
            },
            end: () => {
              ctx.emit({ type: 'final', text: '语音输入成功' })
              ctx.emit({ type: 'end' })
            },
          }
        },
      }

      const provider = new DynamicScriptVoiceProvider({ adapter })
      expect(provider.id).toBe('trusted-voice-adapter')
      expect(provider.defaultStreamModel).toBe('trusted-v1')
      expect(provider.capabilities.stream).toBe(true)

      const stream = await provider.createStream({
        model: 'trusted-v1',
        audio: { format: 'pcm', sampleRate: 16000, channels: 1, bitsPerSample: 16 },
        requestId: 'req-trusted-test',
      })

      await stream.ready

      const events: string[] = []
      const readEvents = (async () => {
        for await (const event of stream.events) {
          if (event.type === 'partial' || event.type === 'final') {
            events.push(event.text)
          }
        }
      })()

      await stream.writePcm(new Uint8Array([1, 2, 3, 4]))
      await stream.writePcm(new Uint8Array([5, 6, 7, 8]))
      await stream.end()
      await readEvents

      expect(events).toEqual(['正在识别...4', '正在识别...8', '语音输入成功'])
    })

    it('fails the event queue and aborts late-resolving sessions on handshake timeout', async () => {
      let resolveLateSession!: (session: { writePcm: () => void, end: () => void, abort: () => void }) => void
      const lateAbort = vi.fn()
      const adapter: DynamicVoiceScriptExports = {
        createSession: () =>
          new Promise((resolve) => {
            resolveLateSession = resolve
          }),
      }

      const provider = new DynamicScriptVoiceProvider({
        adapter,
        timeoutMs: 40,
      })

      const stream = await provider.createStream({
        model: 'default',
        audio: { format: 'pcm', sampleRate: 16000, channels: 1, bitsPerSample: 16 },
        requestId: 'req-hang',
      })

      const nextEvent = stream.events[Symbol.asyncIterator]().next()
      await expect(stream.ready).rejects.toMatchObject({ code: 'VOICE_SCRIPT_TIMEOUT' })
      await expect(nextEvent).rejects.toMatchObject({ code: 'VOICE_SCRIPT_TIMEOUT' })

      resolveLateSession({ writePcm: () => {}, end: () => {}, abort: lateAbort })
      await Promise.resolve()
      await Promise.resolve()
      expect(lateAbort).toHaveBeenCalledTimes(1)
    })

    it('rejects SSRF requests including IPv6 loopback inside context.fetch', async () => {
      for (const blockedUrl of ['https://169.254.169.254/secret', 'https://[::1]/secret']) {
        const provider = new DynamicScriptVoiceProvider({
          adapter: {
            createSession: async (ctx) => {
              await ctx.fetch(blockedUrl)
              return { writePcm: () => {}, end: () => {} }
            },
          },
        })
        const stream = await provider.createStream({
          model: 'default',
          audio: { format: 'pcm', sampleRate: 16000, channels: 1, bitsPerSample: 16 },
          requestId: 'req-ssrf',
        })
        await expect(stream.ready).rejects.toMatchObject({ code: 'VOICE_SCRIPT_URL_DENIED' })
      }
    })

    it('rejects DNS SSRF targets in context.connectWebSocket and custom httpClient context.fetch by default', async () => {
      const socketConnect = vi.fn()
      const wsRebindProvider = new DynamicScriptVoiceProvider({
        socketFactory: { connect: socketConnect },
        lookup: async () => [{ address: '127.0.0.1' }],
        adapter: {
          createSession: async (ctx) => {
            await ctx.connectWebSocket?.('wss://rebind.example.test/ws')
            return { writePcm: () => {}, end: () => {} }
          },
        },
      })
      const wsStream = await wsRebindProvider.createStream({
        model: 'default',
        audio: { format: 'pcm', sampleRate: 16000, channels: 1, bitsPerSample: 16 },
        requestId: 'req-ws-ssrf',
      })
      await expect(wsStream.ready).rejects.toMatchObject({ code: 'VOICE_SCRIPT_URL_DENIED' })
      expect(socketConnect).not.toHaveBeenCalled()

      // Even without explicit lookup option, connectWebSocket must run default DNS validation (not skip it).
      const wsDefaultDnsProvider = new DynamicScriptVoiceProvider({
        socketFactory: { connect: socketConnect },
        adapter: {
          createSession: async (ctx) => {
            await ctx.connectWebSocket?.('wss://nonexistent.invalid/ws')
            return { writePcm: () => {}, end: () => {} }
          },
        },
      })
      const wsDefaultStream = await wsDefaultDnsProvider.createStream({
        model: 'default',
        audio: { format: 'pcm', sampleRate: 16000, channels: 1, bitsPerSample: 16 },
        requestId: 'req-ws-default-dns',
      })
      await expect(wsDefaultStream.ready).rejects.toMatchObject({ code: 'VOICE_SCRIPT_URL_DENIED' })
      expect(socketConnect).not.toHaveBeenCalled()

      // Custom httpClient path must also run default DNS validation rather than skipping it.
      const httpRequest = vi.fn()
      const httpDefaultDnsProvider = new DynamicScriptVoiceProvider({
        httpClient: { request: httpRequest },
        adapter: {
          createSession: async (ctx) => {
            await ctx.fetch('https://nonexistent.invalid/api')
            return { writePcm: () => {}, end: () => {} }
          },
        },
      })
      const httpDefaultStream = await httpDefaultDnsProvider.createStream({
        model: 'default',
        audio: { format: 'pcm', sampleRate: 16000, channels: 1, bitsPerSample: 16 },
        requestId: 'req-http-default-dns',
      })
      await expect(httpDefaultStream.ready).rejects.toMatchObject({ code: 'VOICE_SCRIPT_URL_DENIED' })
      expect(httpRequest).not.toHaveBeenCalled()
    })

    it('executes transcribeUpload successfully via trusted adapter', async () => {
      const provider = new DynamicScriptVoiceProvider({
        adapter: {
          transcribeUpload: async () => ({
            text: '上传识别成功',
            language: 'zh-CN',
            durationMs: 1200,
          }),
        },
      })
      expect(provider.capabilities.upload).toBe(true)
      expect(provider.capabilities.stream).toBe(false)

      const result = await provider.transcribeUpload({
        model: 'test-upload',
        source: { kind: 'bytes', bytes: Buffer.from([0, 1]), format: 'wav' },
        requestId: 'req-upload',
      })

      expect(result).toEqual({
        text: '上传识别成功',
        language: 'zh-CN',
        durationMs: 1200,
      })
    })
  })
})
