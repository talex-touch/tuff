import type {
  LocalAsrEngine,
  LocalAudioInput,
  LocalEngineAvailability,
  LocalTranscribeOptions,
  LocalTranscribeResult,
  LocalTranscribeSegment,
  ResolvedLocalModel,
} from './types'
import type { WavFormat } from './wav'
import { spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { availableParallelism, tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { LocalEngineError } from './types'
import { pcmDurationMs, wrapPcmAsWav } from './wav'

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
  if (!candidate) return false
  return strip(primer).includes(candidate)
}

/** Language resolution shared by the argument builder and the echo guard. */
function resolveLanguage(model: ResolvedLocalModel, options: LocalTranscribeOptions): string {
  const descriptor = model.descriptor
  return options.language ?? descriptor.defaultLanguage ?? descriptor.languages[0] ?? 'auto'
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
 * One decode at a time, host-wide.
 *
 * whisper.cpp saturates the GPU on its own, and letting decodes overlap is
 * catastrophically slower than queueing them. Measured on an M4 Pro, 3.44 s of audio
 * with ggml-base: a single decode takes 0.40 s; three running concurrently take
 * 10.05 s in total, roughly 3.3 s each — an eightfold loss per decode. Since a stream
 * naturally issues a speculative partial and then a final for the same audio, overlap
 * is the common case rather than an edge case, so the queue lives here at module scope
 * instead of per engine instance: two providers sharing a GPU contend just as badly.
 */
let decodeQueue: Promise<unknown> = Promise.resolve()

function withDecodeLock<T>(task: () => Promise<T>): Promise<T> {
  const queued = decodeQueue.then(task, task)
  // The queue must keep draining after a failure, so the stored link swallows the
  // rejection; the caller still receives it through `queued`.
  decodeQueue = queued.then(
    () => undefined,
    () => undefined,
  )
  return queued
}

/**
 * Locate a usable whisper.cpp CLI.
 *
 * An explicit path is honoured first so a caller can pin a known-good build, then the
 * environment, then PATH, then the two Homebrew prefixes. Nothing here shells out to
 * `which`: the runtime already knows the candidate set and can test it directly.
 */
export async function findWhisperBinary(explicit?: string): Promise<string | undefined> {
  const candidates: string[] = []
  if (explicit) candidates.push(explicit)
  const fromEnv = process.env.TUFF_WHISPER_BIN?.trim()
  if (fromEnv) candidates.push(fromEnv)
  for (const directory of (process.env.PATH ?? '').split(delimiter)) {
    if (directory) candidates.push(join(directory, 'whisper-cli'))
  }
  candidates.push('/opt/homebrew/bin/whisper-cli', '/usr/local/bin/whisper-cli')

  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK)
      return candidate
    }
    catch {
      continue
    }
  }
  return undefined
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
    return withDecodeLock(() => this.decodeOnce(audio, model, options))
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
        : await this.materializePcm(workDirectory, audio)
      const outputBase = join(workDirectory, 'result')
      const language = resolveLanguage(model, options)
      const primer = resolvePrimer(model, options, language)

      const startedAt = Date.now()
      await this.run(binary, buildWhisperArgs(model, audioPath, outputBase, options, language, primer), options)
      const elapsedMs = Date.now() - startedAt

      let payload: WhisperJsonPayload
      try {
        payload = JSON.parse(await readFile(`${outputBase}.json`, 'utf8')) as WhisperJsonPayload
      }
      catch (error) {
        throw new LocalEngineError('LOCAL_ENGINE_DECODE_FAILED', 'whisper-cli did not produce a readable result.', {
          cause: error,
        })
      }

      return toTranscriptionResult(payload, audio, elapsedMs, primer)
    }
    finally {
      await rm(workDirectory, { recursive: true, force: true })
    }
  }

  /** PCM arrives headerless; the CLI only reads containers, so wrap it before writing. */
  private async materializePcm(
    workDirectory: string,
    audio: Extract<LocalAudioInput, { kind: 'pcm' }>,
  ): Promise<string> {
    if (audio.sampleRate <= 0) {
      throw new LocalEngineError('LOCAL_ENGINE_AUDIO_INVALID', 'PCM sample rate must be positive.')
    }
    const format: WavFormat = { sampleRate: audio.sampleRate, channels: audio.channels, bitsPerSample: 16 }
    const path = join(workDirectory, 'input.wav')
    await writeFile(path, wrapPcmAsWav(audio.bytes, format))
    return path
  }

  /**
   * Run one decode to completion.
   *
   * Both cancellation paths are honoured: an abort signal from the caller, and a hard
   * deadline. Without the deadline a pathological input can pin a core indefinitely,
   * and dictation has no way to surface that to the user.
   */
  private async run(binary: string, args: readonly string[], options: LocalTranscribeOptions): Promise<void> {
    const timeoutMs = options.timeoutMs ?? this.options.timeoutMs ?? 120_000
    await new Promise<void>((settle, reject) => {
      const child = spawn(binary, [...args], { stdio: ['ignore', 'pipe', 'pipe'] })
      let stderr = ''
      child.stderr?.setEncoding('utf8')
      child.stderr?.on('data', (chunk: string) => {
        stderr += chunk
        if (stderr.length > 8_000) stderr = stderr.slice(-8_000)
      })

      let settled = false
      const finish = (error?: Error): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        options.signal?.removeEventListener('abort', onAbort)
        if (error) reject(error)
        else settle()
      }
      const onAbort = (): void => {
        child.kill('SIGKILL')
        finish(new LocalEngineError('LOCAL_ENGINE_ABORTED', 'Local transcription was cancelled.'))
      }
      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        finish(new LocalEngineError('LOCAL_ENGINE_TIMEOUT', `Local transcription exceeded ${timeoutMs} ms.`, {
          retryable: true,
        }))
      }, timeoutMs)

      if (options.signal?.aborted) {
        onAbort()
        return
      }
      options.signal?.addEventListener('abort', onAbort, { once: true })

      child.on('error', (error) => {
        finish(new LocalEngineError('LOCAL_ENGINE_SPAWN_FAILED', `Could not start whisper-cli: ${error.message}`, {
          cause: error,
        }))
      })
      child.on('close', (code) => {
        if (code === 0) finish()
        else finish(new LocalEngineError('LOCAL_ENGINE_DECODE_FAILED', `whisper-cli exited with code ${code}. ${stderr.trim()}`.trim(), {
          retryable: code === null,
        }))
      })
    })
  }
}

/** Argument vector for one decode. Kept separate so it can be asserted without spawning. */
export function buildWhisperArgs(
  model: ResolvedLocalModel,
  audioPath: string,
  outputBase: string,
  options: LocalTranscribeOptions,
  language = resolveLanguage(model, options),
  primer = resolvePrimer(model, options, language),
): string[] {
  const threads = options.threads ?? Math.max(1, Math.min(8, availableParallelism() - 1))

  const args = [
    '-m', model.weightsPath,
    '-f', audioPath,
    '-l', language,
    '-t', String(threads),
    '-oj',
    '-of', outputBase,
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
    if (!text) continue
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
