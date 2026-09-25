import type { LocalAudioInput, ResolvedLocalModel } from './types'
import { Buffer } from 'node:buffer'
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { LocalEngineError } from './types'
import { buildWhisperArgs, describeMissingOutput, resolveWhisperLanguage, WhisperCppLocalEngine } from './whisper-cpp-engine'

/**
 * whisper.cpp exits 0 both when it cannot read its input and when it cannot open its result
 * path, so the only diagnosis a caller ever gets is what the CLI printed. Every fake below is a
 * real executable on disk, so the engine's own binary resolution, spawn and output parsing run
 * unchanged — the behaviour under test cannot be reached by stubbing any of that out.
 */
const WRITES_RESULT = [
  `base=''`,
  `previous=''`,
  `for argument in "$@"; do`,
  `  if [ "$previous" = '-of' ]; then base="$argument"; fi`,
  `  previous="$argument"`,
  `done`,
  `cat > "$base.json" <<'PAYLOAD'`,
  '{"result":{"language":"zh"},"transcription":[{"offsets":{"from":0,"to":1000},"text":"今天天气很好"},{"offsets":{"from":1000,"to":2500},"text":"我们去公园散步吧"}]}',
  'PAYLOAD',
].join('\n')

const UNREADABLE_INPUT = `echo "error: failed to read audio file '/tmp/x.wav'" >&2`
const UNWRITABLE_OUTPUT = `echo "open: failed to open '/nope/result.json' for writing" >&2`
const UNRELATED_CHATTER = `echo 'load_backend: loaded CPU backend' >&2`

/**
 * A CLI that resolves `-l` the way whisper.cpp does: a tag outside its table gets usage lines and
 * exit 0 with nothing written, so a locale reaching it is a decode that reports no result rather
 * than a language the model merely guessed wrong on. It mirrors the accepted tag back into its own
 * result, which makes the transcript's `language` a witness of what the CLI was actually handed.
 */
const VALIDATES_LANGUAGE = [
  `base=''`,
  `language=''`,
  `previous=''`,
  `for argument in "$@"; do`,
  `  case "$previous" in`,
  `    -of) base="$argument" ;;`,
  `    -l) language="$argument" ;;`,
  `  esac`,
  `  previous="$argument"`,
  `done`,
  `case "$language" in`,
  `  auto|zh|en|ja|ko) ;;`,
  `  *)`,
  `    echo "error: invalid language '$language'" >&2`,
  `    echo 'usage: whisper-cli [options] file0 file1 ...' >&2`,
  `    exit 0`,
  `    ;;`,
  `esac`,
  `printf '{"result":{"language":"%s"},"transcription":[{"offsets":{"from":0,"to":1000},"text":"今天天气不错"}]}' "$language" > "$base.json"`,
].join('\n')

const FALLBACK_MESSAGE = 'whisper-cli did not produce a readable result.'

const AUDIO: LocalAudioInput = { kind: 'pcm', bytes: new Uint8Array(3_200), sampleRate: 16_000, channels: 1 }

/** Long enough that a fake which never reaches `exit` fails the test instead of hanging it. */
const TIMEOUT_MS = 5_000

const scratchDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    scratchDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })),
  )
})

async function scratch(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix))
  scratchDirectories.push(directory)
  return directory
}

/** A stand-in for whisper-cli: whatever `body` says, then exit 0 without touching the filesystem. */
async function fakeWhisperCli(body: string): Promise<string> {
  const directory = await scratch('tuff-whisper-cli-')
  const binaryPath = join(directory, 'whisper-cli')
  await writeFile(binaryPath, `#!/bin/sh\n${body}\nexit 0\n`, 'utf8')
  await chmod(binaryPath, 0o755)
  return binaryPath
}

interface ModelOptions {
  languages?: readonly string[]
  defaultLanguage?: string
  requiresSimplifiedConversion?: boolean
}

async function resolvedModel(options: ModelOptions = {}): Promise<ResolvedLocalModel> {
  const directory = await scratch('tuff-whisper-model-')
  const weightsPath = join(directory, 'ggml-demo.bin')
  const weights = Buffer.from('a ggml file, twenty-four bytes')
  await writeFile(weightsPath, weights)
  return {
    directory,
    weightsPath,
    descriptor: {
      schemaVersion: 1,
      id: 'demo-whisper',
      version: '1.0.0',
      name: 'Demo',
      engine: 'whisper-cpp',
      languages: options.languages ?? ['zh'],
      ...(options.defaultLanguage ? { defaultLanguage: options.defaultLanguage } : {}),
      runtime: { kind: 'ggml', file: 'ggml-demo.bin', bytes: weights.byteLength, sha256: 'a'.repeat(64) },
      ...(options.requiresSimplifiedConversion ? { text: { requiresSimplifiedConversion: true } } : {}),
      capabilities: { stream: false, upload: true },
      license: { spdx: 'MIT', redistributable: true },
    },
  }
}

/** Runs one decode that is expected to fail, and hands back the engine's own error. */
async function decodeFailure(binaryPath: string): Promise<LocalEngineError> {
  const engine = new WhisperCppLocalEngine({ binaryPath })
  try {
    await engine.transcribe(AUDIO, await resolvedModel(), { timeoutMs: TIMEOUT_MS })
  }
  catch (error) {
    if (error instanceof LocalEngineError)
      return error
    throw error
  }
  throw new Error('expected the decode to fail, but transcribe resolved')
}

describe('decoding with a whisper.cpp CLI', () => {
  it('returns the transcription the CLI wrote', async () => {
    const engine = new WhisperCppLocalEngine({ binaryPath: await fakeWhisperCli(WRITES_RESULT) })

    const result = await engine.transcribe(AUDIO, await resolvedModel(), { timeoutMs: TIMEOUT_MS })

    expect(result.text).toBe('今天天气很好我们去公园散步吧')
    expect(result.segments?.map(segment => segment.text)).toEqual(['今天天气很好', '我们去公园散步吧'])
    expect(result.language).toBe('zh')
  })

  it('decodes when the caller names a locale, instead of handing -l a tag the CLI refuses', async () => {
    const engine = new WhisperCppLocalEngine({ binaryPath: await fakeWhisperCli(VALIDATES_LANGUAGE) })
    const model = await resolvedModel({ languages: ['zh'], requiresSimplifiedConversion: true })

    const result = await engine.transcribe(AUDIO, model, { language: 'zh-CN', timeoutMs: TIMEOUT_MS })

    expect(result.text).toBe('今天天气不错')
    expect(result.language).toBe('zh')
  })

  it('reports the CLI refusing to read its input, not a bare missing file', async () => {
    const failure = await decodeFailure(await fakeWhisperCli(UNREADABLE_INPUT))

    expect(failure.code).toBe('LOCAL_ENGINE_DECODE_FAILED')
    expect(failure.message).toContain('failed to read audio file')
    expect(failure.message).not.toBe(FALLBACK_MESSAGE)
  })

  it('reports the CLI refusing to open its result path', async () => {
    const failure = await decodeFailure(await fakeWhisperCli(UNWRITABLE_OUTPUT))

    expect(failure.code).toBe('LOCAL_ENGINE_DECODE_FAILED')
    expect(failure.message).toContain('failed to open')
    expect(failure.message).not.toBe(FALLBACK_MESSAGE)
  })

  it('falls back to a plain sentence when the CLI left no reason on stderr', async () => {
    const failure = await decodeFailure(await fakeWhisperCli(UNRELATED_CHATTER))

    expect(failure.code).toBe('LOCAL_ENGINE_DECODE_FAILED')
    expect(failure.message).toBe(FALLBACK_MESSAGE)
  })
})

describe('describing a decode that exited 0 with no result', () => {
  it('has nothing to add when stderr carries no reason', () => {
    expect(describeMissingOutput('')).toBe(FALLBACK_MESSAGE)
  })

  it('keeps the last two reason lines, in order, and drops the rest', () => {
    const stderr = [
      `error: failed to read audio file 'a.wav'`,
      'whisper_init_from_file_with_params_no_state: loading model from ggml-demo.bin',
      'error: no samples were decoded',
      `open: failed to open 'result.json' for writing`,
    ].join('\n')

    expect(describeMissingOutput(stderr)).toBe(
      `whisper-cli wrote no readable transcription: error: no samples were decoded | open: failed to open 'result.json' for writing`,
    )
  })

  it('truncates a reason long enough to swamp the caller message', () => {
    const reason = `error: ${'x'.repeat(500)}`

    expect(describeMissingOutput(reason)).toBe(
      `whisper-cli wrote no readable transcription: ${reason.slice(0, 400)}`,
    )
  })
})

describe('the language whisper-cli is handed', () => {
  it('narrows a locale onto a tag the bundle declares, and detects otherwise', async () => {
    const model = await resolvedModel({ languages: ['zh', 'en'] })
    const rows = [
      ['zh-CN', 'zh'],
      ['zh_CN', 'zh'],
      ['en-US', 'en'],
      ['fr', 'auto'],
      ['auto', 'auto'],
    ] as const

    for (const [requested, expected] of rows)
      expect(resolveWhisperLanguage(model, { language: requested }), requested).toBe(expected)
  })

  it('takes the bundle at its word for a language no table of its own would list', async () => {
    const model = await resolvedModel({ languages: ['fr'] })

    expect(resolveWhisperLanguage(model, { language: 'fr-CA' })).toBe('fr')
  })

  it('puts the narrowed tag into the argument vector the CLI is run with', async () => {
    const model = await resolvedModel({ languages: ['zh', 'en'] })

    const args = buildWhisperArgs(model, '/tmp/input.wav', '/tmp/result', { language: 'zh-CN' })

    expect(args[args.indexOf('-l') + 1]).toBe('zh')
  })

  it('still attaches the Simplified-Chinese primer when a locale narrowed down to zh', async () => {
    const model = await resolvedModel({ languages: ['zh'], requiresSimplifiedConversion: true })

    const args = buildWhisperArgs(model, '/tmp/input.wav', '/tmp/result', { language: 'zh-CN' })

    expect(args[args.indexOf('--prompt') + 1]).toBe('以下是普通话的句子，请使用简体中文。')
  })
})
