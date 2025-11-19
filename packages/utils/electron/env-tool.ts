import type { ExecException } from 'node:child_process'
import { exec } from 'node:child_process'
import { platform } from 'node:process'

export interface IGlobalPkgResult {
  exist: boolean
  error?: ExecException
  name?: string
  version?: string
}

export function checkGlobalPackageExist(packageName: string): Promise<IGlobalPkgResult> {
  return new Promise((resolve, reject) => {
    exec(`npm list -g ${packageName}`, (error, stdout, stderr) => {
      if (error) {
        reject({
          exits: false,
          error,
        })
        return
      }
      if (stderr) {
        reject({
          exits: false,
          error: stderr,
        })
        return
      }

      const lines = stdout.split('\n')
      const lastLine = lines[lines.length - 3]
      const match = lastLine.match(/(\S+)@(\S+)/)
      if (match) {
        resolve({
          exist: true,
          name: match[1],
          version: match[2],
        } as IGlobalPkgResult)
        return
      }

      resolve({
        exist: false,
      } as IGlobalPkgResult)
    })
  })
}

// Check npm version
export function getNpmVersion(): Promise<string | null> {
  return new Promise((resolve) => {
    exec(`npm --version`, (error, stdout, stderr) => {
      if (error || stderr)
        resolve(null)

      resolve(stdout.trim())
    })
  })
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
