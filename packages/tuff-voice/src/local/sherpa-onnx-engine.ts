import type {
  LocalAsrEngine,
  LocalAudioInput,
  LocalEngineAvailability,
  LocalTranscribeOptions,
  LocalTranscribeResult,
  ResolvedLocalModel,
} from './types'
import { constants } from 'node:fs'
import { access, mkdtemp } from 'node:fs/promises'
import { availableParallelism, tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { discardWorkDirectory, executableCandidates, findExecutable, materializePcmInput, runLocalProcess, withDecodeLock } from './decode'
import { resolveAuxiliaryPath } from './model-store'
import { LocalEngineError } from './types'
import { pcmDurationMs } from './wav'

/**
 * sherpa-onnx as a decode backend.
 *
 * Where whisper.cpp is one multilingual model with one flag set, sherpa-onnx is a runtime that
 * hosts several unrelated model families, each with its own recognizer constructor and its own
 * flags. The descriptor therefore names the family (`sherpa.family`) and Tuff builds the flag
 * set from it: handing SenseVoice weights to `--paraformer` would not fail politely, it would
 * construct the wrong recognizer.
 *
 * This is the fast tier of the dictation pipeline. SenseVoice is non-autoregressive, so it
 * decodes an utterance in one step and cannot loop on silence the way a token-by-token decoder
 * can; it also emits its own punctuation and inverse text normalisation. Measured on this
 * machine through this exact CLI: ~60 ms for 4.2 s of Mandarin, RTF 0.014, CER 0 against the
 * AISHELL-1 reference.
 */

const SHERPA_BINARY = 'sherpa-onnx-offline'

/**
 * Languages the SenseVoice recognizer accepts.
 *
 * The descriptor's language tags are BCP-47-ish while the CLI takes its own closed set, so an
 * unrecognised tag is not passed through as-is: `auto` lets the model detect the language, which
 * is strictly better than a flag value the CLI would reject.
 */
const SENSE_VOICE_LANGUAGES: ReadonlySet<string> = new Set(['auto', 'zh', 'en', 'ko', 'ja', 'yue'])

/** Overrides for the executable, for a host that keeps it outside PATH. */
export interface SherpaOnnxEngineOptions {
  binaryPath?: string
  threads?: number
  timeoutMs?: number
}

/** Locate a usable sherpa-onnx CLI. */
export async function findSherpaBinary(explicit?: string): Promise<string | undefined> {
  return findExecutable(
    executableCandidates(SHERPA_BINARY, explicit, process.env.TUFF_SHERPA_BIN?.trim()),
  )
}

/** Language to hand the recognizer, narrowed to the values it accepts. */
export function resolveSherpaLanguage(model: ResolvedLocalModel, options: LocalTranscribeOptions): string {
  const descriptor = model.descriptor
  const requested = (options.language ?? descriptor.defaultLanguage ?? descriptor.languages[0] ?? 'auto').toLowerCase()
  const primary = requested.split(/[-_]/)[0] ?? ''
  return SENSE_VOICE_LANGUAGES.has(primary) ? primary : 'auto'
}

/**
 * Argument vector for one decode. Kept separate so it can be asserted without spawning.
 *
 * Inverse text normalisation is driven by the descriptor's own `capabilities.itn` rather than a
 * caller preference: a bundle that declares the capability is a bundle whose text is meant to
 * arrive with digits in it, and the polish stage downstream is a rewrite, not the place the
 * difference between "十五" and "15" should be decided.
 */
export function buildSherpaArgs(
  model: ResolvedLocalModel,
  audioPath: string,
  options: LocalTranscribeOptions,
  language = resolveSherpaLanguage(model, options),
): string[] {
  const family = model.descriptor.sherpa?.family
  if (family !== 'sense-voice') {
    throw new LocalEngineError(
      'LOCAL_ENGINE_UNSUPPORTED_MODEL',
      `This build cannot drive the sherpa-onnx family ${String(family)}.`,
    )
  }

  const tokens = resolveAuxiliaryPath(model, 'tokenizer')
  if (!tokens) {
    throw new LocalEngineError(
      'LOCAL_ENGINE_MODEL_DESCRIPTOR_INVALID',
      `${model.descriptor.id} declares no tokenizer file, which sense-voice requires.`,
    )
  }

  const threads = options.threads ?? Math.max(1, Math.min(8, availableParallelism() - 1))
  const args = [
    `--sense-voice-model=${model.weightsPath}`,
    `--tokens=${tokens}`,
    `--num-threads=${threads}`,
    `--sense-voice-language=${language}`,
    '--debug=0',
  ]
  if (model.descriptor.capabilities.itn === true)
    args.push('--sense-voice-use-itn=1')
  args.push(audioPath)
  return args
}

/** Shape of one result line, limited to what the runtime consumes. */
interface SherpaJsonResult {
  text?: unknown
  lang?: unknown
}

/** `<|zh|>` is the model's language token; the runtime speaks plain tags. */
function normalizeLanguageTag(value: unknown): string | undefined {
  if (typeof value !== 'string')
    return undefined
  const tag = value.trim()
  if (!tag)
    return undefined
  const match = /^<\|(.+)\|>$/.exec(tag)
  return (match?.[1] ?? tag).toLowerCase()
}

/**
 * Pull the transcript out of the CLI's stdout.
 *
 * The CLI writes one JSON object per input file, delimited by the file's own path line and a
 * `----` separator, followed by a human-readable summary. Only the recognition line is JSON, so
 * the parse is anchored on that rather than on line positions, which the CLI's banner and
 * summary would otherwise shift.
 *
 * An object with an empty `text` is a valid silence result, not a missing one: SenseVoice is
 * non-autoregressive and reports nothing for nothing, which is exactly the behaviour dictation
 * wants. Returning `undefined` is therefore reserved for "no result line at all".
 */
export function pickTranscript(stdout: string): { text: string, language?: string } | undefined {
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('{'))
      continue
    let payload: SherpaJsonResult
    try {
      payload = JSON.parse(trimmed) as SherpaJsonResult
    }
    catch {
      continue
    }
    if (typeof payload.text !== 'string')
      continue
    const language = normalizeLanguageTag(payload.lang)
    return {
      text: payload.text.trim(),
      ...(language ? { language } : {}),
    }
  }
  return undefined
}

export class SherpaOnnxLocalEngine implements LocalAsrEngine {
  readonly id = 'sherpa-onnx' as const

  private readonly options: SherpaOnnxEngineOptions

  constructor(options: SherpaOnnxEngineOptions = {}) {
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
    const binary = await findSherpaBinary(binaryPath ?? this.options.binaryPath)
    if (!binary) {
      return {
        available: false,
        reason: {
          code: 'LOCAL_ENGINE_BINARY_MISSING',
          message: 'sherpa-onnx-offline was not found. Install sherpa-onnx or set TUFF_SHERPA_BIN.',
        },
      }
    }

    // The tokenizer is as load-bearing as the weights: the recognizer cannot map its own output
    // without it. A bundle that ships none is unavailable here rather than at decode time, and a
    // descriptor whose auxiliary path escapes its bundle is the same answer — a structured
    // unavailability, not a thrown error, because this method's whole job is to not throw.
    let tokenizer: string | undefined
    try {
      tokenizer = resolveAuxiliaryPath(model, 'tokenizer')
    }
    catch {
      return {
        available: false,
        binaryPath: binary,
        model,
        reason: {
          code: 'LOCAL_ENGINE_MODEL_DESCRIPTOR_INVALID',
          message: `${model.descriptor.id} declares an auxiliary file outside its own bundle.`,
        },
      }
    }
    if (!tokenizer) {
      return {
        available: false,
        binaryPath: binary,
        model,
        reason: {
          code: 'LOCAL_ENGINE_MODEL_DESCRIPTOR_INVALID',
          message: `${model.descriptor.id} declares no tokenizer file, which sense-voice requires.`,
        },
      }
    }

    for (const path of [model.weightsPath, tokenizer]) {
      try {
        await access(path, constants.R_OK)
      }
      catch {
        return {
          available: false,
          binaryPath: binary,
          model,
          reason: {
            code: 'LOCAL_ENGINE_MODEL_MISSING',
            message: `Model files are missing at ${path}.`,
          },
        }
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
    const binary = await findSherpaBinary(this.options.binaryPath)
    if (!binary) {
      throw new LocalEngineError('LOCAL_ENGINE_BINARY_MISSING', 'sherpa-onnx-offline was not found in PATH.', {
        retryable: false,
      })
    }

    const workDirectory = await mkdtemp(join(tmpdir(), 'tuff-sherpa-'))
    try {
      const audioPath = audio.kind === 'file'
        ? audio.path
        : await materializePcmInput(workDirectory, audio)

      const timeoutMs = options.timeoutMs ?? this.options.timeoutMs ?? 120_000
      const startedAt = Date.now()
      const { stdout } = await runLocalProcess(binary, buildSherpaArgs(model, audioPath, options), {
        timeoutMs,
        label: SHERPA_BINARY,
        ...(options.signal ? { signal: options.signal } : {}),
      })
      const elapsedMs = Date.now() - startedAt

      const parsed = pickTranscript(stdout)
      if (!parsed) {
        throw new LocalEngineError(
          'LOCAL_ENGINE_DECODE_FAILED',
          'sherpa-onnx-offline exited successfully but produced no result line.',
        )
      }

      // The CLI decodes the whole file as one utterance and reports per-token times, which is
      // not the segmentation the result contract describes; only a PCM capture has an exact
      // duration the runtime can state on its own.
      const durationMs = audio.kind === 'pcm'
        ? pcmDurationMs(audio.bytes.byteLength, { sampleRate: audio.sampleRate, channels: audio.channels, bitsPerSample: 16 })
        : undefined

      return {
        text: parsed.text,
        ...(parsed.language ? { language: parsed.language } : {}),
        ...(durationMs === undefined ? {} : { durationMs }),
        elapsedMs,
      }
    }
    finally {
      await discardWorkDirectory(workDirectory)
    }
  }
}
