import type { LocalModelDescriptor } from '../src/index'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildWavHeader,
  buildWhisperArgs,
  isPrimerEcho,
  listInstalledModels,
  loadInstalledModel,
  LocalOfflineVoiceProvider,
  pcmDurationMs,
  readModelDescriptor,
  verifyModelIntegrity,
  VoiceProviderError,
  wrapPcmAsWav,
} from '../src/index'

/** A descriptor that validates, so each test can vary exactly one field. */
function descriptorFixture(overrides: Partial<LocalModelDescriptor> = {}): LocalModelDescriptor {
  return {
    schemaVersion: 1,
    id: 'fixture-model',
    version: '1.0.0',
    name: 'Fixture',
    engine: 'whisper-cpp',
    languages: ['zh'],
    defaultLanguage: 'zh',
    runtime: { kind: 'ggml', file: 'weights.bin', bytes: 4, sha256: '0'.repeat(64) },
    capabilities: { stream: true, upload: true },
    license: { spdx: 'MIT', redistributable: true },
    ...overrides,
  }
}

/** Write a descriptor into <root>/<id>/<version>, so path/identity checks are exercised. */
async function installFixture(
  root: string,
  descriptor: LocalModelDescriptor,
  weights?: Uint8Array,
): Promise<string> {
  const directory = join(root, descriptor.id, descriptor.version)
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'model.json'), JSON.stringify(descriptor))
  if (weights)
    await writeFile(join(directory, descriptor.runtime.file), weights)
  return directory
}

const createdRoots: string[] = []

/** Each test builds its own model store, so no test can observe another's install. */
async function makeWorkspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'tuff-voice-test-'))
  createdRoots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(createdRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('wav container', () => {
  it('derives byte rate and block align instead of trusting the caller', () => {
    const header = buildWavHeader(32000, { sampleRate: 16000, channels: 1, bitsPerSample: 16 })
    expect(header.toString('ascii', 0, 4)).toBe('RIFF')
    expect(header.toString('ascii', 8, 12)).toBe('WAVE')
    expect(header.toString('ascii', 36, 40)).toBe('data')
    expect(header.readUInt16LE(22)).toBe(1)
    expect(header.readUInt32LE(24)).toBe(16000)
    expect(header.readUInt32LE(28)).toBe(32000)
    expect(header.readUInt16LE(32)).toBe(2)
    expect(header.readUInt32LE(4)).toBe(36 + 32000)
    // Stereo halves the frames per byte, so the derived rate must move with the channel count.
    expect(buildWavHeader(0, { sampleRate: 48000, channels: 2, bitsPerSample: 16 }).readUInt32LE(28)).toBe(192000)
  })

  it('reports payload length in milliseconds', () => {
    expect(pcmDurationMs(32000, { sampleRate: 16000, channels: 1 })).toBe(1000)
    expect(pcmDurationMs(32000 * 2, { sampleRate: 16000, channels: 2 })).toBe(1000)
    expect(pcmDurationMs(0, { sampleRate: 16000, channels: 1 })).toBe(0)
  })

  it('wraps payload without altering it', () => {
    const pcm = Uint8Array.from({ length: 200 }, (_, index) => index % 256)
    const wav = wrapPcmAsWav(pcm, { sampleRate: 16000, channels: 1 })
    expect(wav.byteLength).toBe(44 + pcm.byteLength)
    expect([...wav.subarray(44)]).toEqual([...pcm])
  })
})

describe('descriptor validation', () => {
  it('rejects a descriptor naming an engine the runtime cannot dispatch', async () => {
    const root = await makeWorkspace()
    await installFixture(root, descriptorFixture({ engine: 'not-a-real-engine' as never }))
    await expect(readModelDescriptor(join(root, 'fixture-model', '1.0.0'))).rejects.toThrow(/unknown engine/)
  })

  it('rejects a digest that is not a sha256', async () => {
    const root = await makeWorkspace()
    await installFixture(root, descriptorFixture({
      runtime: { kind: 'ggml', file: 'weights.bin', bytes: 4, sha256: 'deadbeef' },
    }))
    await expect(readModelDescriptor(join(root, 'fixture-model', '1.0.0'))).rejects.toThrow(/sha256/)
  })

  it('rejects a non-semver version and a missing runtime', async () => {
    const root = await makeWorkspace()
    await installFixture(root, descriptorFixture({ version: 'v1' }))
    await expect(readModelDescriptor(join(root, 'fixture-model', 'v1'))).rejects.toThrow(/semver/)

    await installFixture(root, descriptorFixture({
      id: 'no-runtime',
      runtime: undefined as never,
    }))
    await expect(readModelDescriptor(join(root, 'no-runtime', '1.0.0'))).rejects.toThrow(/runtime is missing/)
  })

  it('rejects a weight path that escapes the model directory', async () => {
    const root = await makeWorkspace()
    await installFixture(root, descriptorFixture({
      runtime: { kind: 'ggml', file: '../../../../etc/passwd', bytes: 4, sha256: '0'.repeat(64) },
    }))
    // The descriptor travels with the bundle, so it must not be able to point outside it.
    await expect(loadInstalledModel(root, 'fixture-model', '1.0.0')).rejects.toThrow(/escapes the model directory/)
  })
})

describe('model store', () => {
  it('skips a stray directory but surfaces a corrupt descriptor', async () => {
    const root = await makeWorkspace()
    await mkdir(join(root, 'not-a-model', '1.0.0'), { recursive: true })
    await installFixture(root, descriptorFixture({ id: 'good-model' }))

    const installed = await listInstalledModels(root)
    expect(installed.map(entry => entry.id)).toEqual(['good-model'])

    // A directory with no descriptor is a stray folder; one with a broken descriptor is
    // corruption, and hiding it would leave the user with a model that never appears.
    await mkdir(join(root, 'broken', '1.0.0'), { recursive: true })
    await writeFile(join(root, 'broken', '1.0.0', 'model.json'), '{ not json')
    await expect(listInstalledModels(root)).rejects.toThrow(/broken\/1\.0\.0\/model\.json/)
  })

  it('loads the newest installed version when none is pinned', async () => {
    const root = await makeWorkspace()
    await installFixture(root, descriptorFixture({ version: '0.9.0' }))
    await installFixture(root, descriptorFixture({ version: '1.10.0' }))
    const model = await loadInstalledModel(root, 'fixture-model')
    expect(model.descriptor.version).toBe('1.10.0')
  })

  it('detects weights that do not match their declared digest', async () => {
    const root = await makeWorkspace()
    const weights = Buffer.from('abcd')
    await installFixture(root, descriptorFixture(), weights)

    const good = await loadInstalledModel(root, 'fixture-model', '1.0.0')
    await expect(verifyModelIntegrity(good)).rejects.toThrow(/hash to/)

    const declaredWrong = await makeWorkspace()
    await installFixture(declaredWrong, descriptorFixture({
      runtime: { kind: 'ggml', file: 'weights.bin', bytes: 4, sha256: 'a'.repeat(64) },
    }), weights)
    await expect(verifyModelIntegrity(await loadInstalledModel(declaredWrong, 'fixture-model', '1.0.0')))
      .rejects
      .toThrow(/hash to/)
  })

  it('accepts weights that match the declared digest and size', async () => {
    const root = await makeWorkspace()
    const weights = Buffer.from('abcd')
    await installFixture(root, descriptorFixture({
      runtime: {
        kind: 'ggml',
        file: 'weights.bin',
        bytes: weights.byteLength,
        sha256: createHash('sha256').update(weights).digest('hex'),
      },
    }), weights)
    await expect(verifyModelIntegrity(await loadInstalledModel(root, 'fixture-model', '1.0.0'))).resolves.toBeUndefined()

    await rm(root, { recursive: true, force: true })
  })
})

describe('whisper argument construction', () => {
  const model = (overrides: Partial<LocalModelDescriptor> = {}): Parameters<typeof buildWhisperArgs>[0] => ({
    descriptor: descriptorFixture(overrides),
    directory: '/models/fixture-model/1.0.0',
    weightsPath: '/models/fixture-model/1.0.0/weights.bin',
  })

  it('attaches the Simplified primer only for Chinese audio that needs it', () => {
    const needsSimplified = buildWhisperArgs(
      model({ text: { requiresSimplifiedConversion: true, script: 'traditional' } }),
      '/tmp/a.wav',
      '/tmp/out',
      {},
    )
    expect(needsSimplified).toContain('--prompt')
    expect(needsSimplified).toContain('--carry-initial-prompt')

    // English decoding must not carry a Chinese primer.
    expect(buildWhisperArgs(model(), '/tmp/a.wav', '/tmp/out', { language: 'en' })).not.toContain('--prompt')
    // Nor may a model that already emits Simplified.
    expect(buildWhisperArgs(model({ text: { requiresSimplifiedConversion: false } }), '/tmp/a.wav', '/tmp/out', {}))
      .not
      .toContain('--prompt')
  })

  it('honours a request for no timestamps, which changes the decode and not just the output', () => {
    const withTimestamps = buildWhisperArgs(model(), '/tmp/a.wav', '/tmp/out', {})
    const withoutTimestamps = buildWhisperArgs(model(), '/tmp/a.wav', '/tmp/out', { timestamps: false })
    expect(withTimestamps).not.toContain('-nt')
    expect(withoutTimestamps).toContain('-nt')
    // `-oj` stays either way: the caller still parses JSON, only the offsets go away.
    expect(withoutTimestamps).toContain('-oj')
  })

  it('always writes structured output the runtime can parse', () => {
    const args = buildWhisperArgs(model(), '/tmp/a.wav', '/tmp/out', {})
    expect(args).toContain('-oj')
    expect(args).toEqual(expect.arrayContaining(['-m', '/models/fixture-model/1.0.0/weights.bin', '-f', '/tmp/a.wav']))
  })
})

describe('primer echo guard', () => {
  const primer = '以下是普通话的句子，请使用简体中文。'

  it('drops output that is the primer bleeding through', () => {
    // Measured on 600 ms of audio, which decodes to exactly this.
    expect(isPrimerEcho('简体中文。', primer)).toBe(true)
    expect(isPrimerEcho('以下是普通话的句子', primer)).toBe(true)
  })

  it('keeps real speech, including speech that merely mentions the primer words', () => {
    expect(isPrimerEcho('今天天气很好', primer)).toBe(false)
    expect(isPrimerEcho('', primer)).toBe(false)
    expect(isPrimerEcho('我今天学习了普通话', primer)).toBe(false)
  })
})

describe('local provider contract', () => {
  const provider = new LocalOfflineVoiceProvider({
    model: {
      descriptor: descriptorFixture(),
      directory: '/models/fixture-model/1.0.0',
      weightsPath: '/models/fixture-model/1.0.0/weights.bin',
    },
  })

  it('identifies itself as an on-device provider', () => {
    expect(provider.id).toBe('local-offline')
    expect(provider.kind).toBe('local')
    expect(provider.capabilities.formats).not.toContain('aac')
  })

  it('refuses audio it cannot hand to the engine, rather than decoding the wrong thing', async () => {
    await expect(provider.createStream({
      model: provider.defaultStreamModel,
      audio: { format: 'mp3', sampleRate: 16000, channels: 1, bitsPerSample: 16 },
      requestId: 'r1',
    })).rejects.toBeInstanceOf(VoiceProviderError)

    await expect(provider.createStream({
      model: provider.defaultStreamModel,
      audio: { format: 'pcm', sampleRate: 16000, channels: 2, bitsPerSample: 16 },
      requestId: 'r2',
    })).rejects.toThrow(/mono/)
  })

  it('refuses a remote upload source, which would make the provider need the network', async () => {
    await expect(provider.transcribeUpload({
      model: provider.defaultUploadModel,
      source: { kind: 'url', url: 'https://example.com/a.wav' },
      requestId: 'r3',
    })).rejects.toThrow(/local bytes only/)
  })
})
