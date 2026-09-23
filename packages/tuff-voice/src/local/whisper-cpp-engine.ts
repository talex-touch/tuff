import type {
  LocalAsrEngine,
  LocalAudioInput,
  LocalEngineAvailability,
  LocalTranscribeOptions,
  LocalTranscribeResult,
  LocalTranscribeSegment,
  ResolvedLocalModel,
} from './types'
import { constants } from 'node:fs'
import { access, mkdtemp, readFile } from 'node:fs/promises'
import { availableParallelism, tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { discardWorkDirectory, executableCandidates, findExecutable, materializePcmInput, runLocalProcess, withDecodeLock } from './decode'
import { LocalEngineError } from './types'
import { narrowToDeclaredLanguages } from './language'
import { pcmDurationMs } from './wav'

/**
 * whisper.cpp's zh output defaults to Traditional Chinese.
 *
 * Measured on this project: 今天天气很好我们去公园散步吧 decodes to 今天天氣很好我們去公園散步吧
 * with no prompt. Prepending a Simplified primer flips the script for the same audio.
 * That is a decode-time bias rather than a post-hoc character mapping, so it also
 * survives vocabulary the mapping tables would miss.
 */
const SIMPLIFIED_CHINESE_PRIMER = '以下是普通话的句子，请使用简体中文。'

/**
 * The primer is decode context, not user speech — but the model does not always respect
 * that. Measured: 600 ms of audio (a tap-and-release) decodes to exactly "简体中文。",
 * the primer bleeding through. Typing that into someone's document is worse than typing
 * nothing, so an output contained in the primer is discarded as an echo of it.
 *
 * The cost of this guard is a genuinely spoken "简体中文" being dropped; that is a far
 * better failure than the prompt appearing in the user's text.
 */
export function isPrimerEcho(text: string, primer: string): boolean {
  const strip = (value: string): string => value.replace(/[\s，。、,.!！?？;；:：]/gu, '')
  const candidate = strip(text)
  if (!candidate)
    return false
  return strip(primer).includes(candidate)
}

/**
 * Language to hand whisper.cpp, narrowed to what the bundle declares.
 *
 * Exported so an argument vector can be asserted without spawning, and so the narrowing itself is
 * testable: a locale reaching `-l` is not a degraded transcript, it is whisper printing its usage
 * and exiting 0 with nothing written.
 */
export function resolveWhisperLanguage(model: ResolvedLocalModel, options: LocalTranscribeOptions): string {
  const descriptor = model.descriptor
  const requested = options.language ?? descriptor.defaultLanguage ?? descriptor.languages[0] ?? 'auto'
  return narrowToDeclaredLanguages(model, requested)
}

/** The primer to attach, or undefined when the model does not need one. */
function resolvePrimer(model: ResolvedLocalModel, options: LocalTranscribeOptions, language: string): string | undefined {
  const wantsSimplified = options.preferSimplifiedChinese ?? model.descriptor.text?.requiresSimplifiedConversion ?? false
  return wantsSimplified && language.startsWith('zh') ? SIMPLIFIED_CHINESE_PRIMER : undefined
}

/** Overrides for the executable, for a host that keeps it outside PATH. */
export interface WhisperCppEngineOptions {
  binaryPath?: string
  threads?: number
  timeoutMs?: number
}

/**
 * Locate a usable whisper.cpp CLI.
 */
export async function findWhisperBinary(explicit?: string): Promise<string | undefined> {
  return findExecutable(
    executableCandidates('whisper-cli', explicit, process.env.TUFF_WHISPER_BIN?.trim()),
  )
}

/** Shape of `whisper-cli -oj` output, limited to what the runtime consumes. */
interface WhisperJsonSegment {
  offsets?: { from?: number, to?: number }
  text?: string
}

interface WhisperJsonPayload {
  result?: { language?: string }
  transcription?: WhisperJsonSegment[]
}

export class WhisperCppLocalEngine implements LocalAsrEngine {
  readonly id = 'whisper-cpp' as const

  private readonly options: WhisperCppEngineOptions

  constructor(options: WhisperCppEngineOptions = {}) {
    this.options = options
  }

  /**
   * Engine-level thread and deadline settings are defaults for a caller that supplies neither.
   *
   * They live on the instance because a host configures its engine once, and they are folded in
   * here rather than at construction so a per-call value still wins.
   */
  private effectiveOptions(options: LocalTranscribeOptions): LocalTranscribeOptions {
    return {
      ...options,
      ...(options.threads === undefined && this.options.threads !== undefined ? { threads: this.options.threads } : {}),
      ...(options.timeoutMs === undefined && this.options.timeoutMs !== undefined ? { timeoutMs: this.options.timeoutMs } : {}),
    }
  }

  async checkAvailability(model: ResolvedLocalModel, binaryPath?: string): Promise<LocalEngineAvailability> {
    const binary = await findWhisperBinary(binaryPath ?? this.options.binaryPath)
    if (!binary) {
      return {
        available: false,
        reason: {
          code: 'LOCAL_ENGINE_BINARY_MISSING',
          message: 'whisper-cli was not found. Install whisper.cpp or set TUFF_WHISPER_BIN.',
        },
      }
    }
    try {
      await access(model.weightsPath, constants.R_OK)
    }
    catch {
      return {
        available: false,
        binaryPath: binary,
        model,
        reason: {
          code: 'LOCAL_ENGINE_MODEL_MISSING',
          message: `Model weights are missing at ${model.weightsPath}.`,
        },
      }
    }
    return { available: true, binaryPath: binary, model }
  }

  async transcribe(
    audio: LocalAudioInput,
    model: ResolvedLocalModel,
    options: LocalTranscribeOptions = {},
  ): Promise<LocalTranscribeResult> {
    const effective = this.effectiveOptions(options)
    return withDecodeLock(() => this.decodeOnce(audio, model, effective))
  }

  private async decodeOnce(
    audio: LocalAudioInput,
    model: ResolvedLocalModel,
    options: LocalTranscribeOptions,
  ): Promise<LocalTranscribeResult> {
    const binary = await findWhisperBinary(this.options.binaryPath)
    if (!binary) {
      throw new LocalEngineError('LOCAL_ENGINE_BINARY_MISSING', 'whisper-cli was not found in PATH.', {
        retryable: false,
      })
    }

    const workDirectory = await mkdtemp(join(tmpdir(), 'tuff-whisper-'))
    try {
      const audioPath = audio.kind === 'file'
        ? audio.path
        : await materializePcmInput(workDirectory, audio)
      const outputBase = join(workDirectory, 'result')
      const language = resolveWhisperLanguage(model, options)
      const primer = resolvePrimer(model, options, language)

      const startedAt = Date.now()
      const { stderr } = await runLocalProcess(binary, buildWhisperArgs(model, audioPath, outputBase, options, language, primer), {
        timeoutMs: options.timeoutMs ?? this.options.timeoutMs ?? 120_000,
        label: 'whisper-cli',
        ...(options.signal ? { signal: options.signal } : {}),
      })
      const elapsedMs = Date.now() - startedAt

      let payload: WhisperJsonPayload
      try {
        payload = JSON.parse(await readFile(`${outputBase}.json`, 'utf8')) as WhisperJsonPayload
      }
      catch (error) {
        throw new LocalEngineError('LOCAL_ENGINE_DECODE_FAILED', describeMissingOutput(stderr), {
          cause: error,
        })
      }

      return toTranscriptionResult(payload, audio, elapsedMs, primer)
    }
    finally {
      await discardWorkDirectory(workDirectory)
    }
  }
}

/**
 * Why a decode that exited 0 left no result behind.
 *
 * whisper.cpp reports an unusable input and an unwritable output the same way: one line on
 * stderr, then exit 0 with no file. Verified against the CLI this host uses — an audio file
 * carrying no frames prints `error: failed to read audio file '…'`, and an `-of` path that
 * cannot be opened prints `open: failed to open '…' for writing`; both exit 0. So the CLI's own
 * words are the only diagnosis there is, and a message that drops them leaves a bare ENOENT.
 */
export function describeMissingOutput(stderr: string): string {
  const reasons = stderr
    .split('\n')
    .map(line => line.trim())
    .filter(line => /error|fail|open:/i.test(line))
    .slice(-2)
  if (reasons.length === 0)
    return 'whisper-cli did not produce a readable result.'
  return `whisper-cli wrote no readable transcription: ${reasons.join(' | ').slice(0, 400)}`
}

/** Argument vector for one decode. Kept separate so it can be asserted without spawning. */
export function buildWhisperArgs(
  model: ResolvedLocalModel,
  audioPath: string,
  outputBase: string,
  options: LocalTranscribeOptions,
  language = resolveWhisperLanguage(model, options),
  primer = resolvePrimer(model, options, language),
): string[] {
  const threads = options.threads ?? Math.max(1, Math.min(8, availableParallelism() - 1))

  const args = [
    '-m',
    model.weightsPath,
    '-f',
    audioPath,
    '-l',
    language,
    '-t',
    String(threads),
    '-oj',
    '-of',
    outputBase,
    '-np',
  ]

  if (options.timestamps === false) {
    // Timestamps are not a presentation detail in whisper.cpp: the decoder emits timestamp
    // tokens, and turning them off changes the transcript itself. Measured on identical
    // audio and weights, q5_1 decoded 今天天起… with timestamps and 今天天气… without —
    // same model, same file, one flag apart. So a caller that benchmarks this engine has to
    // match this flag, and a caller that wants segments has to accept the token stream that
    // comes with them. `-oj` is kept either way so the result stays machine-readable.
    args.push('-nt')
  }

  if (primer) {
    // `--carry-initial-prompt` keeps the primer attached to later windows; without it a
    // long dictation drifts back to Traditional after the first segment.
    args.push('--prompt', primer, '--carry-initial-prompt')
  }
  return args
}

/** Collapse the CLI's JSON into the runtime's result shape. */
function toTranscriptionResult(
  payload: WhisperJsonPayload,
  audio: LocalAudioInput,
  elapsedMs: number,
  primer?: string,
): LocalTranscribeResult {
  const segments: LocalTranscribeSegment[] = []
  for (const entry of payload.transcription ?? []) {
    const text = (entry.text ?? '').trim()
    if (!text)
      continue
    segments.push({
      text,
      startMs: entry.offsets?.from ?? 0,
      endMs: entry.offsets?.to ?? 0,
    })
  }

  const text = segments.map(segment => segment.text).join('').trim()
  const echoed = primer !== undefined && isPrimerEcho(text, primer)
  const durationMs = audio.kind === 'pcm'
    ? pcmDurationMs(audio.bytes.byteLength, { sampleRate: audio.sampleRate, channels: audio.channels, bitsPerSample: 16 })
    : segments.at(-1)?.endMs

  return {
    // A dropped echo reports no segments either: the caller must not render timings for
    // text that was never spoken.
    text: echoed ? '' : text,
    ...(!echoed && segments.length ? { segments } : {}),
    ...(payload.result?.language ? { language: payload.result.language } : {}),
    ...(durationMs === undefined ? {} : { durationMs }),
    elapsedMs,
  }
}
