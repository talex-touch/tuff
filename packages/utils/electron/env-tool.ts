import type { ExecException } from 'node:child_process'
import { platform } from 'node:process'
import { execFileSafe } from '../common/utils/safe-shell'

type ExecError = { error?: unknown }

export interface IGlobalPkgResult {
  exist: boolean
  error?: ExecException
  name?: string
  version?: string
}

export async function checkGlobalPackageExist(packageName: string): Promise<IGlobalPkgResult> {
  const name = packageName.trim()
  if (!name) {
    throw new Error('Package name is required')
  }

  try {
    const { stdout, stderr } = await execFileSafe('npm', ['list', '-g', name])
    if (stderr) {
      const stderrError = Object.assign(new Error('Failed to check global package'), {
        error: stderr
      })
      throw stderrError
    }

    const lines = stdout.split('\n')
    const lastLine = lines[lines.length - 3]
    const match = lastLine.match(/([^@\s]+)@(\S+)/)
    if (match) {
      return {
        exist: true,
        name: match[1],
        version: match[2]
      } as IGlobalPkgResult
    }

    return {
      exist: false
    } as IGlobalPkgResult
  } catch (error) {
    const execError = Object.assign(new Error('Failed to check global package'), {
      error: error as ExecError
    })
    return Promise.reject(execError)
  }
}

// Check npm version
export function getNpmVersion(): Promise<string | null> {
  return execFileSafe('npm', ['--version'])
    .then(({ stdout, stderr }) => {
      if (stderr) {
        return null
      }
      return stdout.trim()
    })
    .catch(() => null)
}

export interface OSAdapter<R, T> {
  win32?: (payload: R) => T
  darwin?: (payload: R) => T
  linux?: (payload: R) => T
  /**
   * Executed before platform-specific functions.
   * Its return value will be passed as a parameter to the platform-specific function.
   */
  onBeforeExecute?: () => R
}

/**
 * An adapter function that executes different logic depending on the operating system platform.
 * @param options An object containing implementations for different platforms.
 * @returns The execution result of the platform-specific function.
 */
export function withOSAdapter<R, T>(options: OSAdapter<R, T>): T | undefined {
  const payload = options.onBeforeExecute?.()

  const arg = payload as R

  switch (platform) {
    case 'win32':
      return options.win32?.(arg)
    case 'darwin':
      return options.darwin?.(arg)
    case 'linux':
      return options.linux?.(arg)
    default:
      return undefined
  }
}
