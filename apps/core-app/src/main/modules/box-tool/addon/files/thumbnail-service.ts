import type { ThumbnailMediaKind } from './thumbnail-config'
import { execFile } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import {
  getThumbnailMediaKind,
  getThumbnailUnsupportedReason,
  normalizeExtension,
  THUMBNAIL_JPEG_QUALITY,
  THUMBNAIL_SIZE
} from './thumbnail-config'

export interface ThumbnailGeneratedResult {
  status: 'generated'
  kind: ThumbnailMediaKind
  path: string
  mimeType: 'image/jpeg'
  sizeBytes: number
  width?: number
  height?: number
  durationMs: number
}

export interface ThumbnailUnavailableResult {
  status: 'unsupported' | 'failed'
  kind?: ThumbnailMediaKind
  reason: string
  durationMs: number
}

export type ThumbnailGenerationResult = ThumbnailGeneratedResult | ThumbnailUnavailableResult

export interface GenerateThumbnailOptions {
  filePath: string
  outputDir: string
  extension?: string | null
  sizeBytes?: number | null
  ffmpegPath?: string | null
  ffprobePath?: string | null
}

export interface VideoThumbnailSupport {
  available: boolean
  reason?: string
  ffmpegPath?: string
  ffprobePath?: string
}

const execFileAsync = promisify(execFile)
const require = createRequire(import.meta.url)
const requireFromCwd = createRequire(`${process.cwd()}${path.sep}`)

function buildOutputPath(outputDir: string, prefix = 'thumbnail'): string {
  return path.join(outputDir, `${Date.now()}-${prefix}-${crypto.randomUUID()}.jpg`)
}

function normalizeAsarUnpackedPath(candidate: unknown): string | null {
  if (typeof candidate !== 'string' || !candidate.trim()) return null
  const value = candidate.trim()
  if (!value.includes('app.asar')) return value
  return value.replace('app.asar', 'app.asar.unpacked')
}

function resolveFfmpegPath(override?: string | null): string | null {
  if (override !== undefined) return normalizeAsarUnpackedPath(override)
  try {
    return normalizeAsarUnpackedPath(require('ffmpeg-static'))
  } catch {
    try {
      return normalizeAsarUnpackedPath(requireFromCwd('ffmpeg-static'))
    } catch {
      return null
    }
  }
}

function resolveFfprobePath(override?: string | null): string | null {
  if (override !== undefined) return normalizeAsarUnpackedPath(override)
  try {
    const resolved = require('ffprobe-static') as { path?: unknown } | string | null
    if (typeof resolved === 'string') return normalizeAsarUnpackedPath(resolved)
    return normalizeAsarUnpackedPath(resolved?.path)
  } catch {
    try {
      const resolved = requireFromCwd('ffprobe-static') as { path?: unknown } | string | null
      if (typeof resolved === 'string') return normalizeAsarUnpackedPath(resolved)
      return normalizeAsarUnpackedPath(resolved?.path)
    } catch {
      return null
    }
  }
}

export function getVideoThumbnailSupport(): VideoThumbnailSupport {
  const ffmpegPath = resolveFfmpegPath()
  const ffprobePath = resolveFfprobePath()

  if (!ffmpegPath) {
    return {
      available: false,
      reason: 'ffmpeg-unavailable',
      ffprobePath: ffprobePath ?? undefined
    }
  }

  return {
    available: true,
    ffmpegPath,
    ffprobePath: ffprobePath ?? undefined
  }
}

async function fileSize(filePath: string): Promise<number> {
  const stat = await fs.stat(filePath)
  return stat.size
}

async function writeJpegThumbnail(
  inputPath: string,
  outputPath: string
): Promise<{
  sizeBytes: number
  width?: number
  height?: number
}> {
  const { default: sharp } = await import('sharp')
  const info = await sharp(inputPath, { animated: false })
    .rotate()
    .resize({
      width: THUMBNAIL_SIZE,
      height: THUMBNAIL_SIZE,
      fit: 'inside',
      withoutEnlargement: true
    })
    .jpeg({ quality: THUMBNAIL_JPEG_QUALITY })
    .toFile(outputPath)

  const sizeBytes = info.size || (await fileSize(outputPath))
  if (sizeBytes <= 0) {
    throw new Error('empty-thumbnail-output')
  }
  return {
    sizeBytes,
    width: info.width,
    height: info.height
  }
}

async function probeVideoDuration(filePath: string, ffprobePath: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync(ffprobePath, [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      filePath
    ])
    const duration = Number.parseFloat(String(stdout).trim())
    return Number.isFinite(duration) && duration > 0 ? duration : null
  } catch {
    return null
  }
}

async function generateVideoFrame(
  filePath: string,
  outputDir: string,
  ffmpegPath: string,
  ffprobePath: string | null
): Promise<string> {
  const framePath = buildOutputPath(outputDir, 'frame')
  const duration = ffprobePath ? await probeVideoDuration(filePath, ffprobePath) : null
  const seekSeconds = duration ? Math.min(1, Math.max(0, duration * 0.1)) : 0

  await execFileAsync(ffmpegPath, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-ss',
    String(seekSeconds),
    '-i',
    filePath,
    '-frames:v',
    '1',
    '-an',
    '-y',
    framePath
  ])

  return framePath
}

function toFailure(
  reason: string,
  startedAt: number,
  kind?: ThumbnailMediaKind
): ThumbnailUnavailableResult {
  return {
    status: 'failed',
    kind,
    reason,
    durationMs: Math.round(performance.now() - startedAt)
  }
}

export async function generateThumbnail(
  options: GenerateThumbnailOptions
): Promise<ThumbnailGenerationResult> {
  const startedAt = performance.now()
  const extension = normalizeExtension(options.extension || path.extname(options.filePath))
  const kind = getThumbnailMediaKind(extension)
  const unsupportedReason = getThumbnailUnsupportedReason(extension, options.sizeBytes)

  if (unsupportedReason) {
    return {
      status: 'unsupported',
      kind: kind ?? undefined,
      reason: unsupportedReason,
      durationMs: Math.round(performance.now() - startedAt)
    }
  }

  if (!kind) {
    return {
      status: 'unsupported',
      reason: 'unsupported-thumbnail-type',
      durationMs: Math.round(performance.now() - startedAt)
    }
  }

  await fs.mkdir(options.outputDir, { recursive: true })

  const outputPath = buildOutputPath(options.outputDir)
  let framePath: string | null = null

  try {
    let inputPath = options.filePath
    if (kind === 'video') {
      const ffmpegPath = resolveFfmpegPath(options.ffmpegPath)
      if (!ffmpegPath) {
        return toFailure('ffmpeg-unavailable', startedAt, kind)
      }
      const nextFramePath = await generateVideoFrame(
        options.filePath,
        options.outputDir,
        ffmpegPath,
        resolveFfprobePath(options.ffprobePath)
      )
      framePath = nextFramePath
      inputPath = framePath
    }

    const written = await writeJpegThumbnail(inputPath, outputPath)
    return {
      status: 'generated',
      kind,
      path: outputPath,
      mimeType: 'image/jpeg',
      sizeBytes: written.sizeBytes,
      width: written.width,
      height: written.height,
      durationMs: Math.round(performance.now() - startedAt)
    }
  } catch (error) {
    await fs.rm(outputPath, { force: true }).catch(() => undefined)
    const message = error instanceof Error ? error.message : String(error)
    return toFailure(message || 'thumbnail-generation-failed', startedAt, kind)
  } finally {
    if (framePath) {
      await fs.rm(framePath, { force: true }).catch(() => undefined)
    }
  }
}
