import type {
  ChildProcess,
  ExecFileOptions,
  SpawnOptionsWithoutStdio,
} from 'node:child_process'
import { hasWindow } from '../../env'

type ExecFileFn = typeof import('node:child_process').execFile
type SpawnFn = typeof import('node:child_process').spawn

const NULL_BYTE_PATTERN = /\0/
const NEWLINE_PATTERN = /[\r\n]/

const childProcess = (() => {
  if (hasWindow()) {
    return null
  }

  const nodeRequire = typeof require === 'function' ? require : null
  if (!nodeRequire) {
    return null
  }

  try {
    return nodeRequire('node:child_process') as typeof import('node:child_process')
  } catch {
    return null
  }
})()

const execFileImpl = childProcess?.execFile
const spawnImpl = childProcess?.spawn

function assertShellValue(value: string, label: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error(`${label}_EMPTY`)
  }
  if (NULL_BYTE_PATTERN.test(trimmed)) {
    throw new Error(`${label}_NULL_BYTE`)
  }
  if (NEWLINE_PATTERN.test(trimmed)) {
    throw new Error(`${label}_NEWLINE`)
  }
  return trimmed
}

function assertShellArg(value: string): string {
  if (NULL_BYTE_PATTERN.test(value)) {
    throw new Error('ARG_NULL_BYTE')
  }
  return value
}

function requireChildProcess(): {
  execFile: ExecFileFn
  spawn: SpawnFn
} {
  if (!execFileImpl || !spawnImpl) {
    throw new Error('CHILD_PROCESS_UNAVAILABLE')
  }

  return {
    execFile: execFileImpl,
    spawn: spawnImpl,
  }
}

export async function execFileSafe(
  command: string,
  args: string[] = [],
  options: ExecFileOptions = {}
): Promise<{ stdout: string; stderr: string }> {
  const { execFile } = requireChildProcess()
  const safeCommand = assertShellValue(command, 'COMMAND')
  const safeArgs = args.map(assertShellArg)

  return await new Promise((resolve, reject) => {
    execFile(
      safeCommand,
      safeArgs,
      {
        ...options,
        shell: false,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(error)
          return
        }
        resolve({ stdout, stderr })
      }
    )
  })
}

export function spawnSafe(
  command: string,
  args: string[] = [],
  options: SpawnOptionsWithoutStdio = {}
): ChildProcess {
  const { spawn } = requireChildProcess()
  const safeCommand = assertShellValue(command, 'COMMAND')
  const safeArgs = args.map(assertShellArg)
  return spawn(safeCommand, safeArgs, { ...options, shell: false })
}

export function spawnShellCommand(
  command: string,
  options: SpawnOptionsWithoutStdio = {}
): ChildProcess {
  const { spawn } = requireChildProcess()
  const safeCommand = assertShellValue(command, 'COMMAND')
  return spawn(safeCommand, [], { ...options, shell: true })
}
