import type {
  IntelligenceMessageAttachment,
  IntelligencePartEvent,
  IntelligenceStreamChunk,
  IntelligenceUsageInfo
} from '@talex-touch/tuff-intelligence'
import type { ChildProcessByStdio } from 'node:child_process'
import type { Readable } from 'node:stream'
import type { Logger } from '../../../../utils/logger'
import { spawn } from 'node:child_process'
import { delimiter, dirname } from 'node:path'
import { createInterface } from 'node:readline'
import { spillAttachments } from '../attachment-spill'

/**
 * The part of a local-CLI chat turn that is the same for every CLI: spawn the child with a
 * usable environment, read its stdout line by line, keep the commit/rollback marks that decide
 * which streamed text is an answer, and — on every exit path — reap the child within a bounded
 * window and remove the files written for it. A provider supplies the argv, the line parser and
 * the names that appear in errors; nothing here knows any CLI's flags.
 *
 * Pulled out of the pi provider unchanged in behaviour; its tests are the oracle for this file.
 */

/** Enough stderr to identify a failure without letting a chatty run grow unbounded in memory. */
const STDERR_TAIL_LIMIT = 4_000
const CHILD_TERMINATION_GRACE_MS = 150
const CHILD_FORCE_KILL_TIMEOUT_MS = 750

/**
 * One stdout line in the vocabulary the runtime acts on. A parser maps its CLI's own event
 * shapes onto this and returns `null` for the many lines the chat surface has no use for.
 *
 * Applied in this order: `partEvents` (or `partEvent`), then `reset`, then `delta`, then
 * `commit` — so a protocol that delivers a message whole and settled in one line can say
 * `{ delta, commit: true }` and have the text committed after it is streamed.
 */
export interface CliLineEvent {
  /** Text to stream. A preview until the message it belongs to is committed. */
  delta?: string
  usage?: IntelligenceUsageInfo
  provider?: string
  model?: string
  /** The CLI's settled marker. Informational only: the run ends at stdout EOF, not here. */
  done?: boolean
  /** Structured reasoning/tool event extracted from the agent loop. */
  partEvent?: IntelligencePartEvent
  /** One wire line can settle a whole tool call — start and input together. */
  partEvents?: IntelligencePartEvent[]
  /** How the assistant message that just ended settled: `stop`, `error`, `aborted`, … */
  stopReason?: string
  /** Why the run failed, in the CLI's own words. Set by a failed message or a spent retry budget. */
  failure?: string
  /** Set when the CLI restarts the turn on its own, for the log line that records how often. */
  retry?: { attempt: number; maxAttempts: number; delayMs: number }
  /** Commit everything streamed so far, this event's `delta` included. */
  commit?: boolean
  /** Roll the preview back to the last commit before this event's `delta` is applied. */
  reset?: boolean
}

/**
 * The two stop reasons that mean the message carried no answer. `pi` deletes such a message from
 * its own agent state before retrying, so text streamed under one of these is provisional even
 * though it already reached stdout. Shared vocabulary: a parser for another CLI maps its own
 * failure signal onto `stopReason: 'error'` so the end-of-run decision below stays in one place.
 */
export function isFailedStopReason(stopReason: string | undefined): boolean {
  return stopReason === 'error' || stopReason === 'aborted'
}

export interface CliRunSpec {
  /** The CLI's short name as it reads in user-facing error text: `pi`, `omp`, … */
  name: string
  /** Prefix for thrown errors, naming the provider that owns the run: `[PiCliProvider]`. */
  errorPrefix: string
  /** Absolute path; resolved by the caller so a missing CLI fails before anything is written. */
  executable: string
  /**
   * Argument vector. A function receives the spilled attachment paths — empty when the turn
   * carried none — because where a CLI takes files is its own business (`@path` positionals for
   * pi, a flag for others) and the files only exist once the run has begun.
   */
  args: string[] | ((attachmentPaths: string[]) => string[])
  /** Extra environment on top of the inherited one. PATH is handled here. */
  env?: Readonly<Record<string, string>>
  parseLine: (line: string) => CliLineEvent | null
  /** Stable code for the bounded-termination failure, in both `error.code` and `error.message`. */
  terminationErrorCode: string
  logger: Logger
}

export interface CliRunOptions {
  readonly signal?: AbortSignal
  /** Attachments to write to disk for the child. They exist exactly as long as the run. */
  readonly attachments?: IntelligenceMessageAttachment[]
}

interface CliRunState {
  provider?: string
  model?: string
  usage?: IntelligenceUsageInfo
  /** How the most recent assistant message ended — the run's terminal state once stdout closes. */
  stopReason?: string
  /** The failure the CLI last reported, kept so a dead run can say why rather than just going quiet. */
  failure?: string
}

function resolveArgs(spec: CliRunSpec, attachmentPaths: string[]): string[] {
  return typeof spec.args === 'function' ? spec.args(attachmentPaths) : spec.args
}

/**
 * Runs one chat turn through a local CLI and streams its answer.
 *
 * Deltas are a preview until the CLI settles the message they belong to, so the run tracks two
 * marks: everything streamed and still standing, and the part of it the CLI committed. A retry
 * rolls the first back to the second; only the second counts as an answer.
 */
export async function* runCliChat(
  spec: CliRunSpec,
  options: CliRunOptions = {}
): AsyncGenerator<IntelligenceStreamChunk> {
  const { signal } = options
  if (signal?.aborted) return

  // Written before the spawn and removed in the `finally` below: the files exist only for the
  // length of this run, which is the whole window in which the child can read them.
  const attachments = await spillAttachments(options.attachments ?? [])
  if (signal?.aborted) {
    await attachments.cleanup()
    return
  }

  let child: ChildProcessByStdio<null, Readable, Readable>
  try {
    child = spawn(spec.executable, resolveArgs(spec, attachments.paths), {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        // These CLIs are `#!/usr/bin/env node` scripts and version managers keep `node` beside
        // them. A GUI launch inherits a PATH that contains neither, so without this the shebang
        // fails to resolve even though the binary itself was found by absolute path.
        PATH: [dirname(spec.executable), process.env.PATH].filter(Boolean).join(delimiter),
        ...spec.env
      }
    })
  } catch (error) {
    // A spawn that fails synchronously throws here, before the run's own cleanup path exists.
    await attachments.cleanup()
    throw error
  }

  const state: CliRunState = {}
  let streamedLength = 0
  let committedLength = 0
  let stderrTail = ''

  child.stderr.setEncoding('utf8')
  const onStderrData = (chunk: string): void => {
    stderrTail = (stderrTail + chunk).slice(-STDERR_TAIL_LIMIT)
  }
  child.stderr.on('data', onStderrData)

  const exited = new Promise<number | null>((resolve, reject) => {
    const onError = (error: Error): void => reject(error)
    child.on('error', onError)
    child.once('close', (code) => {
      child.removeListener('error', onError)
      resolve(code)
    })
  })
  // A consumer can return from the async generator before the normal `await exited` path. Keep
  // the rejection observed in that teardown path while preserving it for normal error propagation.
  void exited.catch(() => undefined)

  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity })
  const hasExited = (): boolean => child.exitCode !== null || child.signalCode !== null
  const waitForChildExit = (timeoutMs: number): Promise<boolean> => {
    if (hasExited()) return Promise.resolve(true)

    return new Promise<boolean>((resolve) => {
      const onExit = (): void => {
        child.removeListener('exit', onExit)
        clearTimeout(timer)
        resolve(true)
      }
      const timer = setTimeout(() => {
        child.removeListener('exit', onExit)
        resolve(hasExited())
      }, timeoutMs)
      child.once('exit', onExit)
      if (hasExited()) onExit()
    })
  }
  let termination: Promise<boolean> | null = null
  const terminateChild = (): Promise<boolean> => {
    if (termination) return termination
    termination = (async () => {
      if (hasExited()) return true
      try {
        child.kill('SIGTERM')
      } catch {
        // The exit event below is still the authoritative process state.
      }
      if (await waitForChildExit(CHILD_TERMINATION_GRACE_MS)) return true
      if (!hasExited()) {
        try {
          child.kill('SIGKILL')
        } catch {
          // Report the bounded failure after the final wait.
        }
      }
      return await waitForChildExit(CHILD_FORCE_KILL_TIMEOUT_MS)
    })()
    return termination
  }
  let resolveAbort: (() => void) | null = null
  const aborted = signal
    ? new Promise<undefined>((resolve) => {
        resolveAbort = () => resolve(undefined)
      })
    : null
  const onAbort = (): void => {
    resolveAbort?.()
    void terminateChild()
    // AsyncGenerator.return() cannot preempt a pending readline next(), so close both the
    // interface and its input here instead of waiting for the child exit event.
    lines.close()
    child.stdout.destroy()
  }
  signal?.addEventListener('abort', onAbort, { once: true })
  if (signal?.aborted) onAbort()

  const partChunk = (partEvent: IntelligencePartEvent): IntelligenceStreamChunk => {
    if (partEvent.kind === 'message-commit') committedLength = streamedLength
    else if (partEvent.kind === 'text-reset') streamedLength = committedLength
    return { delta: '', done: false, partEvent, provider: state.provider, model: state.model }
  }

  try {
    for await (const line of lines) {
      if (signal?.aborted) return
      const event = spec.parseLine(line)
      if (!event) continue

      if (event.provider) state.provider = event.provider
      if (event.model) state.model = event.model
      if (event.usage) state.usage = event.usage
      if (event.stopReason) state.stopReason = event.stopReason
      if (event.failure) state.failure = event.failure

      if (event.retry) {
        // The one record of how often the CLI retries behind the app's back — the diagnosis could
        // pin the mechanism but not the frequency.
        spec.logger.warn(
          `${spec.name} is retrying the turn; dropping the text the failed attempt streamed`,
          {
            meta: {
              attempt: event.retry.attempt,
              maxAttempts: event.retry.maxAttempts,
              delayMs: event.retry.delayMs
            }
          }
        )
      }

      const partEvents = event.partEvents ?? (event.partEvent ? [event.partEvent] : [])
      for (const partEvent of partEvents) yield partChunk(partEvent)
      if (event.reset) yield partChunk({ kind: 'text-reset' })

      if (event.delta) {
        streamedLength += event.delta.length
        yield {
          delta: event.delta,
          done: false,
          provider: state.provider,
          model: state.model
        }
      }

      if (event.commit) yield partChunk({ kind: 'message-commit' })
    }

    if (signal?.aborted) return
    const code = aborted ? await Promise.race([aborted, exited]) : await exited
    if (signal?.aborted) return
    if (code === undefined) return
    // `pi --mode json` exits 0 however the run went — the non-zero path exists only in text mode —
    // so the CLI's own terminal state is the only trustworthy failure signal. Text that was never
    // committed does not rescue the run: it belongs to an attempt the CLI discarded, which is
    // exactly the case that used to surface as an unexplained empty bubble.
    if (!committedLength && isFailedStopReason(state.stopReason)) {
      throw new Error(
        `${spec.errorPrefix} ${spec.name} ended the run without an answer: ${state.failure ?? state.stopReason}`
      )
    }

    // Deltas already reached the user, so a late non-zero exit must not discard them; the stream
    // closes on what did arrive instead of turning a partial answer into an error.
    if (code !== 0 && !streamedLength) {
      throw new Error(
        `${spec.errorPrefix} ${spec.name} exited with code ${code}${stderrTail.trim() ? `: ${stderrTail.trim()}` : ''}`
      )
    }

    yield {
      delta: '',
      done: true,
      provider: state.provider,
      model: state.model,
      ...(state.usage ? { usage: state.usage } : {})
    }
  } finally {
    signal?.removeEventListener('abort', onAbort)
    // Reached both on cancellation (the consumer breaks, which returns the generator) and on
    // failure. Without it a stopped turn leaves the CLI running and still billing.
    const childTerminated = await terminateChild()
    lines.close()
    child.stdout.destroy()
    child.stderr.removeListener('data', onStderrData)
    child.stderr.destroy()
    if (!childTerminated) {
      spec.logger.warn(`${spec.name} child did not exit after forced termination`)
      child.unref()
    }
    await attachments.cleanup()
    if (!childTerminated) {
      const error = new Error(spec.terminationErrorCode) as NodeJS.ErrnoException
      error.code = spec.terminationErrorCode
      // A live child can keep using tools and billing, so this teardown failure must override return().
      // eslint-disable-next-line no-unsafe-finally
      throw error
    }
  }
}
