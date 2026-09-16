/**
 * On-device speech engines.
 *
 * The other adapters in this package talk to a service: a credential, an endpoint,
 * a socket, a request id. These talk to a process on this machine. There is no
 * credential and no endpoint here — only a model bundle on disk, a binary able to
 * execute it, and the audio the user just spoke. Everything that a remote provider
 * gets from the network has to be supplied locally instead, which is why the
 * descriptor carries the facts the runtime would otherwise discover at runtime:
 * which engine executes the weights, what the weights are expected to hash to, and
 * which systematic defects of the model the caller must compensate for.
 */

/**
 * Engine that executes the weights. Tuff dispatches on this value, so it is a
 * closed set rather than a free string.
 */
export type LocalEngineId = 'whisper-cpp' | 'sherpa-onnx' | 'onnxruntime'

/** Weight container format, independent of the engine that happens to load it. */
export type LocalWeightKind = 'ggml' | 'onnx' | 'tflite' | 'openvino'

/** Extra file shipped alongside the weights. */
export type LocalAuxiliaryRole = 'vad' | 'dict' | 'hotwords' | 'tokenizer' | 'punctuation'

export interface LocalModelAuxiliaryFile {
  role: LocalAuxiliaryRole
  file: string
  bytes: number
  sha256: string
}

export interface LocalModelRuntime {
  kind: LocalWeightKind
  /** Path relative to the version directory. Never absolute. */
  file: string
  bytes: number
  sha256: string
}

/**
 * What the model itself is expected to do, and what it gets wrong.
 *
 * `requiresSimplifiedConversion` is not decoration. Whisper's zh output is
 * Traditional by default — verified on this project: 今天天气很好… comes back as
 * 今天天氣很好…. A mainland user typing Simplified sees that as a defect, so the
 * engine has to neutralise it before the text reaches the caller.
 */
export interface LocalModelTextPolicy {
  script?: 'unknown' | 'simplified' | 'traditional' | 'mixed'
  requiresSimplifiedConversion?: boolean
  punctuationPolicy?: 'model' | 'strip' | 'runtime'
}

export interface LocalModelCapabilities {
  stream: boolean
  upload: boolean
  timestamps?: boolean
  punctuation?: boolean
  itn?: boolean
}

export interface LocalModelSource {
  provider?: string
  repo?: string
  url?: string
  upstreamVersion?: string
  derivedFrom?: string
}

export interface LocalModelLicense {
  spdx: string
  redistributable: boolean
  noticePath?: string
}

export interface LocalModelBenchmark {
  host?: string
  dataset?: string
  sampleCount?: number
  cer?: number
  rtf?: number
  notes?: string
}

/** One immutable model version, mirroring `schema/model.schema.json`. */
export interface LocalModelDescriptor {
  schemaVersion: 1
  id: string
  version: string
  name: string
  description?: string
  engine: LocalEngineId
  engineMinVersion?: string
  languages: readonly string[]
  defaultLanguage?: string
  runtime: LocalModelRuntime
  auxiliary?: readonly LocalModelAuxiliaryFile[]
  quantization?: string
  capabilities: LocalModelCapabilities
  text?: LocalModelTextPolicy
  source?: LocalModelSource
  license: LocalModelLicense
  benchmark?: LocalModelBenchmark
}

/** A descriptor together with the directory that holds its weights. */
export interface ResolvedLocalModel {
  descriptor: LocalModelDescriptor
  directory: string
  /** Absolute path to the primary weight file. */
  weightsPath: string
}

/** Why an engine cannot run right now. Absent means it can. */
export interface LocalEngineUnavailability {
  code:
    | 'LOCAL_ENGINE_BINARY_MISSING'
    | 'LOCAL_ENGINE_MODEL_MISSING'
    | 'LOCAL_ENGINE_MODEL_UNVERIFIED'
    | 'LOCAL_ENGINE_MODEL_INTEGRITY_FAILED'
    | 'LOCAL_ENGINE_UNSUPPORTED_HOST'
  message: string
}

export interface LocalEngineAvailability {
  available: boolean
  /** Absolute path to the executable that would be used, when one was found. */
  binaryPath?: string
  model?: ResolvedLocalModel
  reason?: LocalEngineUnavailability
}

export interface LocalTranscribeOptions {
  language?: string
  /**
   * Request segment timestamps. Defaults to true.
   *
   * Setting it false is not cosmetic for every engine: whisper.cpp's decoder emits timestamp
   * tokens, so disabling them changes the transcript itself, not just whether offsets come back.
   */
  timestamps?: boolean
  /** Biases decoding toward Simplified Chinese when the model's native script is Traditional. */
  preferSimplifiedChinese?: boolean
  /** Engine threads. Defaults to a value derived from the host. */
  threads?: number
  signal?: AbortSignal
  timeoutMs?: number
  /** Leading text that the user has already committed; engines may use it as decode context. */
  initialText?: string
}

export interface LocalTranscribeSegment {
  text: string
  startMs: number
  endMs: number
}

export interface LocalTranscribeResult {
  text: string
  segments?: readonly LocalTranscribeSegment[]
  language?: string
  durationMs?: number
  /** Wall-clock cost of the decode, for the caller's own telemetry. */
  elapsedMs?: number
}

/**
 * Audio handed to an engine.
 *
 * `pcm` is what a live microphone delivers; `file` is what an upload or a saved
 * recording delivers. Keeping both here means an engine that can only decode files
 * does not have to pretend it accepts streaming input.
 */
export type LocalAudioInput
  = | { kind: 'pcm', bytes: Uint8Array, sampleRate: number, channels: 1 | 2 }
    | { kind: 'file', path: string }

/** A process-local speech engine. Implementations are stateless between calls. */
export interface LocalAsrEngine {
  readonly id: LocalEngineId
  /**
   * Report whether this engine can run, without throwing, so the UI can explain a
   * missing binary or an uninstalled model instead of surfacing a decode failure.
   */
  checkAvailability: (model: ResolvedLocalModel, binaryPath?: string) => Promise<LocalEngineAvailability>
  transcribe: (
    audio: LocalAudioInput,
    model: ResolvedLocalModel,
    options?: LocalTranscribeOptions,
  ) => Promise<LocalTranscribeResult>
}

/** Thrown for every engine failure so callers never have to interpret a raw spawn error. */
export class LocalEngineError extends Error {
  readonly code: string
  readonly retryable: boolean

  constructor(code: string, message: string, options: { retryable?: boolean, cause?: unknown } = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'LocalEngineError'
    this.code = code
    this.retryable = options.retryable ?? false
  }
}
