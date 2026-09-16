import type { LocalModelDescriptor } from '../src/index'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildSherpaArgs,
  buildWavHeader,
  buildWhisperArgs,
  createLocalEngine,
  isPrimerEcho,
  listInstalledModels,
  loadInstalledModel,
  LocalOfflineVoiceProvider,
  pcmDurationMs,
  pickTranscript,
  readModelDescriptor,
  resolveAuxiliaryPath,
  resolveSherpaLanguage,
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

describe('sherpa-onnx argument construction', () => {
  const sherpaDescriptor = (overrides: Partial<LocalModelDescriptor> = {}): LocalModelDescriptor =>
    descriptorFixture({
      engine: 'sherpa-onnx',
      sherpa: { family: 'sense-voice' },
      runtime: { kind: 'onnx', file: 'model.int8.onnx', bytes: 4, sha256: '0'.repeat(64) },
      auxiliary: [{ role: 'tokenizer', file: 'tokens.txt', bytes: 2, sha256: '1'.repeat(64) }],
      capabilities: { stream: true, upload: true, punctuation: true, itn: true },
      ...overrides,
    })

  const model = (overrides: Partial<LocalModelDescriptor> = {}): Parameters<typeof buildSherpaArgs>[0] => ({
    descriptor: sherpaDescriptor(overrides),
    directory: '/models/fixture-model/1.0.0',
    weightsPath: '/models/fixture-model/1.0.0/model.int8.onnx',
  })

  it('names the sense-voice recognizer and the bundle tokenizer, not the weights alone', () => {
    const args = buildSherpaArgs(model(), '/tmp/a.wav', {})
    expect(args).toEqual(expect.arrayContaining([
      '--sense-voice-model=/models/fixture-model/1.0.0/model.int8.onnx',
      '--tokens=/models/fixture-model/1.0.0/tokens.txt',
      '--debug=0',
    ]))
    // The audio path is positional and comes last, after every flag.
    expect(args.at(-1)).toBe('/tmp/a.wav')
  })

  it('enables inverse text normalisation from the descriptor, not from the caller', () => {
    expect(buildSherpaArgs(model(), '/tmp/a.wav', {})).toContain('--sense-voice-use-itn=1')
    // A bundle that does not declare the capability must not be asked for it.
    const withoutItn = model({ capabilities: { stream: true, upload: true, itn: false } })
    expect(buildSherpaArgs(withoutItn, '/tmp/a.wav', {})).not.toContain('--sense-voice-use-itn=1')
  })

  it('narrows a language tag to a value the recognizer accepts', () => {
    expect(buildSherpaArgs(model(), '/tmp/a.wav', { language: 'zh-Hans' })).toContain('--sense-voice-language=zh')
    expect(buildSherpaArgs(model(), '/tmp/a.wav', { language: 'yue' })).toContain('--sense-voice-language=yue')
    // `fr` is not in the recognizer's closed set; detection beats passing a flag it would reject.
    expect(buildSherpaArgs(model(), '/tmp/a.wav', { language: 'fr' })).toContain('--sense-voice-language=auto')
    expect(resolveSherpaLanguage(model(), { language: 'zh-CN' })).toBe('zh')
  })

  it('refuses a bundle whose family this build cannot drive, and one with no tokenizer', () => {
    const unknownFamily = model({ sherpa: { family: 'paraformer' } as never })
    expect(() => buildSherpaArgs(unknownFamily, '/tmp/a.wav', {})).toThrow(/cannot drive/)

    const noTokenizer = model({ auxiliary: [] })
    expect(() => buildSherpaArgs(noTokenizer, '/tmp/a.wav', {})).toThrow(/tokenizer/)
  })

  it('resolves the tokenizer inside the bundle and refuses one that escapes it', async () => {
    const root = await makeWorkspace()
    const descriptor = sherpaDescriptor()
    const directory = await installFixture(root, descriptor, new Uint8Array([1, 2, 3, 4]))
    await writeFile(join(directory, 'tokens.txt'), 'a b')

    const installed = await loadInstalledModel(root, 'fixture-model', '1.0.0')
    expect(resolveAuxiliaryPath(installed, 'tokenizer')).toBe(join(directory, 'tokens.txt'))
    // A role the bundle does not ship is absent, which is not the same as unreadable.
    expect(resolveAuxiliaryPath(installed, 'vad')).toBeUndefined()

    const escaping = await makeWorkspace()
    await installFixture(escaping, sherpaDescriptor({
      auxiliary: [{ role: 'tokenizer', file: '../../outside.txt', bytes: 2, sha256: '1'.repeat(64) }],
    }), new Uint8Array([1, 2, 3, 4]))
    const escaped = await loadInstalledModel(escaping, 'fixture-model', '1.0.0')
    expect(() => resolveAuxiliaryPath(escaped, 'tokenizer')).toThrow(/escapes/)
  })
})

describe('sherpa-onnx result parsing', () => {
  // The CLI's real stdout: a config banner, then the path, the JSON line, a separator, and a
  // human-readable summary. Only the recognition line is JSON, so the parse is anchored on that.
  const realStdout = [
    'OfflineRecognizerConfig(feat_config=FeatureExtractorConfig(sampling_rate=16000, feature_dim=80), model_config=OfflineModelConfig(sense_voice=OfflineSenseVoiceModelConfig(model="model.int8.onnx", language="auto", use_itn=True)), tokens="tokens.txt", num_threads=1, debug=False, provider="cpu")',
    'Creating recognizer ...',
    'recognizer created in 0.576 s',
    'Started',
    'Done!',
    '',
    './test_wavs/zh.wav',
    '{"lang": "<|zh|>", "emotion": "<|NEUTRAL|>", "event": "<|Speech|>", "text": "开放时间早上9点至下午5点。", "timestamps": [0.72, 0.96, 1.26], "tokens":["开", "放", "时"]}',
    '----',
    'num threads: 1',
    'decoding method: greedy_search',
    'Elapsed seconds: 1.392 s',
    'Real time factor (RTF): 1.392 / 12.744 = 0.109',
  ].join('\n')

  it('picks the transcript and language out of a real CLI run', () => {
    expect(pickTranscript(realStdout)).toEqual({ text: '开放时间早上9点至下午5点。', language: 'zh' })
  })

  it('treats an empty transcript as silence rather than as a missing result', () => {
    // SenseVoice is non-autoregressive: it reports nothing for nothing, which dictation wants.
    const silence = '{"lang": "<|zh|>", "text": "", "tokens": []}'
    expect(pickTranscript(silence)).toEqual({ text: '', language: 'zh' })
  })

  it('reports no result when the CLI never emitted one', () => {
    expect(pickTranscript('Creating recognizer ...\nDone!\n')).toBeUndefined()
    expect(pickTranscript('{ not json at all')).toBeUndefined()
    expect(pickTranscript('{"tokens": []}')).toBeUndefined()
  })
})

describe('sherpa-onnx descriptor contract', () => {
  it('rejects a sherpa-onnx bundle that does not name a family this build can drive', async () => {
    const root = await makeWorkspace()
    const directory = join(root, 'fixture-model', '1.0.0')
    await mkdir(directory, { recursive: true })

    await writeFile(join(directory, 'model.json'), JSON.stringify(descriptorFixture({ engine: 'sherpa-onnx' })))
    await expect(readModelDescriptor(directory)).rejects.toThrow(/sherpa\.family/)

    await writeFile(join(directory, 'model.json'), JSON.stringify(descriptorFixture({
      engine: 'sherpa-onnx',
      sherpa: { family: 'moonshine' } as never,
    })))
    await expect(readModelDescriptor(directory)).rejects.toThrow(/not a family this build can drive/)

    await writeFile(join(directory, 'model.json'), JSON.stringify(descriptorFixture({
      engine: 'sherpa-onnx',
      sherpa: { family: 'sense-voice' },
    })))
    await expect(readModelDescriptor(directory)).resolves.toMatchObject({ engine: 'sherpa-onnx' })
  })

  it('builds the sherpa engine for a sherpa bundle and narrows what the provider will accept', () => {
    expect(createLocalEngine('sherpa-onnx').id).toBe('sherpa-onnx')

    const provider = new LocalOfflineVoiceProvider({
      model: {
        descriptor: descriptorFixture({
          engine: 'sherpa-onnx',
          sherpa: { family: 'sense-voice' },
          runtime: { kind: 'onnx', file: 'model.int8.onnx', bytes: 4, sha256: '0'.repeat(64) },
        }),
        directory: '/models/fixture-model/1.0.0',
        weightsPath: '/models/fixture-model/1.0.0/model.int8.onnx',
      },
    })
    // sherpa-onnx-offline reads WAV only, so the contract must not promise it can open mp3.
    expect(provider.capabilities.formats).toEqual(['pcm', 'wav'])
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
