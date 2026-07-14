import type { TuffQuery } from '@talex-touch/utils'
import { TuffInputType } from '@talex-touch/utils'
import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { app } from 'electron'
import type {
  QuickOpsCommonDirectoryId,
  QuickOpsCommonDirectoryInfo,
  QuickOpsDegradedResult,
  QuickOpsFileBase64BatchInfo,
  QuickOpsFileBase64DecodeInfo,
  QuickOpsFileBase64Info,
  QuickOpsFileHashBatchInfo,
  QuickOpsFileHashInfo,
  QuickOpsFilePathInfo,
  QuickOpsRecentDownloadInfo,
  QuickOpsRecentDownloadMoveInfo,
  QuickOpsTempDirectoryInfo,
  QuickOpsTempTextFileInfo
} from './quick-ops-runtime-types'

const FILE_BASE64_MAX_BYTES = 1 * 1024 * 1024
const FILE_BASE64_DECODE_OUTPUT_NAME = 'decoded-base64.bin'
const TEMP_TEXT_FILE_MAX_BYTES = 64 * 1024

function matchesKeyword(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword))
}

const COMMON_DIRECTORY_DEFINITIONS: Array<{
  id: QuickOpsCommonDirectoryId
  title: string
  subtitle: string
  appPathName: Parameters<typeof app.getPath>[0]
  aliases: string[]
}> = [
  {
    id: 'desktop',
    title: '桌面',
    subtitle: 'Desktop',
    appPathName: 'desktop',
    aliases: ['desktop', '桌面']
  },
  {
    id: 'downloads',
    title: '下载',
    subtitle: 'Downloads',
    appPathName: 'downloads',
    aliases: ['downloads', 'download', '下载']
  },
  {
    id: 'documents',
    title: '文档',
    subtitle: 'Documents',
    appPathName: 'documents',
    aliases: ['documents', 'document', '文档']
  },
  {
    id: 'app-data',
    title: '应用数据',
    subtitle: 'User Data',
    appPathName: 'userData',
    aliases: ['app data', 'user data', 'userdata', '应用数据', '用户数据']
  },
  {
    id: 'logs',
    title: '日志',
    subtitle: 'Logs',
    appPathName: 'logs',
    aliases: ['logs', 'log', '日志']
  }
]
export function resolveFileHashPath(rawText: string, query: TuffQuery): string | null {
  return resolveFileHashPaths(rawText, query)[0] ?? null
}

export function resolveFileHashPaths(rawText: string, query: TuffQuery): string[] {
  const inputPaths = resolveFilesInputPaths(query)
  if (inputPaths.length > 0) return inputPaths

  const textPath = stripFileHashCommand(rawText)
  return textPath ? [textPath] : []
}

export function resolveFileBase64Path(rawText: string, query: TuffQuery): string | null {
  const inputPaths = resolveFilesInputPaths(query)
  if (inputPaths.length === 1) return inputPaths[0] ?? null
  if (inputPaths.length > 1) return null

  const textPath = stripFileBase64Command(rawText)
  return textPath || null
}

export function resolveFilePathTarget(rawText: string, query: TuffQuery): string | null {
  const inputPath = resolveFirstFilesInputPath(query)
  if (inputPath) return inputPath

  const textPath = stripFilePathCommand(rawText)
  return textPath || null
}

export function createFilePathInfo(filePath: string): QuickOpsFilePathInfo {
  return {
    path: filePath,
    fileName: getFilePathDisplayName(filePath),
    shellPath: escapeShellPath(filePath),
    fileUrl: pathToFileURL(filePath).href,
    windowsPath: convertWslPathToWindowsPath(filePath),
    wslPath: convertWindowsPathToWslPath(filePath)
  }
}

export function resolveCommonDirectory(text: string): QuickOpsCommonDirectoryInfo {
  const directory =
    COMMON_DIRECTORY_DEFINITIONS.find((item) => matchesKeyword(text, item.aliases)) ??
    COMMON_DIRECTORY_DEFINITIONS[0]

  return {
    id: directory.id,
    title: directory.title,
    subtitle: directory.subtitle,
    path: app.getPath(directory.appPathName)
  }
}

export async function findRecentDownloadFile(): Promise<
  QuickOpsRecentDownloadInfo | QuickOpsDegradedResult
> {
  const downloadsPath = app.getPath('downloads')
  try {
    const entries = await readdir(downloadsPath, { withFileTypes: true })
    const files: QuickOpsRecentDownloadInfo[] = []

    for (const entry of entries) {
      if (!entry.isFile()) continue

      const filePath = path.join(downloadsPath, entry.name)
      const fileInfo = await stat(filePath)
      if (!fileInfo.isFile()) continue

      files.push({
        path: filePath,
        fileName: entry.name,
        size: fileInfo.size,
        modifiedAt: fileInfo.mtimeMs
      })
    }

    files.sort((left, right) => right.modifiedAt - left.modifiedAt)
    const latest = files[0]
    if (!latest) {
      return {
        degradedReason: 'recent-download-empty',
        message: 'Downloads 目录没有可打开的普通文件'
      }
    }

    return latest
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    return {
      degradedReason:
        code === 'EACCES' || code === 'EPERM'
          ? 'recent-download-permission-denied'
          : 'recent-download-read-failed',
      message:
        code === 'EACCES' || code === 'EPERM'
          ? '没有权限读取 Downloads 目录'
          : '无法读取 Downloads 目录'
    }
  }
}

export async function prepareRecentDownloadMove(
  targetDirectory: string
): Promise<QuickOpsRecentDownloadMoveInfo | QuickOpsDegradedResult> {
  const normalizedTargetDirectory = targetDirectory.trim()
  if (!normalizedTargetDirectory || !path.isAbsolute(normalizedTargetDirectory)) {
    return {
      degradedReason: 'recent-download-move-invalid-target',
      message: '目标目录必须是绝对路径'
    }
  }

  const latest = await findRecentDownloadFile()
  if ('degradedReason' in latest) return latest

  try {
    const directoryInfo = await stat(normalizedTargetDirectory)
    if (!directoryInfo.isDirectory()) {
      return {
        degradedReason: 'recent-download-move-target-not-directory',
        message: '目标路径不是目录'
      }
    }

    const targetPath = path.join(normalizedTargetDirectory, latest.fileName)
    try {
      await stat(targetPath)
      return {
        degradedReason: 'recent-download-move-target-exists',
        message: '目标目录中已存在同名文件'
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        return {
          degradedReason: 'recent-download-move-target-check-failed',
          message: '无法检查目标路径'
        }
      }
    }

    return {
      ...latest,
      targetDirectory: normalizedTargetDirectory,
      targetPath
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    return {
      degradedReason:
        code === 'ENOENT'
          ? 'recent-download-move-target-missing'
          : code === 'EACCES' || code === 'EPERM'
            ? 'recent-download-move-target-permission-denied'
            : 'recent-download-move-target-read-failed',
      message:
        code === 'ENOENT'
          ? '目标目录不存在'
          : code === 'EACCES' || code === 'EPERM'
            ? '没有权限读取目标目录'
            : '无法读取目标目录'
    }
  }
}

export async function moveRecentDownloadFile(
  sourcePath: string,
  targetPath: string
): Promise<{ path: string; targetPath: string } | QuickOpsDegradedResult> {
  if (!sourcePath || !targetPath || !path.isAbsolute(sourcePath) || !path.isAbsolute(targetPath)) {
    return {
      degradedReason: 'recent-download-move-invalid-path',
      message: '移动路径无效'
    }
  }

  if (!isPathInsideDirectory(sourcePath, app.getPath('downloads'))) {
    return {
      degradedReason: 'recent-download-move-source-outside-downloads',
      message: '源文件不在 Downloads 目录内'
    }
  }

  try {
    const sourceInfo = await stat(sourcePath)
    if (!sourceInfo.isFile()) {
      return {
        degradedReason: 'recent-download-move-source-not-file',
        message: '源路径不是普通文件'
      }
    }

    const targetDirectory = path.dirname(targetPath)
    const targetDirectoryInfo = await stat(targetDirectory)
    if (!targetDirectoryInfo.isDirectory()) {
      return {
        degradedReason: 'recent-download-move-target-not-directory',
        message: '目标路径不是目录'
      }
    }

    try {
      await stat(targetPath)
      return {
        degradedReason: 'recent-download-move-target-exists',
        message: '目标目录中已存在同名文件'
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        return {
          degradedReason: 'recent-download-move-target-check-failed',
          message: '无法检查目标路径'
        }
      }
    }

    await rename(sourcePath, targetPath)
    return {
      path: sourcePath,
      targetPath
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    return {
      degradedReason:
        code === 'ENOENT'
          ? 'recent-download-move-source-missing'
          : code === 'EACCES' || code === 'EPERM'
            ? 'recent-download-move-permission-denied'
            : 'recent-download-move-failed',
      message:
        code === 'ENOENT'
          ? '源文件不存在'
          : code === 'EACCES' || code === 'EPERM'
            ? '没有权限移动文件'
            : '移动文件失败'
    }
  }
}

function isPathInsideDirectory(filePath: string, directoryPath: string): boolean {
  const relative = path.relative(directoryPath, filePath)
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

export function formatFileHashBatchInfo(info: QuickOpsFileHashBatchInfo): string {
  return info.files
    .map((file) =>
      [
        `${file.fileName}`,
        `Path: ${file.path}`,
        `Size: ${formatFileSize(file.size)}`,
        `MD5 ${file.md5}`,
        `SHA1 ${file.sha1}`,
        `SHA256 ${file.sha256}`
      ].join('\n')
    )
    .join('\n\n')
}

export function formatFileBase64BatchInfo(info: QuickOpsFileBase64BatchInfo): string {
  return info.files
    .map((file) =>
      [
        `${file.fileName}`,
        `Path: ${file.path}`,
        `Size: ${formatFileSize(file.size)}`,
        file.base64
      ].join('\n')
    )
    .join('\n\n')
}

export async function computeFileHashes(filePath: string): Promise<
  | QuickOpsFileHashInfo
  | {
      degradedReason: string
      message: string
    }
> {
  try {
    const info = await stat(filePath)
    if (!info.isFile()) {
      return {
        degradedReason: 'file-hash-not-file',
        message: '目标不是普通文件'
      }
    }

    const buffer = await readFile(filePath)
    return {
      path: filePath,
      fileName: path.basename(filePath) || filePath,
      size: info.size,
      md5: createHash('md5').update(buffer).digest('hex'),
      sha1: createHash('sha1').update(buffer).digest('hex'),
      sha256: createHash('sha256').update(buffer).digest('hex')
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    return {
      degradedReason:
        code === 'ENOENT'
          ? 'file-hash-file-missing'
          : code === 'EACCES' || code === 'EPERM'
            ? 'file-hash-permission-denied'
            : 'file-hash-read-failed',
      message:
        code === 'ENOENT'
          ? '文件不存在'
          : code === 'EACCES' || code === 'EPERM'
            ? '没有权限读取文件'
            : '读取文件失败'
    }
  }
}

export async function computeFileHashBatch(filePaths: string[]): Promise<
  | QuickOpsFileHashBatchInfo
  | {
      degradedReason: string
      message: string
      path?: string
    }
> {
  const files: QuickOpsFileHashInfo[] = []

  for (const filePath of filePaths) {
    const result = await computeFileHashes(filePath)
    if ('degradedReason' in result) {
      return {
        degradedReason: result.degradedReason,
        message: result.message,
        path: filePath
      }
    }
    files.push(result)
  }

  return {
    files,
    totalSize: files.reduce((sum, file) => sum + file.size, 0)
  }
}

export async function encodeFileBase64(filePath: string): Promise<
  | QuickOpsFileBase64Info
  | {
      degradedReason: string
      message: string
    }
> {
  try {
    const info = await stat(filePath)
    if (!info.isFile()) {
      return {
        degradedReason: 'file-base64-not-file',
        message: '目标不是普通文件'
      }
    }

    if (info.size > FILE_BASE64_MAX_BYTES) {
      return {
        degradedReason: 'file-base64-too-large',
        message: `文件超过 ${formatFileSize(FILE_BASE64_MAX_BYTES)} 上限`
      }
    }

    const buffer = await readFile(filePath)
    return {
      path: filePath,
      fileName: path.basename(filePath) || filePath,
      size: info.size,
      base64: buffer.toString('base64')
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    return {
      degradedReason:
        code === 'ENOENT'
          ? 'file-base64-file-missing'
          : code === 'EACCES' || code === 'EPERM'
            ? 'file-base64-permission-denied'
            : 'file-base64-read-failed',
      message:
        code === 'ENOENT'
          ? '文件不存在'
          : code === 'EACCES' || code === 'EPERM'
            ? '没有权限读取文件'
            : '读取文件失败'
    }
  }
}

export async function encodeFileBase64Batch(filePaths: string[]): Promise<
  | QuickOpsFileBase64BatchInfo
  | {
      degradedReason: string
      message: string
      path?: string
    }
> {
  const files: QuickOpsFileBase64Info[] = []

  for (const filePath of filePaths) {
    const result = await encodeFileBase64(filePath)
    if ('degradedReason' in result) {
      return {
        degradedReason: result.degradedReason,
        message: result.message,
        path: filePath
      }
    }
    files.push(result)
  }

  return {
    files,
    totalSize: files.reduce((sum, file) => sum + file.size, 0)
  }
}

export async function decodeFileBase64ToTempFile(input: string): Promise<
  | QuickOpsFileBase64DecodeInfo
  | {
      degradedReason: string
      message: string
    }
> {
  const normalized = input.replace(/\s+/g, '')
  if (!normalized) {
    return {
      degradedReason: 'file-base64-decode-missing-input',
      message: '未找到要解码的 Base64 内容'
    }
  }

  if (!isValidBase64Payload(normalized)) {
    return {
      degradedReason: 'file-base64-decode-invalid-input',
      message: 'Base64 内容格式无效'
    }
  }

  const buffer = Buffer.from(normalized, 'base64')
  if (
    buffer.length === 0 ||
    buffer.toString('base64').replace(/=+$/, '') !== normalized.replace(/=+$/, '')
  ) {
    return {
      degradedReason: 'file-base64-decode-invalid-input',
      message: 'Base64 内容格式无效'
    }
  }

  if (buffer.length > FILE_BASE64_MAX_BYTES) {
    return {
      degradedReason: 'file-base64-decode-too-large',
      message: `解码后文件超过 ${formatFileSize(FILE_BASE64_MAX_BYTES)} 上限`
    }
  }

  try {
    const outputDir = path.join(app.getPath('temp'), 'tuff-quickops')
    await mkdir(outputDir, { recursive: true })
    const outputPath = path.join(
      outputDir,
      `base64-${Date.now()}-${FILE_BASE64_DECODE_OUTPUT_NAME}`
    )
    await writeFile(outputPath, buffer, { flag: 'wx' })
    return {
      path: outputPath,
      fileName: path.basename(outputPath),
      size: buffer.length
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    return {
      degradedReason:
        code === 'EACCES' || code === 'EPERM'
          ? 'file-base64-decode-permission-denied'
          : 'file-base64-decode-write-failed',
      message: code === 'EACCES' || code === 'EPERM' ? '没有权限写入临时文件' : '写入临时文件失败'
    }
  }
}

export async function createTempTextFile(input: string): Promise<
  | QuickOpsTempTextFileInfo
  | {
      degradedReason: string
      message: string
    }
> {
  const content = input.trim() || 'Tuff QuickOps scratch note\n'
  const size = Buffer.byteLength(content, 'utf8')
  if (size > TEMP_TEXT_FILE_MAX_BYTES) {
    return {
      degradedReason: 'temp-text-file-too-large',
      message: `临时文本超过 ${formatFileSize(TEMP_TEXT_FILE_MAX_BYTES)} 上限`
    }
  }

  try {
    const outputDir = await ensureQuickOpsTempDir()
    const outputPath = path.join(outputDir, `scratch-${Date.now()}.txt`)
    await writeFile(outputPath, content, { flag: 'wx' })
    return {
      path: outputPath,
      fileName: path.basename(outputPath),
      size
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    return {
      degradedReason:
        code === 'EACCES' || code === 'EPERM'
          ? 'temp-text-file-permission-denied'
          : 'temp-text-file-write-failed',
      message: code === 'EACCES' || code === 'EPERM' ? '没有权限写入临时文件' : '写入临时文件失败'
    }
  }
}

export async function createTempDirectory(input: string): Promise<
  | QuickOpsTempDirectoryInfo
  | {
      degradedReason: string
      message: string
    }
> {
  try {
    const outputDir = await ensureQuickOpsTempDir()
    const directoryName = sanitizeTempDirectoryName(input) || `scratch-${Date.now()}`
    const outputPath = path.join(outputDir, directoryName)
    await mkdir(outputPath, { recursive: false })
    return {
      path: outputPath,
      directoryName
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    return {
      degradedReason:
        code === 'EACCES' || code === 'EPERM'
          ? 'temp-directory-permission-denied'
          : 'temp-directory-create-failed',
      message: code === 'EACCES' || code === 'EPERM' ? '没有权限创建临时目录' : '创建临时目录失败'
    }
  }
}

async function ensureQuickOpsTempDir(): Promise<string> {
  const outputDir = path.join(app.getPath('temp'), 'tuff-quickops')
  await mkdir(outputDir, { recursive: true })
  return outputDir
}

function sanitizeTempDirectoryName(input: string): string {
  return input
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

function isValidBase64Payload(value: string): boolean {
  return value.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(value)
}

function parseFilesInput(raw: string): string[] {
  const trimmed = raw.trim()
  if (!trimmed) return []

  if (trimmed.startsWith('[') || trimmed.startsWith('"')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === 'string')
      }
      if (typeof parsed === 'string') return [parsed]
    } catch {
      return []
    }
  }

  return [trimmed]
}

function resolveFirstFilesInputPath(query: TuffQuery): string | null {
  return resolveFilesInputPaths(query)[0] ?? null
}

function resolveFilesInputPaths(query: TuffQuery): string[] {
  const fileInputs = query.inputs?.filter((input) => input.type === TuffInputType.Files) ?? []
  for (const input of fileInputs) {
    const paths = parseFilesInput(input.content)
    const selected = paths.filter((item) => item.trim())
    if (selected.length > 0) return selected
  }
  return []
}

function stripFileHashCommand(rawText: string): string {
  const text = rawText.trim()
  const fileHashCommandPattern =
    /^(?:file\s+hash|hash\s+file|hash|checksum|sha256|sha1|md5|文件\s*hash|计算\s*hash|校验和)(?=\s|:|：|-|$)/i
  const match = fileHashCommandPattern.exec(text)
  if (!match) return ''

  return stripCommandSeparators(text.slice(match[0].length))
}

function stripFileBase64Command(rawText: string): string {
  const text = rawText.trim()
  const fileBase64CommandPattern =
    /^(?:file\s+base64|base64\s+file|base64\s+encode\s+file|encode\s+file\s+base64|文件\s*base64|base64\s*文件|base64编码文件|文件转\s*base64)(?=\s|:|：|-|$)/i
  const match = fileBase64CommandPattern.exec(text)
  if (!match) return ''

  return stripCommandSeparators(text.slice(match[0].length))
}

function stripFilePathCommand(rawText: string): string {
  const text = rawText.trim()
  const filePathCommandPattern =
    /^(?:copy\s+file\s+path|copy\s+path|file\s+path|path\s+format|复制文件路径|复制路径|文件路径|路径格式)(?=\s|:|：|-|$)/i
  const match = filePathCommandPattern.exec(text)
  if (!match) return ''

  return stripCommandSeparators(text.slice(match[0].length))
}

function stripCommandSeparators(value: string): string {
  const stripped = value.replace(/^(?::|：|-|->)?\s*/, '').trim()
  if (
    (stripped.startsWith('"') && stripped.endsWith('"')) ||
    (stripped.startsWith("'") && stripped.endsWith("'"))
  ) {
    return stripped.slice(1, -1)
  }
  return stripped
}

function escapeShellPath(filePath: string): string {
  return `'${filePath.replace(/'/g, "'\\''")}'`
}

function getFilePathDisplayName(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  return path.posix.basename(normalized) || filePath
}

function convertWindowsPathToWslPath(filePath: string): string | undefined {
  const match = /^([a-zA-Z]):[\\/](.*)$/.exec(filePath)
  if (!match) return undefined

  const drive = match[1].toLowerCase()
  const rest = match[2].replace(/\\/g, '/')
  return `/mnt/${drive}/${rest}`
}

function convertWslPathToWindowsPath(filePath: string): string | undefined {
  const match = /^\/mnt\/([a-zA-Z])(?:\/(.*))?$/.exec(filePath)
  if (!match) return undefined

  const drive = match[1].toUpperCase()
  const rest = match[2]?.replace(/\//g, '\\') ?? ''
  return rest ? `${drive}:\\${rest}` : `${drive}:\\`
}

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = size / 1024
  for (const unit of units) {
    if (value < 1024) return `${value.toFixed(value >= 10 ? 1 : 2)} ${unit}`
    value /= 1024
  }
  return `${value.toFixed(1)} PB`
}
