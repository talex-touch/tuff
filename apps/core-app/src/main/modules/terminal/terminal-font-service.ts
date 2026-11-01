import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import type { TerminalFontInfo } from '@talex-touch/utils/transport/events/terminal'

const FONT_EXTENSIONS = new Set(['.ttf', '.otf', '.woff', '.woff2'])
const MONOSPACE_KEYWORDS = [
  'mono',
  'code',
  'nerd',
  'nf',
  'menlo',
  'monaco',
  'consolas',
  'courier',
  'dejavu',
  'hack',
  'source code',
  'inconsolata',
  'fira',
  'cascadia',
  'berkeley',
  'symbols'
]

let cachedFonts: TerminalFontInfo[] | null = null

function getSystemFontDirectories(): string[] {
  const dirs: string[] = []
  const home = process.env.HOME || process.env.USERPROFILE || ''

  if (process.platform === 'darwin') {
    if (home) dirs.push(path.join(home, 'Library/Fonts'))
    dirs.push('/Library/Fonts', '/System/Library/Fonts')
  } else if (process.platform === 'win32') {
    const windir = process.env.WINDIR || 'C:\\Windows'
    dirs.push(path.join(windir, 'Fonts'))
    const localAppData = process.env.LOCALAPPDATA
    if (localAppData) {
      dirs.push(path.join(localAppData, 'Microsoft', 'Windows', 'Fonts'))
    }
  } else {
    if (home) {
      dirs.push(path.join(home, '.local', 'share', 'fonts'), path.join(home, '.fonts'))
    }
    dirs.push('/usr/share/fonts', '/usr/local/share/fonts')
  }

  return dirs.filter((d) => fs.existsSync(d))
}

function parseFontFamilyFromSfnt(filePath: string): string | null {
  try {
    const fd = fs.openSync(filePath, 'r')
    const headerBuf = Buffer.alloc(2048)
    const bytesRead = fs.readSync(fd, headerBuf, 0, 2048, 0)
    fs.closeSync(fd)

    if (bytesRead < 12) return null
    const numTables = headerBuf.readUInt16BE(4)
    let nameTableOffset = 0

    for (let i = 0; i < numTables; i++) {
      const offset = 12 + i * 16
      if (offset + 16 > bytesRead) break
      const tag = headerBuf.toString('ascii', offset, offset + 4)
      if (tag === 'name') {
        nameTableOffset = headerBuf.readUInt32BE(offset + 8)
        break
      }
    }
    if (!nameTableOffset) return null

    const nameHeaderBuf = Buffer.alloc(1024)
    const fd2 = fs.openSync(filePath, 'r')
    const nameBytesRead = fs.readSync(fd2, nameHeaderBuf, 0, 1024, nameTableOffset)
    fs.closeSync(fd2)

    if (nameBytesRead < 6) return null
    const count = nameHeaderBuf.readUInt16BE(2)
    const stringOffset = nameHeaderBuf.readUInt16BE(4)

    let familyName: string | null = null
    for (let i = 0; i < count; i++) {
      const recOffset = 6 + i * 12
      if (recOffset + 12 > nameBytesRead) break
      const platformID = nameHeaderBuf.readUInt16BE(recOffset)
      const nameID = nameHeaderBuf.readUInt16BE(recOffset + 6)
      const length = nameHeaderBuf.readUInt16BE(recOffset + 8)
      const strOffset = nameHeaderBuf.readUInt16BE(recOffset + 10)

      if (nameID === 1 && !familyName && length > 0 && length < 256) {
        const fullStrOffset = nameTableOffset + stringOffset + strOffset
        const strBuf = Buffer.alloc(length)
        const fd3 = fs.openSync(filePath, 'r')
        fs.readSync(fd3, strBuf, 0, length, fullStrOffset)
        fs.closeSync(fd3)

        if (platformID === 3 || platformID === 0) {
          familyName = strBuf.swap16().toString('utf16le')
        } else {
          familyName = strBuf.toString('utf8')
        }
      }
    }
    return familyName ? familyName.replace(/\0/g, '').trim() : null
  } catch {
    return null
  }
}

function isMonospaceCandidate(name: string): boolean {
  const lower = name.toLowerCase()
  return MONOSPACE_KEYWORDS.some((kw) => lower.includes(kw))
}

function isNerdFontName(name: string): boolean {
  const lower = name.toLowerCase()
  return lower.includes('nerd') || lower.includes(' nf') || lower.includes('-nf')
}

export async function scanTerminalFonts(): Promise<TerminalFontInfo[]> {
  if (cachedFonts) return cachedFonts

  const fontDirs = getSystemFontDirectories()
  const discovered = new Map<string, TerminalFontInfo>()

  for (const dir of fontDirs) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isFile()) continue
        const ext = path.extname(entry.name).toLowerCase()
        if (!FONT_EXTENSIONS.has(ext)) continue

        const lowerFilename = entry.name.toLowerCase()
        if (!isMonospaceCandidate(lowerFilename)) continue

        const fullPath = path.join(dir, entry.name)
        const parsedName = parseFontFamilyFromSfnt(fullPath)
        const family = parsedName || path.basename(entry.name, ext).replace(/[-_]/g, ' ')

        if (family && !discovered.has(family)) {
          const isNerd = isNerdFontName(family) || isNerdFontName(lowerFilename)
          discovered.set(family, {
            family,
            label: isNerd ? `${family} [Nerd Font]` : family,
            isNerdFont: isNerd
          })
        }
      }
    } catch {
      // Directory read failure ignored in read-only scan
    }
  }

  // Baseline standard fonts if not detected in dirs
  const defaultCandidates: TerminalFontInfo[] = [
    { family: 'SF Mono', label: 'SF Mono', isNerdFont: false },
    { family: 'JetBrains Mono', label: 'JetBrains Mono', isNerdFont: false },
    { family: 'Menlo', label: 'Menlo', isNerdFont: false },
    { family: 'Monaco', label: 'Monaco', isNerdFont: false },
    { family: 'Consolas', label: 'Consolas', isNerdFont: false },
    { family: 'Cascadia Code', label: 'Cascadia Code', isNerdFont: false },
    { family: 'Fira Code', label: 'Fira Code', isNerdFont: false }
  ]

  for (const candidate of defaultCandidates) {
    if (!discovered.has(candidate.family)) {
      discovered.set(candidate.family, candidate)
    }
  }

  // Sort: Nerd fonts first, then alphabetical
  const list = Array.from(discovered.values()).sort((a, b) => {
    if (a.isNerdFont !== b.isNerdFont) {
      return a.isNerdFont ? -1 : 1
    }
    return a.family.localeCompare(b.family)
  })

  cachedFonts = list
  return list
}
