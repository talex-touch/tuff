import { execFile, type ChildProcess, type SpawnOptions, spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  isEverythingCliProbeOutput,
  parseEverythingCliOutput,
  parseEverythingSdkOutput,
  parseEverythingVersion,
  type EverythingSearchResult
} from './everything-parser'

const execFileAsync = promisify(execFile)

export interface EverythingSdkAddon {
  search?: (query: string, options?: { maxResults?: number }) => unknown
  query?: (query: string, options?: { maxResults?: number }) => unknown
  getVersion?: () => string
}

export interface EverythingBackendRuntime {
  execFileAsync?: typeof execFileAsync
  access?: typeof fs.access
  requireModule?: (candidate: string) => unknown
  platform?: NodeJS.Platform
  resourcesPath?: string
  cwd?: () => string
}

/**
 * Boundary around dynamic SDK loading and es.exe process calls. The provider owns
 * lifecycle state and supplies its callbacks, keeping this service free of search
 * engine and database dependencies.
 */
export class EverythingBackendService {
  private readonly exec: typeof execFileAsync
  private readonly access: typeof fs.access
  private readonly requireModule: (candidate: string) => unknown
  private readonly platform: NodeJS.Platform
  private readonly resourcesPath: string
  private readonly cwd: () => string

  constructor(runtime: EverythingBackendRuntime = {}) {
    this.exec = runtime.execFileAsync ?? execFileAsync
    this.access = runtime.access ?? fs.access
    this.requireModule = runtime.requireModule ?? createRequire(import.meta.url)
    this.platform = runtime.platform ?? process.platform
    this.resourcesPath = runtime.resourcesPath ?? process.resourcesPath ?? ''
    this.cwd = runtime.cwd ?? process.cwd
  }

  sdkCandidates(): string[] {
    const envPath = process.env.TALEX_EVERYTHING_SDK_PATH?.trim()
    return [
      envPath,
      this.resourcesPath ? path.join(this.resourcesPath, 'native', 'everything.node') : null,
      this.resourcesPath ? path.join(this.resourcesPath, 'everything', 'everything.node') : null,
      path.join(this.cwd(), 'resources', 'native', 'everything.node'),
      path.join(this.cwd(), 'resources', 'everything.node'),
      '@talex-touch/tuff-native/everything',
      '@talex-touch/everything-sdk'
    ].filter((candidate): candidate is string => Boolean(candidate))
  }

  async loadSdkAddon(candidate: string): Promise<EverythingSdkAddon | null> {
    const isPathLike =
      candidate.includes('\\') || candidate.includes('/') || candidate.endsWith('.node')
    if (isPathLike) {
      try {
        await this.access(candidate)
      } catch {
        return null
      }
    }
    try {
      const loaded = this.requireModule(candidate)
      if (isRecord(loaded) && isRecord(loaded.default)) return loaded.default as EverythingSdkAddon
      return isRecord(loaded) ? (loaded as EverythingSdkAddon) : null
    } catch {
      return null
    }
  }

  async probeCli(esPath: string): Promise<{ version: string | null }> {
    const output = await this.readCliVersion(esPath)
    const version = parseEverythingVersion(output)
    if (!isEverythingCliProbeOutput(esPath, output, version)) {
      throw new Error('Selected file is not Everything CLI (es.exe)')
    }
    return { version }
  }

  async readCliVersion(esPath: string): Promise<string> {
    const result = await this.exec(esPath, ['-version'], { timeout: 3000, windowsHide: true })
    return normalizeExecFileOutput(result)
  }

  async searchCli(
    esPath: string,
    query: string,
    maxResults: number,
    signal?: AbortSignal
  ): Promise<EverythingSearchResult[]> {
    const { stdout } = await this.exec(
      esPath,
      [
        query,
        '-n',
        String(maxResults),
        '-sort',
        'path',
        '-full-path-and-name',
        '-size',
        '-dm',
        '-dc',
        '-csv',
        '-no-header'
      ],
      { timeout: 5000, maxBuffer: 10 * 1024 * 1024, signal, windowsHide: true }
    )
    return parseEverythingCliOutput(String(stdout))
  }

  async searchSdk(
    addon: EverythingSdkAddon,
    query: string,
    maxResults: number,
    signal?: AbortSignal
  ): Promise<EverythingSearchResult[]> {
    const search = addon.search ?? addon.query
    if (typeof search !== 'function')
      throw new TypeError('Everything SDK search method is not available')
    const searchPromise = Promise.resolve(search.call(addon, query, { maxResults }))
    const rawResults = signal
      ? await Promise.race([searchPromise, createAbortPromise(signal)])
      : await searchPromise
    return parseEverythingSdkOutput(rawResults)
  }

  async discoverCli(options: {
    configuredPath: string | null
    candidates: () => Promise<string[]>
    probe: (path: string) => Promise<{ version: string | null }>
    onCandidateFailure: (path: string, error: unknown) => void
  }): Promise<{ path: string; version: string | null }> {
    const tryCandidate = async (
      candidate: string
    ): Promise<{ path: string; version: string | null } | null> => {
      try {
        return { path: candidate, ...(await options.probe(candidate)) }
      } catch (error) {
        options.onCandidateFailure(candidate, error)
        return null
      }
    }
    if (options.configuredPath?.trim()) {
      const configured = await tryCandidate(options.configuredPath)
      if (configured) return configured
    }
    for (const candidate of await options.candidates()) {
      const discovered = await tryCandidate(candidate)
      if (discovered) return discovered
    }
    throw new Error(
      'Everything Command-line Interface (es.exe) not found. Install Everything manually, then install or select es.exe from the Everything CLI package.'
    )
  }

  isIpcUnavailable(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error)
    if (/Everything IPC window not found|\bError\s+8\b/i.test(message)) return true
    if (!isRecord(error)) return false
    const output = [error.stdout, error.stderr]
      .filter((value): value is string => typeof value === 'string')
      .join('\n')
    return /Everything IPC window not found|\bError\s+8\b/i.test(output)
  }

  async readRegistryPathValues(onError?: (error: unknown) => void): Promise<string[]> {
    if (this.platform !== 'win32') return []
    const script = [
      '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
      '$values = @()',
      "${'$'}machine = (Get-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment' -Name Path -ErrorAction SilentlyContinue).Path",
      "${'$'}user = (Get-ItemProperty -Path 'HKCU:\\Environment' -Name Path -ErrorAction SilentlyContinue).Path",
      "foreach (${'$'}value in @(${'$'}machine, ${'$'}user)) { if (${'$'}value) { ${'$'}values += [PSCustomObject]@{ Path = [string]${'$'}value } } }",
      "${'$'}values | ConvertTo-Json -Compress"
    ].join('\n')
    try {
      const { stdout } = await this.exec(
        'powershell',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
        { timeout: 3000, windowsHide: true }
      )
      const raw = String(stdout).trim()
      if (!raw) return []
      const records = Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : [JSON.parse(raw)]
      return records
        .map((record: { Path?: unknown; path?: unknown }) => record.Path ?? record.path ?? '')
        .filter(
          (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim())
        )
    } catch (error) {
      onError?.(error)
      return []
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizeExecFileOutput(result: unknown): string {
  if (typeof result === 'string') return result
  if (!isRecord(result)) return ''
  return [result.stdout, result.stderr]
    .filter((value): value is string => typeof value === 'string' && Boolean(value))
    .join('\n')
}

function createAbortPromise(signal: AbortSignal): Promise<never> {
  if (signal.aborted)
    return Promise.reject(
      Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })
    )
  return new Promise((_, reject) =>
    signal.addEventListener(
      'abort',
      () => reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })),
      { once: true }
    )
  )
}

export type { ChildProcess, SpawnOptions }
export { spawn }
