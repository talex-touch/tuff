import { pinyinOfHan, tokenFor, type TokenScript } from './tokens'
import { utf8Length } from './policy'

export interface NameParts {
  style: string
  serial: number
  /** Canonical lowercase extension this name was built from. */
  baseExt: string
  /** Name without the final extension, exactly the bytes used to create the file. */
  stem: string
  /** Final extension as written (case preserved), without the dot. */
  ext: string
  name: string
  token: string
  /** Offset of the token inside `stem` (UTF-16 units). */
  tokenStart: number
  /** The token is a word of its own: bounded by non-alphanumerics or the name's edges. */
  delimited: boolean
  script: TokenScript
  pinyin: { full: string; initials: string } | null
}

export interface NameInput {
  style: string
  serial: number
  seed: number
  /** Lowercase canonical extension; the style may change its case. */
  ext: string
  /** Position inside a burst; 0 is the plain name. */
  variant?: number
  /** Bytes a later edit (hidden prefix, .bak suffix) will add; only the 255-byte style needs room for them. */
  reserve?: number
}

const WORDS = [
  'harbor',
  'sunset',
  'invoice',
  'recipe',
  'garden',
  'report',
  'poster',
  'wallpaper',
  'receipt',
  'diagram',
  'holiday',
  'portrait',
  'banner',
  'mockup',
  'logo',
  'avatar',
  'ticket',
  'map',
  'chart',
  'lantern',
  'meadow',
  'orchard',
  'summit',
  'canyon',
  'violet',
  'marble',
  'copper'
]
const ACCENTED = [
  'café',
  'crème',
  'façade',
  'naïve',
  'über',
  'jalapeño',
  'Zoë',
  'señor',
  'piñata',
  'fiancée'
]
const HAN_S = ['风景', '照片', '图片', '截图', '文档', '报告', '海报', '壁纸']
const HAN_T = ['風景', '相片', '圖片', '截圖', '文件', '報告', '海報', '桌布']
const KANA_WORDS = ['写真', '画像', '風景', '資料']
const HANGUL_WORDS = ['사진', '이미지', '풍경', '자료']
const EMOJI = ['🌅', '📸', '🎨', '🐱', '🍜', '🚀', '☕', '🌸']
const INNER_EXTENSIONS = ['final', 'copy', 'edit', 'v2']

const STYLE_SCRIPT: Record<string, TokenScript> = {
  'han-simplified': 'han-s',
  'han-traditional': 'han-t',
  japanese: 'ja',
  korean: 'ko',
  'rtl-arabic': 'ar',
  'rtl-hebrew': 'he'
}
const ARABIC_WORD = 'صورة'
const HEBREW_WORD = 'תמונה'
const BASE_TIME = Date.UTC(2026, 9, 30, 6, 17, 3)

const pad = (value: number, width = 2): string => String(value).padStart(width, '0')

function clock(serial: number): {
  date: string
  time: string
  compact: string
  h12: number
  pm: boolean
  minutes: string
  seconds: string
} {
  const at = new Date(BASE_TIME + serial * 37_000)
  const date = `${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())}`
  const minutes = pad(at.getUTCMinutes())
  const seconds = pad(at.getUTCSeconds())
  const hour = at.getUTCHours()
  return {
    date,
    time: `${pad(hour)}.${minutes}.${seconds}`,
    compact: `${date.replace(/-/g, '')}${pad(hour)}${minutes}${seconds}`,
    h12: hour % 12 === 0 ? 12 : hour % 12,
    pm: hour >= 12,
    minutes,
    seconds
  }
}

function mixedCase(value: string): string {
  return Array.from(value, (char, index) =>
    index % 2 === 0 ? char.toUpperCase() : char.toLowerCase()
  ).join('')
}

function fullWidth(value: string): string {
  return Array.from(value, (char) => {
    const code = char.charCodeAt(0)
    return code >= 0x21 && code <= 0x7e ? String.fromCharCode(code + 0xfee0) : char
  }).join('')
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function longStem(token: string, ext: string, serial: number, reserve: number): string {
  const limit = 255 - reserve
  let stem = token
  for (let index = 0; utf8Length(`${stem}.${ext}`) < limit; index += 1) {
    stem += `-${WORDS[(serial + index * 5) % WORDS.length]}`
  }
  stem = stem.slice(0, limit - ext.length - 1)
  return stem.endsWith('-') ? `${stem.slice(0, -1)}x` : stem
}

interface Built {
  stem: string
  ext: string
  delimited: boolean
}

function buildStem(input: NameInput, token: string): Built {
  const { style, serial, seed, ext } = input
  const word = WORDS[(serial * 7 + seed) % WORDS.length] as string
  const other = WORDS[(serial * 11 + 3 + (seed >>> 3)) % WORDS.length] as string
  const second = other === word ? (WORDS[(serial * 11 + 4) % WORDS.length] as string) : other
  const when = clock(serial)
  const keep = (stem: string, delimited: boolean, written = ext): Built => ({
    stem,
    ext: written,
    delimited
  })
  switch (style) {
    case 'ascii-lower':
      return keep(`${token}${word}`, false)
    case 'ascii-upper':
      return keep(`${token}${word}`.toUpperCase(), false)
    case 'ascii-mixed':
      return keep(`${capitalize(token)}${capitalize(word)}`, false)
    case 'digits':
      return keep(`${when.compact}${token}`, false)
    case 'spaces':
      return keep(`${token} ${word} ${second}`, true)
    case 'dots':
      return keep(`${token}.${word}.${second}`, true)
    case 'dashes':
      return keep(`${token}-${word}-${second}`, true)
    case 'underscores':
      return keep(`${token}_${word}_${second}`, true)
    case 'parens':
      return keep(`${word} (${token})`, true)
    case 'brackets':
      return keep(`[${token}] ${word}`, true)
    case 'long-255':
      return keep(longStem(token, ext, serial, input.reserve ?? 0), true)
    case 'han-simplified':
      return keep(`${token}${HAN_S[serial % HAN_S.length]}`, false)
    case 'han-traditional':
      return keep(`${token}${HAN_T[serial % HAN_T.length]}`, false)
    case 'japanese':
      return keep(`${token}${KANA_WORDS[serial % KANA_WORDS.length]}`, false)
    case 'korean':
      return keep(`${token}${HANGUL_WORDS[serial % HANGUL_WORDS.length]}`, false)
    case 'accented-latin':
      return keep(
        `${token} ${ACCENTED[serial % ACCENTED.length]} ${ACCENTED[(serial + 3) % ACCENTED.length]}`,
        true
      )
    case 'nfc-accent':
      return keep(`${token} résumé`.normalize('NFC'), true)
    case 'nfd-accent':
      return keep(`${token} résumé`.normalize('NFD'), true)
    case 'emoji':
      return keep(`${token} ${EMOJI[serial % EMOJI.length]}`, true)
    case 'fullwidth':
      return keep(fullWidth(`${token}${word}`), false)
    case 'rtl-arabic':
      return keep(`${token} ${ARABIC_WORD}`, true)
    case 'rtl-hebrew':
      return keep(`${token} ${HEBREW_WORD}`, true)
    case 'screenshot-macos-24h':
      return keep(`Screenshot ${when.date} at ${when.time} ${token}`, true)
    case 'screenshot-macos-12h':
      return keep(
        `Screenshot ${when.date} at ${when.h12}.${when.minutes}.${when.seconds}\u202f${when.pm ? 'PM' : 'AM'} ${token}`,
        true
      )
    case 'pixpin':
      return keep(`PixPin_${when.date}_${when.time.replace(/\./g, '-')}_${token}`, true)
    case 'screenshot-cn':
      return keep(`截屏${when.date} ${when.time} ${token}`, true)
    case 'wechat':
      return keep(`微信图片_${when.compact}_${token}`, true)
    case 'iphone-img':
      return keep(`IMG_${1000 + (serial % 9000)}_${token}`, true, ext.toUpperCase())
    case 'upper-ext':
      return keep(`${token}-${word}`, true, ext.toUpperCase())
    case 'mixed-ext':
      return keep(`${token}-${word}`, true, mixedCase(ext))
    case 'double-ext':
      return keep(`${token}-${word}.${INNER_EXTENSIONS[serial % INNER_EXTENSIONS.length]}`, true)
    default:
      throw new Error(`unknown name style: ${style}`)
  }
}

export function scriptOf(style: string): TokenScript {
  return STYLE_SCRIPT[style] ?? 'latin'
}

function fitVariant(stem: string, ext: string, variant: number): string {
  if (variant === 0) return stem
  const suffix = `-${variant + 1}`
  let head = stem
  while (utf8Length(`${head}${suffix}.${ext}`) > 255) head = head.slice(0, -1)
  return `${head}${suffix}`
}

export function buildName(input: NameInput): NameParts {
  const script = scriptOf(input.style)
  const token = tokenFor(input.serial, script, input.seed)
  const built = buildStem(input, token)
  const stem = fitVariant(built.stem, built.ext, input.variant ?? 0)
  return {
    style: input.style,
    serial: input.serial,
    baseExt: input.ext,
    stem,
    ext: built.ext,
    name: `${stem}.${built.ext}`,
    token,
    tokenStart: stem
      .toLowerCase()
      .indexOf((input.style === 'fullwidth' ? fullWidth(token) : token).toLowerCase()),
    delimited: built.delimited,
    script,
    pinyin: script === 'han-s' ? pinyinOfHan(token) : null
  }
}
