import { realpathSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs, USAGE } from './run/args'
import type { CommandIo, ExitCode } from './run/commands'
import { describeFailure, executeCommand, exitCodeFor } from './run/commands'
import type { RunnerDeps } from './run/runner-deps'
import { defaultRunnerDeps } from './run/runner-deps'

export interface CliHooks {
  /** The command line as typed, without the node and script paths. */
  argv: readonly string[]
  log: (line: string) => void
  progress: (line: string) => void
  /** Aborted by the first SIGINT or SIGTERM. */
  signal: AbortSignal
}

export interface CliEnv {
  io: CommandIo
  createDeps: (hooks: CliHooks) => RunnerDeps
  setNice: (level: number) => void
  /** Registers the SIGINT/SIGTERM handler and returns the function that removes it again. */
  onSignal: (handler: (signal: string) => void) => () => void
}

/** Parses the command line, runs the command and returns the exit code; never throws. */
export async function main(argv: readonly string[], env: CliEnv): Promise<ExitCode> {
  const { io } = env
  if (argv.length === 0) {
    io.err(USAGE)
    return 2
  }
  let off: () => void = () => undefined
  try {
    const parsed = parseArgs(argv)
    if (parsed.command === 'help') {
      io.out(USAGE)
      return 0
    }
    const controller = new AbortController()
    if (parsed.command === 'run' || parsed.command === 'probe') {
      if (parsed.options.nice > 0) env.setNice(parsed.options.nice)
      const stopping = { asked: false }
      off = env.onSignal((name) => {
        if (stopping.asked) {
          io.err('already stopping; waiting for the app to shut down (it is never killed)')
          return
        }
        stopping.asked = true
        io.err(`${name}: finishing the scenarios in flight, then stopping the app cleanly`)
        controller.abort(name)
      })
    }
    const deps = env.createDeps({ argv, log: io.err, progress: io.err, signal: controller.signal })
    return await executeCommand(parsed, deps, io)
  } catch (error) {
    for (const line of describeFailure(error)) io.err(line)
    return exitCodeFor(error)
  } finally {
    off()
  }
}

function elapsedStamp(startedAt: number): (line: string) => string {
  return (line) => {
    const seconds = Math.floor((Date.now() - startedAt) / 1000)
    const clock = [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60]
      .map((part) => String(part).padStart(2, '0'))
      .join(':')
    return `[${clock}] ${line}`
  }
}

export function defaultEnv(): CliEnv {
  const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
  const stamp = elapsedStamp(Date.now())
  const io: CommandIo = {
    out: (line) => void process.stdout.write(`${line}\n`),
    err: (line) => void process.stderr.write(`${line}\n`)
  }
  return {
    io,
    createDeps: (hooks) =>
      defaultRunnerDeps({
        appDir,
        argv: hooks.argv,
        log: (line) => hooks.log(stamp(line)),
        progress: (line) => hooks.progress(stamp(line)),
        signal: hooks.signal
      }),
    setNice: (level) => {
      try {
        os.setPriority(0, level)
      } catch (error) {
        io.err(
          `warning: could not lower the runner's own priority to nice ${level}: ${(error as Error).message}`
        )
      }
    },
    onSignal: (handler) => {
      const listener = (signal: NodeJS.Signals): void => handler(signal)
      process.on('SIGINT', listener)
      process.on('SIGTERM', listener)
      return () => {
        process.off('SIGINT', listener)
        process.off('SIGTERM', listener)
      }
    }
  }
}

function isMainEntryFallback(): boolean {
  if (!process.argv[1]) return false
  const entryPath = path.resolve(process.argv[1])
  const modulePath = fileURLToPath(import.meta.url)
  if (entryPath === modulePath) return true
  try {
    return realpathSync(entryPath) === realpathSync(modulePath)
  } catch {
    return false
  }
}

async function execute(): Promise<void> {
  let code: number
  try {
    code = await main(process.argv.slice(2), defaultEnv())
  } catch (error) {
    process.stderr.write(
      `internal error: ${error instanceof Error ? error.message : String(error)}\n`
    )
    code = 3
  }
  await Promise.all(
    [process.stdout, process.stderr].map(
      (stream) => new Promise<void>((resolve) => stream.write('', () => resolve()))
    )
  )
  process.exit(code)
}

if (import.meta.main || isMainEntryFallback()) void execute()
