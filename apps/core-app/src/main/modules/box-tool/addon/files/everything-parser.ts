import path from 'node:path'

export interface EverythingSearchResult {
  path: string
  name: string
  extension: string
  size: number
  mtime: Date
  ctime: Date
  isDir: boolean
}

function usesWindowsSeparators(filePath: string): boolean {
  return filePath.includes('\\')
}

function basenameForResult(filePath: string): string {
  return usesWindowsSeparators(filePath) ? path.win32.basename(filePath) : path.basename(filePath)
}

function extnameForResult(filePath: string): string {
  return usesWindowsSeparators(filePath) ? path.win32.extname(filePath) : path.extname(filePath)
}

function joinForResult(dirPath: string, name: string): string {
  return usesWindowsSeparators(dirPath) ? path.win32.join(dirPath, name) : path.join(dirPath, name)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function parseEverythingCsvLine(line: string): string[] {
  const parts: string[] = []
  let current = ''
  let inQuotes = false

  for (let index = 0; index < line.length; index++) {
    const char = line[index]
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"'
        index++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      parts.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  parts.push(current.trim())
  return parts
}

export function toEverythingResultDate(value: unknown): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(value > 1_000_000_000_000 ? value : value * 1000)
    return Number.isNaN(date.getTime()) ? new Date(0) : date
  }
  if (typeof value === 'string') {
    const numericValue = Number(value)
    if (Number.isFinite(numericValue)) {
      const numericDate = new Date(
        numericValue > 1_000_000_000_000 ? numericValue : numericValue * 1000
      )
      if (!Number.isNaN(numericDate.getTime())) return numericDate
    }
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  return new Date(0)
}

export function parseEverythingCliOutput(output: string): EverythingSearchResult[] {
  const results: EverythingSearchResult[] = []
  for (const line of output
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean)) {
    const parts = parseEverythingCsvLine(line)
    if (parts.length < 4) continue
    const [filePath, sizeStr, mtimeStr, ctimeStr] = parts
    if (!filePath) continue
    results.push({
      path: filePath,
      name: basenameForResult(filePath),
      extension: extnameForResult(filePath).toLowerCase().replace(/^\./, ''),
      size: Number.parseInt(sizeStr, 10) || 0,
      mtime: toEverythingResultDate(mtimeStr),
      ctime: toEverythingResultDate(ctimeStr),
      isDir: false
    })
  }
  return results
}

export function parseEverythingSdkOutput(rawResults: unknown): EverythingSearchResult[] {
  if (!Array.isArray(rawResults)) return []
  const results: EverythingSearchResult[] = []
  for (const entry of rawResults) {
    if (!isRecord(entry)) continue
    const pathValue =
      typeof entry.fullPath === 'string'
        ? entry.fullPath
        : typeof entry.path === 'string'
          ? entry.path
          : ''
    const nameValue =
      typeof entry.name === 'string'
        ? entry.name
        : typeof entry.filename === 'string'
          ? entry.filename
          : ''
    const filePath = pathValue
      ? nameValue && basenameForResult(pathValue).toLowerCase() !== nameValue.toLowerCase()
        ? joinForResult(pathValue, nameValue)
        : pathValue
      : nameValue
    if (!filePath) continue
    const name = nameValue || basenameForResult(filePath)
    const extension = typeof entry.extension === 'string' ? entry.extension : extnameForResult(name)
    const size =
      typeof entry.size === 'number'
        ? entry.size
        : typeof entry.fileSize === 'number'
          ? entry.fileSize
          : 0
    results.push({
      path: filePath,
      name,
      extension: extension.toLowerCase().replace(/^\./, ''),
      size,
      mtime: toEverythingResultDate(entry.mtime ?? entry.dateModified ?? entry.modifiedAt),
      ctime: toEverythingResultDate(entry.ctime ?? entry.dateCreated ?? entry.createdAt),
      isDir:
        entry.isFolder === true ||
        entry.isDirectory === true ||
        entry.type === 'folder' ||
        entry.kind === 'folder'
    })
  }
  return results
}

export function buildEverythingQuery(searchText: string): string {
  return searchText.trim()
}

export function parseEverythingVersion(output: string): string | null {
  return output.match(/(\d+\.)+\d+/)?.[0] ?? null
}

export function isEverythingCliProbeOutput(
  esPath: string,
  output: string,
  version: string | null
): boolean {
  return (
    path.basename(esPath).toLowerCase() === 'es.exe' &&
    (Boolean(version) || /\bES\b/i.test(output) || /Everything/i.test(output))
  )
}
