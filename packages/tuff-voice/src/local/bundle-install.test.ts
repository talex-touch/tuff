import { createHash } from 'node:crypto'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  installSpeechBundle,
  removeSpeechBundle,
  SpeechBundleInstallError,
  type SpeechBundleSpec,
} from './bundle-install'
import { loadInstalledModelSync, listInstalledModels } from './model-store'

const WEIGHTS = Buffer.from('a ggml file, twelve bytes at least'.repeat(4))
const TOKENS = Buffer.from('a b c\n')

function digest(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

const DESCRIPTOR = {
  schemaVersion: 1,
  id: 'demo-model',
  version: '1.0.0',
  name: 'Demo',
  engine: 'whisper-cpp',
  languages: ['zh'],
  runtime: {
    kind: 'ggml',
    file: 'demo.bin',
    bytes: WEIGHTS.byteLength,
    sha256: digest(WEIGHTS),
  },
  capabilities: { stream: true, upload: true },
  license: { spdx: 'MIT', redistributable: true },
}

function spec(overrides: Partial<SpeechBundleSpec> = {}): SpeechBundleSpec {
  return {
    id: 'demo-model',
    version: '1.0.0',
    engine: 'whisper-cpp',
    files: [
      {
        role: 'weights',
        file: 'demo.bin',
        bytes: WEIGHTS.byteLength,
        sha256: digest(WEIGHTS),
        url: 'https://cdn.test/demo.bin',
      },
    ],
    descriptor: DESCRIPTOR,
    ...overrides,
  }
}

/** Serves fixed bodies by URL and counts requests per URL. */
function serveFiles(bodies: Record<string, Buffer>): Map<string, number> {
  const calls = new Map<string, number>()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      calls.set(url, (calls.get(url) ?? 0) + 1)
      const body = bodies[url]
      if (!body) return new Response('not found', { status: 404 })
      return new Response(new Uint8Array(body), { status: 200 })
    }),
  )
  return calls
}

async function storeRoot(): Promise<string> {
  return await mkdtemp(join(tmpdir(), 'tuff-model-install-'))
}

describe('installing a speech bundle', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('installs a bundle the runtime can then resolve', async () => {
    const root = await storeRoot()
    serveFiles({ 'https://cdn.test/demo.bin': WEIGHTS })

    const report = await installSpeechBundle(spec(), { root })

    expect(report.downloaded).toEqual([{ file: 'demo.bin', bytes: WEIGHTS.byteLength }])
    // The real assertion: this is the store's own resolver, not a check on files we assume.
    const resolved = loadInstalledModelSync(root, 'demo-model', '1.0.0')
    expect(resolved.weightsPath).toBe(join(root, 'demo-model', '1.0.0', 'demo.bin'))
    expect((await readFile(resolved.weightsPath)).equals(WEIGHTS)).toBe(true)
    // And the store lists it, which is what the settings page shows.
    expect((await listInstalledModels(root)).map((model) => model.id)).toEqual(['demo-model'])
  })

  it('refuses bytes that do not match the digest, and leaves nothing resolvable', async () => {
    const root = await storeRoot()
    serveFiles({ 'https://cdn.test/demo.bin': Buffer.from('a different model entirely'.repeat(4)) })

    await expect(installSpeechBundle(spec(), { root })).rejects.toMatchObject({
      code: 'SPEECH_BUNDLE_DIGEST_MISMATCH',
    })

    expect(await listInstalledModels(root)).toEqual([])
    await expect(readFile(join(root, 'demo-model', '1.0.0', 'demo.bin'))).rejects.toThrow()
    await expect(readFile(join(root, 'demo-model', '1.0.0', 'model.json'))).rejects.toThrow()
  })

  it('leaves no descriptor behind when a later file fails, so a half install stays invisible', async () => {
    const root = await storeRoot()
    serveFiles({
      'https://cdn.test/demo.bin': WEIGHTS,
      'https://cdn.test/tokens.txt': Buffer.from('x'),
    })
    const twoFiles = spec({
      files: [
        ...spec().files,
        {
          role: 'tokenizer',
          file: 'tokens.txt',
          bytes: TOKENS.byteLength,
          sha256: digest(TOKENS),
          url: 'https://cdn.test/tokens.txt',
        },
      ],
    })

    await expect(installSpeechBundle(twoFiles, { root })).rejects.toMatchObject({
      code: 'SPEECH_BUNDLE_DIGEST_MISMATCH',
    })

    // The weights landed, but the descriptor did not: the store still sees nothing.
    expect(await listInstalledModels(root)).toEqual([])
  })

  it('reuses a verified file instead of downloading it again', async () => {
    const root = await storeRoot()
    const calls = serveFiles({ 'https://cdn.test/demo.bin': WEIGHTS })

    await installSpeechBundle(spec(), { root })
    const report = await installSpeechBundle(spec(), { root })

    expect(report.reused).toEqual([{ file: 'demo.bin', bytes: WEIGHTS.byteLength }])
    expect(calls.get('https://cdn.test/demo.bin')).toBe(1)
  })

  it('replaces a file on disk that no longer matches', async () => {
    const root = await storeRoot()
    serveFiles({ 'https://cdn.test/demo.bin': WEIGHTS })
    await installSpeechBundle(spec(), { root })
    await writeFile(join(root, 'demo-model', '1.0.0', 'demo.bin'), 'corrupted')

    const report = await installSpeechBundle(spec(), { root })

    expect(report.downloaded).toHaveLength(1)
    expect((await readFile(join(root, 'demo-model', '1.0.0', 'demo.bin'))).equals(WEIGHTS)).toBe(true)
  })

  it('refuses a file name that would escape the bundle directory', async () => {
    const root = await storeRoot()
    serveFiles({})

    await expect(
      installSpeechBundle(
        spec({
          files: [
            {
              role: 'weights',
              file: '../escaped.bin',
              bytes: WEIGHTS.byteLength,
              sha256: digest(WEIGHTS),
              url: 'https://cdn.test/demo.bin',
            },
          ],
        }),
        { root },
      ),
    ).rejects.toMatchObject({ code: 'SPEECH_BUNDLE_INVALID' })
  })

  it('refuses a descriptor that contradicts the weights it is installed with', async () => {
    const root = await storeRoot()
    serveFiles({ 'https://cdn.test/demo.bin': WEIGHTS })

    await expect(
      installSpeechBundle(
        spec({
          descriptor: {
            ...DESCRIPTOR,
            runtime: { ...DESCRIPTOR.runtime, sha256: 'f'.repeat(64) },
          },
        }),
        { root },
      ),
    ).rejects.toBeInstanceOf(SpeechBundleInstallError)
  })

  it('removes an installed version and its directory', async () => {
    const root = await storeRoot()
    serveFiles({ 'https://cdn.test/demo.bin': WEIGHTS })
    await installSpeechBundle(spec(), { root })

    expect(await removeSpeechBundle(root, 'demo-model', '1.0.0')).toBe(true)
    expect(await listInstalledModels(root)).toEqual([])
  })
})
