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

  it('passes explicit safe working-directory flags for every supported Linux terminal', async () => {
    const dirPath = '/home/x/My Folder; rm -rf ~ $(id)'
    const cases: Array<{ id: string; bin: string; expectedArgs: string[] }> = [
      {
        id: 'xfce4-terminal',
        bin: 'xfce4-terminal',
        expectedArgs: [`--working-directory=${dirPath}`]
      },
      { id: 'ptyxis', bin: 'ptyxis', expectedArgs: [`--working-directory=${dirPath}`] },
      { id: 'ghostty', bin: 'ghostty', expectedArgs: [`--working-directory=${dirPath}`] },
      { id: 'foot', bin: 'foot', expectedArgs: [`--working-directory=${dirPath}`] },
      { id: 'tilix', bin: 'tilix', expectedArgs: [`--working-directory=${dirPath}`] },
      { id: 'terminator', bin: 'terminator', expectedArgs: [`--working-directory=${dirPath}`] },
      { id: 'rio', bin: 'rio', expectedArgs: ['--working-dir', dirPath] },
      { id: 'alacritty', bin: 'alacritty', expectedArgs: ['--working-directory', dirPath] },
      { id: 'kitty', bin: 'kitty', expectedArgs: ['--directory', dirPath] },
      { id: 'wezterm', bin: 'wezterm', expectedArgs: ['start', '--cwd', dirPath] },
      { id: 'x-terminal-emulator', bin: 'x-terminal-emulator', expectedArgs: [] }
    ]

    const spawnFile = vi.fn(async () => undefined)
    const stat = vi.fn(async (target: string): Promise<DirectoryTerminalStats> => {
      if (target === dirPath) return directoryStats()
      if (target.startsWith('/usr/bin/')) return fileStats()
      throw new Error(`ENOENT: ${target}`)
    })

    for (const [index, entry] of cases.entries()) {
      const target = `/usr/bin/${entry.bin}`
      const opened = await openDirectoryInTerminal(
        {
          id: entry.id,
          name: entry.id,
          target,
          kind: 'linux-bin',
          source: 'installed'
        },
        dirPath,
        { stat, spawnFile }
      )
      expect(opened).toBe(true)
      expect(spawnFile).toHaveBeenNthCalledWith(index + 1, target, entry.expectedArgs, {
        cwd: dirPath
      })
    }
  })

  it('passes safe working-directory flags or cwd for every supported Windows terminal', async () => {
    const dirPath = 'C:\\Users\\x\\My Folder & calc; echo pwned'
    const cases: Array<{ id: string; target: string; expectedArgs: string[] }> = [
      {
        id: 'windows-terminal',
        target: 'C:\\Users\\x\\AppData\\Local\\Microsoft\\WindowsApps\\wt.exe',
        expectedArgs: ['-d', dirPath]
      },
      {
        id: 'pwsh',
        target: 'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
        expectedArgs: ['-NoExit', '-WorkingDirectory', dirPath]
      },
      {
        id: 'powershell',
        target: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
        expectedArgs: ['-NoExit']
      },
      {
        id: 'git-bash',
        target: 'C:\\Program Files\\Git\\git-bash.exe',
        expectedArgs: [`--cd=${dirPath}`]
      },
      {
        id: 'wezterm',
        target: 'C:\\Program Files\\WezTerm\\wezterm-gui.exe',
        expectedArgs: ['start', '--cwd', dirPath]
      },
      {
        id: 'alacritty',
        target: 'C:\\Program Files\\Alacritty\\alacritty.exe',
        expectedArgs: ['--working-directory', dirPath]
      },
      {
        id: 'tabby',
        target: 'C:\\Users\\x\\AppData\\Local\\Programs\\Tabby\\Tabby.exe',
        expectedArgs: ['open', dirPath]
      },
      {
        id: 'cmd',
        target: 'C:\\Windows\\System32\\cmd.exe',
        expectedArgs: []
      }
    ]

    const targets = new Set(cases.map((entry) => entry.target))
    const spawnFile = vi.fn(async () => undefined)
    const stat = vi.fn(async (target: string): Promise<DirectoryTerminalStats> => {
      if (target === dirPath) return directoryStats()
      if (targets.has(target)) return fileStats()
      throw new Error(`ENOENT: ${target}`)
    })

    for (const [index, entry] of cases.entries()) {
      const opened = await openDirectoryInTerminal(
        {
          id: entry.id,
          name: entry.id,
          target: entry.target,
          kind: 'win-exe',
          source: entry.id === 'cmd' ? 'system-default' : 'installed'
        },
        dirPath,
        { stat, spawnFile }
      )
      expect(opened).toBe(true)
      expect(spawnFile).toHaveBeenNthCalledWith(index + 1, entry.target, entry.expectedArgs, {
        cwd: dirPath
      })
    }
  })

  it('refuses to spawn a Windows or Linux terminal binary that vanished after discovery', async () => {
    const spawnFile = vi.fn(async () => undefined)
    const stat = vi.fn(async (target: string): Promise<DirectoryTerminalStats> => {
      if (target === '/tmp/dir' || target === 'C:\\Users\\x\\dir') return directoryStats()
      throw new Error(`ENOENT: ${target}`)
    })

    const linuxOpened = await openDirectoryInTerminal(
      {
        id: 'ghostty',
        name: 'Ghostty',
        target: '/usr/bin/ghostty',
        kind: 'linux-bin',
        source: 'installed'
      },
      '/tmp/dir',
      { stat, spawnFile }
    )
    const winOpened = await openDirectoryInTerminal(
      {
        id: 'pwsh',
        name: 'PowerShell 7',
        target: 'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
        kind: 'win-exe',
        source: 'installed'
      },
      'C:\\Users\\x\\dir',
      { stat, spawnFile }
    )

    expect(linuxOpened).toBe(false)
    expect(winOpened).toBe(false)
    expect(spawnFile).not.toHaveBeenCalled()
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

  it('discovers Rio, Wave, WindTerm, and Electerm on macOS only when Info.plist declares folder support', async () => {
    const inventory = await getDirectoryTerminals({
      platform: 'darwin',
      appDirs: ['/Applications'],
      stat: statReporting([
        '/Applications/Rio.app',
        '/Applications/Wave.app',
        '/Applications/WindTerm.app',
        '/Applications/Electerm.app'
      ]),
      readFile: async (target) => {
        if (target.startsWith('/Applications/Rio.app')) {
          return Buffer.from('<string>public.folder</string>')
        }
        if (target.startsWith('/Applications/Wave.app')) {
          return Buffer.from('<string>public.directory</string>')
        }
        if (target.startsWith('/Applications/WindTerm.app')) {
          return Buffer.from('<string>public.plain-text</string>')
        }
        throw new Error('ENOENT')
      }
    })

    expect(inventory.all.map((terminal) => terminal.id)).toEqual(['rio', 'wave'])
  })

  it('discovers installed Linux terminals from PATH including modern emulators', async () => {
    const installedBins = new Set([
      '/usr/bin/ptyxis',
      '/usr/local/bin/ghostty',
      '/usr/bin/foot',
      '/usr/bin/tilix',
      '/usr/bin/terminator',
      '/usr/local/bin/rio',
      '/usr/bin/alacritty',
      '/usr/bin/kitty',
      '/usr/bin/wezterm'
    ])
    const inventory = await getDirectoryTerminals({
      platform: 'linux',
      pathEnv: '/usr/local/bin:/usr/bin',
      stat: async (target) => {
        if (installedBins.has(target)) return fileStats()
        throw new Error(`ENOENT: ${target}`)
      }
    })

    expect(inventory.default).toMatchObject({
      id: 'ptyxis',
      target: '/usr/bin/ptyxis',
      kind: 'linux-bin',
      source: 'system-default'
    })
    expect(inventory.all.map((terminal) => terminal.id)).toEqual([
      'ptyxis',
      'ghostty',
      'alacritty',
      'kitty',
      'wezterm',
      'rio',
      'foot',
      'tilix',
      'terminator'
    ])
  })

  it('discovers installed Windows terminals across PATH and standard install roots while keeping cmd as default', async () => {
    const existingFiles = new Set([
      'C:\\Users\\x\\AppData\\Local\\Microsoft\\WindowsApps\\wt.exe',
      'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      'C:\\Users\\x\\AppData\\Local\\Programs\\Git\\git-bash.exe',
      'C:\\Program Files\\WezTerm\\wezterm-gui.exe',
      'C:\\Tools\\alacritty.exe',
      'C:\\Users\\x\\AppData\\Local\\Programs\\Tabby\\Tabby.exe',
      'C:\\Windows\\System32\\cmd.exe'
    ])

    const inventory = await getDirectoryTerminals({
      platform: 'win32',
      pathEnv: 'C:\\Tools',
      env: {
        SystemRoot: 'C:\\Windows',
        ProgramFiles: 'C:\\Program Files',
        LOCALAPPDATA: 'C:\\Users\\x\\AppData\\Local'
      },
      stat: async (target) => {
        if (existingFiles.has(target)) return fileStats()
        throw new Error(`ENOENT: ${target}`)
      }
    })

    expect(inventory.default).toMatchObject({
      id: 'cmd',
      name: 'Command Prompt',
      target: 'C:\\Windows\\System32\\cmd.exe',
      kind: 'win-exe',
      source: 'system-default'
    })
    expect(inventory.installed.map((terminal) => terminal.id)).toEqual([
      'windows-terminal',
      'pwsh',
      'powershell',
      'git-bash',
      'wezterm',
      'alacritty',
      'tabby'
    ])
    expect(resolvePreferredTerminal(inventory, 'git-bash')).toEqual({
      terminal: expect.objectContaining({
        id: 'git-bash',
        target: 'C:\\Users\\x\\AppData\\Local\\Programs\\Git\\git-bash.exe'
      }),
      configured: true
    })
  })

  it('discovers Git Bash from %ProgramFiles%\\Git\\git-bash.exe when not in PATH', async () => {
    const existingFiles = new Set([
      'C:\\Program Files\\Git\\git-bash.exe',
      'C:\\Windows\\System32\\cmd.exe'
    ])

    const inventory = await getDirectoryTerminals({
      platform: 'win32',
      pathEnv: '',
      env: {
        SystemRoot: 'C:\\Windows',
        ProgramFiles: 'C:\\Program Files',
        LOCALAPPDATA: 'C:\\Users\\x\\AppData\\Local'
      },
      stat: async (target) => {
        if (existingFiles.has(target)) return fileStats()
        throw new Error(`ENOENT: ${target}`)
      }
    })

    expect(inventory.all.map((terminal) => terminal.id)).toEqual(['git-bash', 'cmd'])
    expect(inventory.installed[0]).toMatchObject({
      id: 'git-bash',
      target: 'C:\\Program Files\\Git\\git-bash.exe'
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
