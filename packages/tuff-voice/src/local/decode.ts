import type { LocalAudioInput } from './types'
import type { WavFormat } from './wav'
import { spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { access, writeFile } from 'node:fs/promises'
import { delimiter, join } from 'node:path'
import process from 'node:process'
import { LocalEngineError } from './types'
import { wrapPcmAsWav } from './wav'

/**
 * Running one local decode, shared by every engine in this package.
 *
 * The engines attach different flags and parse different output, but the part that must not
 * diverge is the lifecycle: a decode is bounded by a deadline, cancelled by the caller's
 * signal, and reports the child's exit code with the tail of its stderr. Two copies of that
 * logic drift, and the drift surfaces as a decode that hangs rather than as a failing test.
 */

/**
 * One decode at a time, host-wide.
 *
 * A decode saturates the machine on its own, and letting decodes overlap is catastrophically
 * slower than queueing them. Measured on an M4 Pro, 3.44 s of audio with ggml-base: a single
 * decode takes 0.40 s; three running concurrently take 10.05 s in total, roughly 3.3 s each —
 * an eightfold loss per decode. Since a stream naturally issues a speculative partial and then
 * a final for the same audio, overlap is the common case rather than an edge case, so the queue
 * lives here at module scope instead of per engine instance: two models sharing a host contend
 * just as badly, and that holds across engines too — whisper.cpp saturates the GPU while
 * sherpa-onnx saturates the CPU, and neither is helped by the other running at the same time.
 */
let decodeQueue: Promise<unknown> = Promise.resolve()

export function withDecodeLock<T>(task: () => Promise<T>): Promise<T> {
  const queued = decodeQueue.then(task, task)
  // The queue must keep draining after a failure, so the stored link swallows the
  // rejection; the caller still receives it through `queued`.
  decodeQueue = queued.then(
    () => undefined,
    () => undefined,
  )
  return queued
}

export interface LocalProcessResult {
  stdout: string
  stderr: string
}

export interface LocalProcessOptions {
  /** Wall-clock ceiling for one decode; past it the child is killed and the call fails. */
  timeoutMs: number
  signal?: AbortSignal
  /** Named in the error messages so a failure says which executable misbehaved. */
  label: string
  /** Retained tail of stderr: the head is a banner, the tail names the real failure. */
  stderrLimit?: number
}

/**
 * Run one decode to completion and hand back what it wrote.
 *
 * Both cancellation paths are honoured: an abort signal from the caller, and a hard deadline.
 * Without the deadline a pathological input can pin a core indefinitely, and dictation has no
 * way to surface that to the user.
 *
 * stdout is drained rather than left on a full pipe: a recognizer prints a JSON line per input
 * file, and a child blocked writing into an unread pipe would never reach its exit.
 */
export function runLocalProcess(
  binary: string,
  args: readonly string[],
  options: LocalProcessOptions,
): Promise<LocalProcessResult> {
  const stderrLimit = options.stderrLimit ?? 8_000
  return new Promise<LocalProcessResult>((settle, reject) => {
    const child = spawn(binary, [...args], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''

    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => {
      stdout += chunk
    })
    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk
      if (stderr.length > stderrLimit)
        stderr = stderr.slice(-stderrLimit)
    })

    let settled = false
    let timer: NodeJS.Timeout | undefined
    let onAbort: (() => void) | undefined
    const finish = (error?: Error): void => {
      if (settled)
        return
      settled = true
      clearTimeout(timer)
      if (onAbort)
        options.signal?.removeEventListener('abort', onAbort)
      if (error)
        reject(error)
      else settle({ stdout, stderr })
    }
    onAbort = (): void => {
      child.kill('SIGKILL')
      finish(new LocalEngineError('LOCAL_ENGINE_ABORTED', 'Local transcription was cancelled.'))
    }
    timer = setTimeout(() => {
      child.kill('SIGKILL')
      finish(new LocalEngineError('LOCAL_ENGINE_TIMEOUT', `Local transcription exceeded ${options.timeoutMs} ms.`, {
        retryable: true,
      }))
    }, options.timeoutMs)
    if (options.signal?.aborted) {
      onAbort()
      return
    }
    options.signal?.addEventListener('abort', onAbort, { once: true })

    child.on('error', (error) => {
      finish(new LocalEngineError('LOCAL_ENGINE_SPAWN_FAILED', `Could not start ${options.label}: ${error.message}`, {
        cause: error,
      }))
    })
    // 'close' fires only after the child has exited and its stdio is finished, so the decode
    // lock the caller releases on settle is never released while a child is still running.
    child.on('close', (code) => {
      if (code === 0) {
        finish()
      }
      else {
        finish(new LocalEngineError('LOCAL_ENGINE_DECODE_FAILED', `${options.label} exited with code ${code}. ${stderr.trim()}`.trim(), {
          retryable: code === null,
        }))
      }
    })
  })
}

/** PCM arrives headerless; every supported CLI reads containers, so wrap it before writing. */
export async function materializePcmInput(
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
 * Where a decode executable may live, in the order it is trusted.
 *
 * An explicit path is honoured first so a caller can pin a known-good build, then the engine's
 * environment override, then PATH, then the two Homebrew prefixes. Nothing here shells out to
 * `which`: the runtime already knows the candidate set and can test it directly.
 */
export function executableCandidates(binaryName: string, explicit?: string, fromEnv?: string): string[] {
  const candidates: string[] = []
  if (explicit)
    candidates.push(explicit)
  if (fromEnv)
    candidates.push(fromEnv)
  for (const directory of (process.env.PATH ?? '').split(delimiter)) {
    if (directory)
      candidates.push(join(directory, binaryName))
  }
  candidates.push(`/opt/homebrew/bin/${binaryName}`, `/usr/local/bin/${binaryName}`)
  return candidates
}

/** First candidate that is actually executable, or undefined when none is. */
export async function findExecutable(candidates: readonly string[]): Promise<string | undefined> {
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
