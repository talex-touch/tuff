import fs from 'node:fs/promises'

const STRINGS_ENTRY_REGEX = /"((?:\\.|[^"\\])*)"\s*=\s*"((?:\\.|[^"\\])*)"\s*;/g

function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

function decodeUtf16Be(buffer: Buffer): string {
  if (buffer.length === 0) return ''
  const evenLength = buffer.length - (buffer.length % 2)
  const swapped = Buffer.allocUnsafe(evenLength)
  for (let index = 0; index < evenLength; index += 2) {
    swapped[index] = buffer[index + 1]
    swapped[index + 1] = buffer[index]
  }
  return swapped.toString('utf16le')
}

function detectUtf16WithoutBom(buffer: Buffer): 'le' | 'be' | null {
  if (buffer.length < 4) return null
  const limit = Math.min(buffer.length - 1, 256)
  let evenZeroCount = 0
  let oddZeroCount = 0
  let pairCount = 0
  for (let index = 0; index < limit; index += 2) {
    if (buffer[index] === 0) evenZeroCount += 1
    if (buffer[index + 1] === 0) oddZeroCount += 1
    pairCount += 1
  }

  if (pairCount === 0) return null
  const evenZeroRatio = evenZeroCount / pairCount
  const oddZeroRatio = oddZeroCount / pairCount

  if (oddZeroRatio >= 0.3 && oddZeroRatio > evenZeroRatio) return 'le'
  if (evenZeroRatio >= 0.3 && evenZeroRatio > oddZeroRatio) return 'be'
  return null
}

function decodeEscapedString(value: string): string {
  return value
    .replace(/\\U([0-9a-fA-F]{4,8})/g, (_match, hex: string) => {
      const codePoint = Number.parseInt(hex, 16)
      if (Number.isNaN(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
        return _match
      }
      return String.fromCodePoint(codePoint)
    })
    .replace(/\\u([0-9a-fA-F]{4})/g, (_match, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16))
    )
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
}

export function decodeLocalizedStringsBuffer(buffer: Buffer): string {
  if (buffer.length === 0) return ''

  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.slice(2).toString('utf16le')
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return decodeUtf16Be(buffer.slice(2))
  }
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.slice(3).toString('utf8')
  }

  const guessedUtf16 = detectUtf16WithoutBom(buffer)
  if (guessedUtf16 === 'le') {
    return buffer.toString('utf16le')
  }
  if (guessedUtf16 === 'be') {
    return decodeUtf16Be(buffer)
  }

  return buffer.toString('utf8')
}

export function parseLocalizedStringsContent(content: string): Record<string, string> {
  const result: Record<string, string> = {}
  const normalizedContent = stripComments(content).replace(/^\uFEFF/, '')
  STRINGS_ENTRY_REGEX.lastIndex = 0

  let match: RegExpExecArray | null
  while ((match = STRINGS_ENTRY_REGEX.exec(normalizedContent))) {
    const rawKey = match[1]
    const rawValue = match[2]
    const key = decodeEscapedString(rawKey)
    if (!key) continue
    result[key] = decodeEscapedString(rawValue)
  }

  return result
}

export async function readLocalizedStringsFile(filePath: string): Promise<Record<string, string>> {
  const buffer = await fs.readFile(filePath)
  const content = decodeLocalizedStringsBuffer(buffer)
  return parseLocalizedStringsContent(content)
}
