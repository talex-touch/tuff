import type { ITuffTransport } from '@talex-touch/utils/transport'
import { networkClient } from '@talex-touch/utils/network'
import { AppEvents } from '@talex-touch/utils/transport/events'

export const TEXT_ENCODING_OPTIONS = [
  'auto',
  'utf-8',
  'gb18030',
  'big5',
  'shift_jis',
  'euc-kr',
  'utf-16le',
  'utf-16be',
  'windows-1252'
] as const

export type TextEncodingSelection = (typeof TEXT_ENCODING_OPTIONS)[number]
export type TextEncoding = Exclude<TextEncodingSelection, 'auto'>

export interface DecodedText {
  text: string
  encoding: TextEncoding
  detectedEncoding: TextEncoding
}

function asBytes(value: ArrayBuffer | Uint8Array): Uint8Array {
  return value instanceof Uint8Array ? value : new Uint8Array(value)
}

/**
 * The first `maxBytes` of a previewed file, as raw bytes.
 *
 * In Electron it goes through `AppEvents.system.readFile` with `encoding: 'base64'`: replies cross
 * IPC as JSON, which turns an `ArrayBuffer` into `{}`, so the bytes travel as base64 and are
 * decoded here. The same handler authorizes the read through the preview's tfile grant.
 */
export async function readPreviewBytes(
  transport: ITuffTransport | null,
  source: string,
  maxBytes: number,
  timeoutMs: number
): Promise<Uint8Array> {
  if (transport) {
    const encoded = await transport.send(AppEvents.system.readFile, {
      source,
      encoding: 'base64',
      maxBytes,
      timeoutMs
    })
    const binary = atob(encoded)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    return bytes
  }
  // Outside Electron there is no bounded read to ask for, so the head is cut from the whole file.
  return new Uint8Array(await networkClient.readBinary(source, { timeoutMs })).subarray(0, maxBytes)
}

function strictDecode(bytes: Uint8Array, encoding: TextEncoding): string | null {
  try {
    return new TextDecoder(encoding, { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}

function utf8SequenceLength(value: number): number {
  if (value >= 0xc2 && value <= 0xdf) return 2
  if (value >= 0xe0 && value <= 0xef) return 3
  if (value >= 0xf0 && value <= 0xf4) return 4
  return 0
}

/**
 * A capped read can end between UTF-8 code-unit bytes. Treat that tail as truncation rather than
 * making an otherwise valid UTF-8 file fall through to a legacy decoder.
 */
function utf8WithoutIncompleteTail(bytes: Uint8Array): Uint8Array | null {
  const maxTrim = Math.min(3, bytes.byteLength)
  for (let trim = 1; trim <= maxTrim; trim += 1) {
    const prefix = bytes.subarray(0, bytes.byteLength - trim)
    const suffix = bytes.subarray(bytes.byteLength - trim)
    const expected = utf8SequenceLength(suffix[0] ?? 0)
    if (!expected || suffix.byteLength >= expected) continue
    if (!suffix.subarray(1).every((value) => value >= 0x80 && value <= 0xbf)) continue
    if (strictDecode(prefix, 'utf-8') !== null) return prefix
  }
  return null
}

const LEGACY_BY_LOCALE: Record<string, readonly TextEncoding[]> = {
  zh: ['gb18030', 'big5', 'shift_jis', 'euc-kr', 'utf-16le', 'utf-16be', 'windows-1252'],
  ja: ['shift_jis', 'gb18030', 'big5', 'euc-kr', 'utf-16le', 'utf-16be', 'windows-1252'],
  ko: ['euc-kr', 'gb18030', 'big5', 'shift_jis', 'utf-16le', 'utf-16be', 'windows-1252'],
  default: ['windows-1252', 'gb18030', 'big5', 'shift_jis', 'euc-kr', 'utf-16le', 'utf-16be']
}

export function detectTextEncoding(value: ArrayBuffer | Uint8Array, locale = ''): TextEncoding {
  const bytes = asBytes(value)
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return 'utf-8'
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le'
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be'

  if (strictDecode(bytes, 'utf-8') !== null || utf8WithoutIncompleteTail(bytes)) return 'utf-8'

  const language = locale.trim().toLowerCase().split(/[-_]/, 1)[0] || 'default'
  const candidates = LEGACY_BY_LOCALE[language] ?? LEGACY_BY_LOCALE.default
  // A capped read can also split a two-byte GBK/Big5/Shift_JIS character, so each legacy
  // candidate gets one try without the final byte as well.
  const withoutLastByte = bytes.subarray(0, Math.max(0, bytes.byteLength - 1))
  for (const encoding of candidates) {
    if (
      strictDecode(bytes, encoding) !== null ||
      strictDecode(withoutLastByte, encoding) !== null
    ) {
      return encoding
    }
  }

  return candidates[0] ?? 'windows-1252'
}

export function decodeTextBytes(value: ArrayBuffer | Uint8Array, encoding: TextEncoding): string {
  const bytes = asBytes(value)
  const decodeBytes = encoding === 'utf-8' ? (utf8WithoutIncompleteTail(bytes) ?? bytes) : bytes
  return new TextDecoder(encoding).decode(decodeBytes)
}

export function decodeText(
  value: ArrayBuffer | Uint8Array,
  selection: TextEncodingSelection,
  locale = ''
): DecodedText {
  const detectedEncoding = detectTextEncoding(value, locale)
  const encoding = selection === 'auto' ? detectedEncoding : selection
  return { encoding, detectedEncoding, text: decodeTextBytes(value, encoding) }
}
