import { describe, expect, it, vi } from 'vitest'
import {
  getDirectoryTerminals,
  openDirectoryInTerminal,
  resolvePreferredTerminal,
  revealPathInFileManager,
  type DirectoryTerminal,
  type DirectoryTerminalStats
} from './directory-terminal'

function directoryStats(): DirectoryTerminalStats {
  return { isDirectory: () => true, isFile: () => false }
}

function fileStats(): DirectoryTerminalStats {
  return { isDirectory: () => false, isFile: () => true }
}

function macTerminal(overrides: Partial<DirectoryTerminal> = {}): DirectoryTerminal {
  return {
    id: 'ghostty',
    name: 'Ghostty',
    target: '/Applications/Ghostty.app',
    kind: 'mac-bundle',
    source: 'installed',
    ...overrides
  }
}

/** A stat fake that reports `directories` as folders and everything else as missing. */
function statReporting(directories: readonly string[]) {
  return vi.fn(async (target: string): Promise<DirectoryTerminalStats> => {
    if (directories.includes(target)) return directoryStats()
    throw new Error(`ENOENT: ${target}`)
  })
}

describe('openDirectoryInTerminal', () => {
  it('hands a hostile directory name to LaunchServices as one argv entry, never a shell string', async () => {
    const dirPath = '/Users/x/My Folder; rm -rf ~ $(echo pwned) `id`'
    const calls: Array<[string, readonly string[]]> = []
    const spawnFile = vi.fn()

    const opened = await openDirectoryInTerminal(macTerminal(), dirPath, {
      stat: async () => directoryStats(),
      runFile: async (file, args) => {
        calls.push([file, args])
      },
      spawnFile
    })

    expect(opened).toBe(true)
    expect(calls).toEqual([['/usr/bin/open', ['-a', '/Applications/Ghostty.app', dirPath]]])
    expect(spawnFile).not.toHaveBeenCalled()
  })

  it('refuses a directory that is gone or is a plain file before launching anything', async () => {
    const runFile = vi.fn()
    const spawnFile = vi.fn()
    const missing = await openDirectoryInTerminal(macTerminal(), '/Users/x/vanished', {
      stat: async () => {
        throw new Error('ENOENT')
      },
      runFile,
      spawnFile
    })
    const plainFile = await openDirectoryInTerminal(macTerminal(), '/Users/x/notes.md', {
      stat: async () => fileStats(),
      runFile,
      spawnFile
    })

    expect(missing).toBe(false)
    expect(plainFile).toBe(false)
    expect(runFile).not.toHaveBeenCalled()
    expect(spawnFile).not.toHaveBeenCalled()
  })

  it('does not launch a terminal that has been uninstalled since it was listed', async () => {
    const runFile = vi.fn()
    const spawnFile = vi.fn()
    const missingTerminal = macTerminal({ target: '/Applications/Ghostty.app' })
    const directoryPath = '/tmp/dir'

    const opened = await openDirectoryInTerminal(missingTerminal, directoryPath, {
      // The directory is still there; only the terminal bundle is gone.
      stat: async (target) => {
        if (target === directoryPath) return directoryStats()
        throw new Error('ENOENT')
      },
      runFile,
      spawnFile
    })

    expect(opened).toBe(false)
    expect(runFile).not.toHaveBeenCalled()
    expect(spawnFile).not.toHaveBeenCalled()
  })

  it('uses the child working directory on Windows instead of interpolating the path into arguments', async () => {
    const dirPath = 'C:\\Users\\x\\My Folder & calc'
    const wtTarget = 'C:\\Users\\x\\AppData\\Local\\Microsoft\\WindowsApps\\wt.exe'
    const cmdTarget = 'C:\\Windows\\System32\\cmd.exe'
    const spawnFile = vi.fn(async () => undefined)
    const stat = vi.fn(async (target: string): Promise<DirectoryTerminalStats> => {
      if (target === dirPath) return directoryStats()
      if (target === wtTarget || target === cmdTarget) return fileStats()
      throw new Error(`ENOENT: ${target}`)
    })
    const wt: DirectoryTerminal = {
      id: 'windows-terminal',
      name: 'Windows Terminal',
      target: wtTarget,
      kind: 'win-exe',
      source: 'installed'
    }
    const cmd: DirectoryTerminal = {
      id: 'cmd',
      name: 'Command Prompt',
      target: cmdTarget,
      kind: 'win-exe',
      source: 'system-default'
    }

    const wtOpened = await openDirectoryInTerminal(wt, dirPath, { stat, spawnFile })
    const cmdOpened = await openDirectoryInTerminal(cmd, dirPath, { stat, spawnFile })

    expect(wtOpened).toBe(true)
    expect(cmdOpened).toBe(true)
    expect(spawnFile).toHaveBeenNthCalledWith(1, wtTarget, ['-d', dirPath], { cwd: dirPath })
    expect(spawnFile).toHaveBeenNthCalledWith(2, cmdTarget, [], { cwd: dirPath })
  })

  it('reports a refused spawn as a failure rather than a completed open', async () => {
    const dirPath = 'C:\\Users\\x\\folder'
    const wtTarget = 'C:\\Program Files\\WindowsApps\\wt.exe'
    const stat = vi.fn(async (target: string): Promise<DirectoryTerminalStats> => {
      if (target === dirPath) return directoryStats()
      if (target === wtTarget) return fileStats()
      throw new Error(`ENOENT: ${target}`)
    })
    const spawnFile = vi.fn(async () => {
      throw new Error('ENOENT: spawn wt.exe')
    })

    const opened = await openDirectoryInTerminal(
      {
        id: 'windows-terminal',
        name: 'Windows Terminal',
        target: wtTarget,
        kind: 'win-exe',
        source: 'installed'
      },
      dirPath,
      { stat, spawnFile }
    )

    expect(opened).toBe(false)
  })

  it('selects each Linux terminal’s own working-directory flag', async () => {
    const dirPath = '/home/x/a folder'
    const spawnFile = vi.fn(async () => undefined)
    const konsole: DirectoryTerminal = {
      id: 'konsole',
      name: 'Konsole',
      target: '/usr/bin/konsole',
      kind: 'linux-bin',
      source: 'installed'
    }
    const gnome: DirectoryTerminal = {
      id: 'gnome-terminal',
      name: 'GNOME Terminal',
      target: '/usr/bin/gnome-terminal',
      kind: 'linux-bin',
      source: 'system-default'
    }
    const stat = vi.fn(async (target: string): Promise<DirectoryTerminalStats> => {
      if (target === dirPath) return directoryStats()
      if (target === '/usr/bin/konsole' || target === '/usr/bin/gnome-terminal') return fileStats()
      throw new Error(`ENOENT: ${target}`)
    })

    await openDirectoryInTerminal(konsole, dirPath, { stat, spawnFile })
    await openDirectoryInTerminal(gnome, dirPath, { stat, spawnFile })

    expect(spawnFile).toHaveBeenNthCalledWith(1, '/usr/bin/konsole', ['--workdir', dirPath], {
      cwd: dirPath
    })
    expect(spawnFile).toHaveBeenNthCalledWith(
      2,
      '/usr/bin/gnome-terminal',
      [`--working-directory=${dirPath}`],
      { cwd: dirPath }
    )
  })
})

describe('getDirectoryTerminals', () => {
  it('offers only mac bundles that declare a folder document type', async () => {
    const inventory = await getDirectoryTerminals({
      platform: 'darwin',
      appDirs: ['/Applications'],
      stat: statReporting(['/Applications/Ghostty.app', '/Applications/Warp.app']),
      readFile: async (target) =>
        Buffer.from(
          target.startsWith('/Applications/Ghostty.app')
            ? '<string>public.folder</string>'
            : '<string>public.html</string>'
        )
    })

    expect(inventory.all.map((terminal) => terminal.id)).toEqual(['ghostty'])
    expect(inventory.default).toMatchObject({ id: 'ghostty', source: 'installed' })
    expect(inventory.installed).toEqual([])
  })

  it('falls back to the system terminal as the default when the user installed nothing', async () => {
    const inventory = await getDirectoryTerminals({
      platform: 'darwin',
      appDirs: ['/Applications'],
      stat: statReporting(['/System/Applications/Utilities/Terminal.app']),
      readFile: async () => Buffer.from('<string>public.folder</string>')
    })

    expect(inventory.default).toMatchObject({ id: 'terminal', source: 'system-default' })
    expect(inventory.installed).toEqual([])
    expect(resolvePreferredTerminal(inventory)).toEqual({
      terminal: inventory.default,
      configured: false
    })
  })

  it('ignores a configured terminal id that is no longer installed', async () => {
    const inventory = await getDirectoryTerminals({
      platform: 'darwin',
      appDirs: ['/Applications'],
      stat: statReporting(['/Applications/Ghostty.app']),
      readFile: async () => Buffer.from('<string>public.folder</string>')
    })

    expect(resolvePreferredTerminal(inventory, 'uninstalled-app')).toEqual({
      terminal: inventory.default,
      configured: false
    })
    expect(resolvePreferredTerminal(inventory, 'ghostty')).toEqual({
      terminal: inventory.all[0],
      configured: true
    })
  })
})

describe('revealPathInFileManager', () => {
  it('opens a directory and reports success only when the file manager reports none', async () => {
    const openPath = vi.fn(async () => '')
    const showItemInFolder = vi.fn()

    const opened = await revealPathInFileManager(
      '/Users/x/Downloads',
      { openPath, showItemInFolder },
      { stat: async () => directoryStats() }
    )

    expect(opened).toBe(true)
    expect(openPath).toHaveBeenCalledWith('/Users/x/Downloads')
    expect(showItemInFolder).not.toHaveBeenCalled()

    openPath.mockResolvedValueOnce('no handler')
    await expect(
      revealPathInFileManager(
        '/Users/x/Downloads',
        { openPath, showItemInFolder },
        { stat: async () => directoryStats() }
      )
    ).resolves.toBe(false)
  })

  it('selects a plain file inside its parent and never opens it as a folder', async () => {
    const openPath = vi.fn(async () => '')
    const showItemInFolder = vi.fn()

    const revealed = await revealPathInFileManager(
      '/Users/x/notes.md',
      { openPath, showItemInFolder },
      { stat: async () => fileStats() }
    )

    expect(revealed).toBe(true)
    expect(showItemInFolder).toHaveBeenCalledWith('/Users/x/notes.md')
    expect(openPath).not.toHaveBeenCalled()
  })

  it('does nothing for a path that no longer exists', async () => {
    const openPath = vi.fn(async () => '')
    const showItemInFolder = vi.fn()

    const revealed = await revealPathInFileManager(
      '/Users/x/vanished',
      { openPath, showItemInFolder },
      {
        stat: async () => {
          throw new Error('ENOENT')
        }
      }
    )

    expect(revealed).toBe(false)
    expect(openPath).not.toHaveBeenCalled()
    expect(showItemInFolder).not.toHaveBeenCalled()
  })
})
