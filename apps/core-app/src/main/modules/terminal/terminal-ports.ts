import { constants } from 'node:fs'
import { access, stat } from 'node:fs/promises'
import { delimiter, dirname, join } from 'node:path'

export interface TerminalExecutablePort {
  findCommandInSearchRoots(command: string): Promise<string | null>
  withExecutableDirOnPath<T extends Record<string, string | undefined>>(
    env: T,
    executable: string
  ): T & { PATH: string }
}

export interface TerminalPorts {
  executable: TerminalExecutablePort
}

export interface TerminalPortsPatch {
  executable?: Partial<TerminalExecutablePort>
}

export function defaultWithExecutableDirOnPath<T extends Record<string, string | undefined>>(
  env: T,
  executable: string
): T & { PATH: string } {
  return { ...env, PATH: [dirname(executable), env.PATH].filter(Boolean).join(delimiter) }
}

function withPlatformExtensions(command: string): string[] {
  if (process.platform !== 'win32') return [command]
  const extensions = (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean)
  return extensions.map((extension) => `${command}${extension}`)
}

async function isExecutableFile(candidate: string): Promise<boolean> {
  try {
    if (!(await stat(candidate)).isFile()) return false
    await access(candidate, process.platform === 'win32' ? constants.F_OK : constants.X_OK)
    return true
  } catch {
    return false
  }
}

export async function defaultFindCommandInSearchRoots(command: string): Promise<string | null> {
  const directories = (process.env.PATH || '').split(delimiter).filter(Boolean)
  const names = withPlatformExtensions(command)
  for (const directory of directories) {
    for (const name of names) {
      const candidate = join(directory, name)
      if (await isExecutableFile(candidate)) {
        return candidate
      }
    }
  }
  return null
}

function createDefaultTerminalPorts(): TerminalPorts {
  return {
    executable: {
      findCommandInSearchRoots: defaultFindCommandInSearchRoots,
      withExecutableDirOnPath: defaultWithExecutableDirOnPath
    }
  }
}

let activeTerminalPorts: TerminalPorts = createDefaultTerminalPorts()

export function getTerminalPorts(): Readonly<TerminalPorts> {
  return activeTerminalPorts
}

export function registerTerminalPorts(patch: TerminalPortsPatch): () => void {
  const previous = activeTerminalPorts
  const next: TerminalPorts = {
    executable: { ...previous.executable, ...patch.executable }
  }
  activeTerminalPorts = next
  return () => {
    if (activeTerminalPorts === next) {
      activeTerminalPorts = previous
    }
  }
}

export function resetTerminalPorts(): void {
  activeTerminalPorts = createDefaultTerminalPorts()
}
