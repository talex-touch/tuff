import type { SherpaOnnxEngineOptions } from './sherpa-onnx-engine'
import type { LocalAsrEngine, LocalEngineId, ResolvedLocalModel } from './types'
import type { WhisperCppEngineOptions } from './whisper-cpp-engine'
import { SherpaOnnxLocalEngine } from './sherpa-onnx-engine'
import { LocalEngineError } from './types'
import { WhisperCppLocalEngine } from './whisper-cpp-engine'

/** Options passed through to whichever engine the descriptor names. */
export interface LocalEngineFactoryOptions {
  /** Explicit executable override, when the host keeps it outside PATH. */
  binaryPath?: string
  threads?: number
  timeoutMs?: number
}

/**
 * Shared shape of the per-engine option bags, so one host setting reaches either engine.
 *
 * `binaryPath` is deliberately not shared: the two engines run different executables, so a
 * single override would be ambiguous.
 */
function commonEngineOptions(options: LocalEngineFactoryOptions): { threads?: number, timeoutMs?: number } {
  return {
    ...(options.threads === undefined ? {} : { threads: options.threads }),
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
  }
}

/**
 * Dispatch on the descriptor's engine field.
 *
 * A descriptor is a promise about a specific runtime, so an unknown or unimplemented
 * engine has to fail loudly rather than fall back to a different one: running ggml
 * weights through an ONNX session, or vice versa, produces nonsense instead of an error.
 */
export function createLocalEngine(engineId: LocalEngineId, options: LocalEngineFactoryOptions = {}): LocalAsrEngine {
  switch (engineId) {
    case 'whisper-cpp': {
      const engineOptions: WhisperCppEngineOptions = {
        ...(options.binaryPath === undefined ? {} : { binaryPath: options.binaryPath }),
        ...commonEngineOptions(options),
      }
      return new WhisperCppLocalEngine(engineOptions)
    }
    case 'sherpa-onnx': {
      const engineOptions: SherpaOnnxEngineOptions = {
        ...(options.binaryPath === undefined ? {} : { binaryPath: options.binaryPath }),
        ...commonEngineOptions(options),
      }
      return new SherpaOnnxLocalEngine(engineOptions)
    }
    case 'onnxruntime':
      throw new LocalEngineError(
        'LOCAL_ENGINE_NOT_IMPLEMENTED',
        `The "${engineId}" engine is declared by this model but is not implemented in this build.`,
      )
  }
}

/** Engine for one resolved model, honouring an explicit override for tests and benchmarks. */
export function resolveModelEngine(
  model: ResolvedLocalModel,
  options: LocalEngineFactoryOptions & { engine?: LocalAsrEngine } = {},
): LocalAsrEngine {
  return options.engine ?? createLocalEngine(model.descriptor.engine, options)
}
