import { resolveEverythingInstallArchitecture } from '@talex-touch/tuff-native/everything-resources'
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const PORTABLE_CONFIG_NAME = 'Everything.ini'

export interface EverythingInstallPaths {
  downloadDir: string
  installDir: string
  sdkDir: string
  sdkDllPath: string
  cliDir: string
  cliPath: string
  everythingExe: string
  configPath: string
}

export interface EverythingInstallRuntime {
  execFileAsync?: typeof execFileAsync
  spawn?: typeof spawn
  fs?: Pick<typeof fs, 'access' | 'mkdir' | 'readFile' | 'readdir' | 'writeFile'>
  platform?: NodeJS.Platform
  env?: NodeJS.ProcessEnv
  cwd?: () => string
  delay?: (milliseconds: number) => Promise<void>
}

/** Owns portable install paths, config, process launch and index repair primitives. */
export class EverythingInstallService {
  private readonly exec: typeof execFileAsync
  private readonly launch: typeof spawn
  private readonly fileSystem: Pick<
    typeof fs,
    'access' | 'mkdir' | 'readFile' | 'readdir' | 'writeFile'
  >
  private readonly platform: NodeJS.Platform
  private readonly env: NodeJS.ProcessEnv
  private readonly cwd: () => string
  private readonly delay: (milliseconds: number) => Promise<void>

  constructor(runtime: EverythingInstallRuntime = {}) {
    this.exec = runtime.execFileAsync ?? execFileAsync
    this.launch = runtime.spawn ?? spawn
    this.fileSystem = runtime.fs ?? fs
    this.platform = runtime.platform ?? process.platform
    this.env = runtime.env ?? process.env
    this.cwd = runtime.cwd ?? process.cwd
    this.delay =
      runtime.delay ??
      ((milliseconds) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)))
  }

  resolvePaths(): EverythingInstallPaths {
    const localAppData =
      this.env.LOCALAPPDATA ||
      (this.env.USERPROFILE ? path.join(this.env.USERPROFILE, 'AppData', 'Local') : this.cwd())
    const root = path.join(localAppData, 'Tuff')
    const installDir = path.join(root, 'Everything')
    const sdkDir = path.join(root, 'EverythingSDK')
    const cliDir = path.join(root, 'EverythingCLI')
    const architecture = resolveEverythingInstallArchitecture(this.env)
    const sdkDllName =
      architecture === 'ARM64'
        ? 'EverythingARM64.dll'
        : architecture === 'x86'
          ? 'Everything32.dll'
          : 'Everything64.dll'
    return {
      downloadDir: path.join(root, 'Downloads', 'dependencies', 'everything'),
      installDir,
      sdkDir,
      sdkDllPath: path.join(sdkDir, 'dll', sdkDllName),
      cliDir,
      cliPath: path.join(cliDir, 'es.exe'),
      everythingExe: path.join(installDir, 'Everything.exe'),
      configPath: path.join(installDir, PORTABLE_CONFIG_NAME)
    }
  }

  normalizeWindowsPath(value: string): string {
    return path.win32
      .normalize(value.trim())
      .replace(/[\\/]+$/, '')
      .toLowerCase()
  }

  isManagedPortableApp(everythingExe: string): boolean {
    const paths = this.resolvePaths()
    const normalized = this.normalizeWindowsPath(everythingExe)
    return [paths.everythingExe, path.join(paths.installDir, 'everything.exe')].some(
      (candidate) => this.normalizeWindowsPath(candidate) === normalized
    )
  }

  portableConfigPath(everythingExe: string): string {
    return path.join(path.win32.dirname(everythingExe), PORTABLE_CONFIG_NAME)
  }

  defaultFolderRoots(): string[] {
    const homeDir = this.env.USERPROFILE || this.env.HOME
    if (!homeDir) return []
    const roots = ['Desktop', 'Documents', 'Downloads'].map((folder) =>
      path.win32.join(homeDir, folder)
    )
    return [...new Map(roots.map((root) => [this.normalizeWindowsPath(root), root])).values()]
  }

  buildPortableConfig(folderRoots: string[]): string {
    const values = folderRoots.map(() => '1').join(',')
    const zeros = folderRoots.map(() => '0').join(',')
    return [
      '[Everything]',
      'app_data=0',
      'run_as_admin=0',
      'allow_multiple_instances=0',
      'run_in_background=1',
      'show_tray_icon=0',
      'check_for_updates_on_startup=0',
      'ipc=1',
      'auto_include_fixed_volumes=0',
      'auto_include_removable_volumes=0',
      'auto_include_fixed_refs_volumes=0',
      'auto_include_removable_refs_volumes=0',
      `folders=${folderRoots.join(',')}`,
      `folder_monitor_changes=${values}`,
      `folder_buffer_size_list=${folderRoots.map(() => '65536').join(',')}`,
      `folder_rescan_if_full_list=${values}`,
      `folder_update_types=${zeros}`,
      `folder_update_days=${zeros}`,
      `folder_update_ats=${zeros}`,
      `folder_update_intervals=${zeros}`,
      `folder_update_interval_types=${zeros}`,
      'index_size=1',
      'index_date_modified=1',
      'index_date_created=1',
      'fast_path_sort=1',
      'exclude_folders="?:\\\\$Recycle.Bin","C:\\\\Windows\\\\Prefetch"',
      ''
    ].join('\n')
  }

  async writePortableConfig(configPath: string): Promise<string[]> {
    const roots = this.defaultFolderRoots()
    if (roots.length === 0)
      throw new Error('No local folder roots are available for portable Everything indexing')
    await this.fileSystem.mkdir(path.win32.dirname(configPath), { recursive: true })
    await this.fileSystem.writeFile(configPath, this.buildPortableConfig(roots), 'utf8')
    return roots
  }

  async findExistingPath(candidates: string[]): Promise<string | null> {
    for (const candidate of candidates) {
      if (candidate.toLowerCase() === 'es.exe') continue
      try {
        await this.fileSystem.access(candidate)
        return candidate
      } catch {
        if (this.platform !== 'win32') continue
        try {
          const entries = await this.fileSystem.readdir(path.win32.dirname(candidate), {
            withFileTypes: true
          })
          const match = entries.find(
            (entry) => entry.name.toLowerCase() === path.win32.basename(candidate).toLowerCase()
          )
          if (match) return path.win32.join(path.win32.dirname(candidate), match.name)
        } catch {}
      }
    }
    return null
  }

  async calculateSha256(filePath: string): Promise<string> {
    return createHash('sha256')
      .update(await this.fileSystem.readFile(filePath))
      .digest('hex')
  }

  async ensureUserPathContains(cliDir: string): Promise<void> {
    const script = [
      "$ErrorActionPreference='Stop'",
      '$cliDir=$env:TUFF_EVERYTHING_CLI_DIR',
      "if(-not $cliDir){throw 'Missing Everything CLI directory'}",
      "$userPath=[Environment]::GetEnvironmentVariable('Path','User')",
      '$parts=@()',
      "if($userPath){$parts=$userPath -split ';' | Where-Object { $_ -and $_.Trim() }}",
      '$normalizedCli=$cliDir.Trim().TrimEnd("\\")',
      '$already=$false',
      'foreach($part in $parts){ if([string]::Equals($part.Trim().TrimEnd("\\"), $normalizedCli, [System.StringComparison]::OrdinalIgnoreCase)){$already=$true;break} }',
      "if(-not $already){[Environment]::SetEnvironmentVariable('Path', (($parts + $cliDir) -join ';'), 'User')}",
      "if($already){'already'}else{'added'}"
    ].join('\n')
    await this.exec(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { timeout: 5000, windowsHide: true, env: { ...this.env, TUFF_EVERYTHING_CLI_DIR: cliDir } }
    )
    const pathKey = Object.keys(this.env).find((key) => key.toLowerCase() === 'path') || 'Path'
    const parts = (this.env[pathKey] || '').split(';').filter(Boolean)
    if (
      !parts.some((part) => this.normalizeWindowsPath(part) === this.normalizeWindowsPath(cliDir))
    )
      this.env[pathKey] = [...parts, cliDir].join(';')
  }

  startPortable(everythingExe: string, onError?: (error: Error) => void): ChildProcess {
    const args = this.isManagedPortableApp(everythingExe)
      ? ['-config', this.portableConfigPath(everythingExe), '-startup']
      : ['-startup']
    const child = this.launch(everythingExe, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      cwd: path.win32.dirname(everythingExe)
    })
    child.once('error', onError ?? (() => undefined))
    child.unref()
    return child
  }

  async startPortableAndWait(everythingExe: string): Promise<void> {
    let launchError: Error | null = null
    this.startPortable(everythingExe, (error) => {
      launchError = error
    })
    await this.delay(1_200)
    if (launchError) throw launchError
  }

  async isPortableConfigStale(): Promise<boolean> {
    let content: string
    try {
      content = String(await this.fileSystem.readFile(this.resolvePaths().configPath, 'utf8'))
    } catch {
      return true
    }
    const folders = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.toLowerCase().startsWith('folders='))
    if (!folders || /^folders="/i.test(folders)) return true
    const configured = new Set(
      folders
        .slice(folders.indexOf('=') + 1)
        .split(',')
        .filter(Boolean)
        .map((root) => this.normalizeWindowsPath(root))
    )
    return this.defaultFolderRoots().some(
      (root) => !configured.has(this.normalizeWindowsPath(root))
    )
  }
  async repairPortableIndex(options: {
    signal?: AbortSignal
    findExistingPath: (candidates: string[]) => Promise<string | null>
    onDebug: (message: string, meta: Record<string, unknown>) => void
    onInfo: (message: string, meta: Record<string, unknown>) => void
  }): Promise<boolean> {
    try {
      const paths = this.resolvePaths()
      const appPath = await options.findExistingPath([paths.everythingExe])
      if (!appPath) return false

      const configPath = this.portableConfigPath(appPath)
      const roots = await this.writePortableConfig(configPath)
      await this.stopPortable(appPath, options.onDebug)
      this.startPortable(appPath)
      await this.delay(1_500)
      await this.exec(appPath, ['-config', configPath, '-rescan-all'], {
        timeout: 10_000,
        signal: options.signal,
        windowsHide: true
      }).catch((error) =>
        options.onDebug('Everything portable folder rescan command failed', {
          error: error instanceof Error ? error.message : String(error)
        })
      )
      await this.delay(1_200)
      options.onInfo('Repaired portable Everything folder index configuration', {
        rootCount: roots.length
      })
      return true
    } catch (error) {
      options.onDebug('Failed to repair portable Everything folder index configuration', {
        error: error instanceof Error ? error.message : String(error)
      })
      return false
    }
  }

  private async stopPortable(
    everythingExe: string,
    onDebug: (message: string, meta: Record<string, unknown>) => void
  ): Promise<void> {
    try {
      await this.exec(
        'powershell',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          [
            '$ErrorActionPreference = "SilentlyContinue"',
            '$target = $env:TUFF_EVERYTHING_EXE',
            'Get-Process -Name Everything,everything | Where-Object {',
            '  try { [string]::Equals($_.Path, $target, [System.StringComparison]::OrdinalIgnoreCase) } catch { $false }',
            '} | Stop-Process -Force'
          ].join('\n')
        ],
        {
          timeout: 3000,
          windowsHide: true,
          env: { ...this.env, TUFF_EVERYTHING_EXE: this.normalizeWindowsPath(everythingExe) }
        }
      )
    } catch (error) {
      onDebug('Stopping portable Everything process failed', {
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }
}
