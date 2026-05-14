import type { Loader, TransformOptions, TransformResult } from 'esbuild'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

type EsbuildModule = typeof import('esbuild')

const ESBUILD_BINARY_ERROR_CODES = new Set(['ENOTDIR', 'ENOENT', 'EACCES'])

let esbuildModule: EsbuildModule | null = null
let esbuildBinaryPath: string | null | undefined

export class WidgetCompilerError extends Error {
  readonly code: string
  readonly causeCode?: string

  constructor(code: string, message: string, cause?: unknown) {
    super(message)
    this.name = 'WidgetCompilerError'
    this.code = code
    this.cause = cause
    this.causeCode = resolveErrorCode(cause)
  }
}

export function classifyWidgetCompileError(error: unknown): string {
  if (error instanceof WidgetCompilerError) {
    return error.code
  }

  if (isEsbuildServiceStoppedError(error)) {
    return 'WIDGET_COMPILER_SERVICE_UNAVAILABLE'
  }

  return isEsbuildBinaryError(error)
    ? 'WIDGET_COMPILER_BINARY_UNAVAILABLE'
    : 'WIDGET_COMPILE_FAILED'
}

export function resolveWidgetCompileCauseCode(error: unknown): string | undefined {
  if (error instanceof WidgetCompilerError) {
    return error.causeCode
  }

  return resolveErrorCode(error)
}

export async function transformWidgetSource(
  input: string,
  options: TransformOptions & { loader: Loader }
): Promise<TransformResult> {
  const esbuild = await loadEsbuild()

  try {
    return await esbuild.transform(input, options)
  } catch (error) {
    if (isEsbuildServiceStoppedError(error)) {
      esbuildModule = null
      throw new WidgetCompilerError(
        'WIDGET_COMPILER_SERVICE_UNAVAILABLE',
        buildServiceUnavailableMessage(error),
        error
      )
    }

    if (isEsbuildBinaryError(error)) {
      throw new WidgetCompilerError(
        'WIDGET_COMPILER_BINARY_UNAVAILABLE',
        buildBinaryUnavailableMessage(error),
        error
      )
    }

    throw error
  }
}

async function loadEsbuild(): Promise<EsbuildModule> {
  configureEsbuildBinaryPath()
  esbuildModule ??= await import('esbuild')
  return esbuildModule
}

function configureEsbuildBinaryPath(): void {
  if (process.env.ESBUILD_BINARY_PATH) {
    return
  }

  const binaryPath = resolvePackagedEsbuildBinaryPath()
  if (!binaryPath) {
    return
  }

  process.env.ESBUILD_BINARY_PATH = binaryPath
}

export function resolvePackagedEsbuildBinaryPathForTest(): string | null {
  esbuildBinaryPath = undefined
  return resolvePackagedEsbuildBinaryPath()
}

function resolvePackagedEsbuildBinaryPath(): string | null {
  if (esbuildBinaryPath !== undefined) {
    return esbuildBinaryPath
  }

  const candidates = getPackagedEsbuildBinaryCandidates()
  esbuildBinaryPath = candidates.find((candidate) => isExecutableFile(candidate)) ?? null
  return esbuildBinaryPath
}

function getPackagedEsbuildBinaryCandidates(): string[] {
  const platformPackage = resolveEsbuildPlatformPackage()
  const binarySubpath = process.platform === 'win32' ? 'esbuild.exe' : path.join('bin', 'esbuild')
  const candidates: string[] = []

  if (process.resourcesPath) {
    candidates.push(
      path.join(process.resourcesPath, 'node_modules', platformPackage, binarySubpath),
      path.join(
        process.resourcesPath,
        'app.asar.unpacked',
        'node_modules',
        platformPackage,
        binarySubpath
      )
    )
  }

  candidates.push(
    path.join(process.cwd(), 'node_modules', platformPackage, binarySubpath),
    path.join(__dirname, '..', '..', '..', '..', 'node_modules', platformPackage, binarySubpath)
  )

  return Array.from(new Set(candidates))
}

function resolveEsbuildPlatformPackage(): string {
  const arch = os.arch()
  const platform = process.platform

  if (platform === 'darwin' && arch === 'arm64') return '@esbuild/darwin-arm64'
  if (platform === 'darwin' && arch === 'x64') return '@esbuild/darwin-x64'
  if (platform === 'linux' && arch === 'arm64') return '@esbuild/linux-arm64'
  if (platform === 'linux' && arch === 'x64') return '@esbuild/linux-x64'
  if (platform === 'win32' && arch === 'arm64') return '@esbuild/win32-arm64'
  if (platform === 'win32' && arch === 'x64') return '@esbuild/win32-x64'

  return `@esbuild/${platform}-${arch}`
}

function isExecutableFile(filePath: string): boolean {
  try {
    const stat = fs.statSync(filePath)
    return stat.isFile()
  } catch {
    return false
  }
}

function isEsbuildBinaryError(error: unknown): boolean {
  const code = resolveErrorCode(error)
  if (code && ESBUILD_BINARY_ERROR_CODES.has(code)) {
    return true
  }

  const message = error instanceof Error ? error.message : String(error)
  return /\bspawn\s+(ENOTDIR|ENOENT|EACCES)\b/.test(message)
}

function isEsbuildServiceStoppedError(error: unknown): boolean {
  const code = resolveErrorCode(error)
  if (code === 'EPIPE') {
    return true
  }

  const message = error instanceof Error ? error.message : String(error)
  return /The service is no longer running|write EPIPE/i.test(message)
}

function resolveErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') {
    return undefined
  }

  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : undefined
}

function buildBinaryUnavailableMessage(error: unknown): string {
  const cause = error instanceof Error ? error.message : String(error)
  return `Widget compiler binary is unavailable. Ensure esbuild and its platform package are packaged outside app.asar. Cause: ${cause}`
}

function buildServiceUnavailableMessage(error: unknown): string {
  const cause = error instanceof Error ? error.message : String(error)
  return `Widget compiler service is unavailable. Runtime widget compilation can be retried in dev mode or avoided by packaged precompiled widgets. Cause: ${cause}`
}
