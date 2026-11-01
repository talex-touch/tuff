import type { PayloadSpec } from '../../types'
import { asciiFiller, noiseBytes, u16le, u32le, xorshift } from './bytes'

const WORDS = [
  'amber',
  'budget',
  'canvas',
  'delta',
  'engine',
  'folder',
  'garden',
  'harbor',
  'index',
  'journal',
  'kernel',
  'ledger',
  'matrix',
  'notes',
  'orbit',
  'plan',
  'quartz',
  'report',
  'signal',
  'table',
  'update',
  'vector',
  'window',
  'yearly',
  'zenith'
]

/** Whole comment lines, then one last line sized so the block is exactly `bytes` long. */
function commentBlock(bytes: number, seed: number, open: string, close: string): string {
  const next = xorshift(seed)
  const overhead = open.length + close.length + 1
  const lines: string[] = []
  let remaining = bytes
  while (remaining > 90) {
    const words: string[] = []
    let length = 0
    const target = 40 + (next() % 40)
    while (length < target) {
      const word = WORDS[next() % WORDS.length] as string
      words.push(word)
      length += word.length + 1
    }
    const line = `${open}${words.join(' ')}${close}\n`
    if (line.length > remaining) break
    lines.push(line)
    remaining -= line.length
  }
  if (remaining >= overhead) {
    lines.push(
      `${open}${asciiFiller(remaining - overhead, seed ^ 0x7f4a7c15).toString('latin1')}${close}\n`
    )
  } else {
    lines.push('\n'.repeat(remaining))
  }
  return lines.join('')
}

const LINE_COMMENTS: Record<string, string> = {
  py: '# ',
  sh: '# ',
  rb: '# ',
  yaml: '# ',
  yml: '# ',
  toml: '# ',
  conf: '# ',
  env: '# ',
  org: '# ',
  ps1: '# ',
  ini: '; ',
  sql: '-- ',
  tex: '% ',
  rst: '.. ',
  js: '// ',
  ts: '// ',
  jsx: '// ',
  tsx: '// ',
  java: '// ',
  kt: '// ',
  swift: '// ',
  go: '// ',
  rs: '// ',
  c: '// ',
  cpp: '// ',
  cs: '// ',
  php: '// '
}

function wrapped(
  spec: PayloadSpec,
  head: string,
  open: string,
  close: string,
  tail: string
): string {
  return (
    head +
    commentBlock(Math.max(0, spec.bytes - head.length - tail.length), spec.seed, open, close) +
    tail
  )
}

function plainText(spec: PayloadSpec): string {
  const ext = spec.ext ?? 'txt'
  if (ext === 'json') {
    const head = `{"seed":${spec.seed},"note":"`
    const tail = '"}\n'
    const fill = Math.max(0, spec.bytes - head.length - tail.length)
    return head + asciiFiller(fill, spec.seed).toString('latin1') + tail
  }
  if (ext === 'xml')
    return wrapped(
      spec,
      '<?xml version="1.0" encoding="UTF-8"?>\n<root>\n',
      '<!-- ',
      ' -->',
      '</root>\n'
    )
  if (ext === 'html') {
    return wrapped(
      spec,
      '<!doctype html>\n<html><head><meta charset="utf-8"><title>note</title></head><body>\n',
      '<!-- ',
      ' -->',
      '</body></html>\n'
    )
  }
  if (ext === 'rtf')
    return wrapped(spec, '{\\rtf1\\ansi\\deff0 {\\fonttbl{\\f0 Arial;}}\n', '', '\\par', '}\n')
  if (ext === 'csv') return commentBlock(spec.bytes, spec.seed, '', ',1,2')
  return commentBlock(spec.bytes, spec.seed, LINE_COMMENTS[ext] ?? '', '')
}

export function encodeText(spec: PayloadSpec): Buffer {
  return Buffer.from(plainText(spec), 'latin1')
}

function minimalPdf(bytes: number, seed: number): Buffer {
  const header = '%PDF-1.4\n'
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\n'
  ]
  const fixed = header.length + objects.reduce((sum, item) => sum + item.length, 0)
  const xrefSize = 'xref\n0 4\n'.length + 4 * 20
  const trailer = '<< /Size 4 /Root 1 0 R >>'
  const tailLength =
    'trailer\n'.length + trailer.length + '\nstartxref\n'.length + 11 + '%%EOF\n'.length
  const padding = commentBlock(Math.max(0, bytes - fixed - xrefSize - tailLength), seed, '%', '')
  let offset = header.length + padding.length
  const entries = ['0000000000 65535 f \n']
  for (const item of objects) {
    entries.push(`${String(offset).padStart(10, '0')} 00000 n \n`)
    offset += item.length
  }
  const xrefAt = offset
  const text =
    header +
    padding +
    objects.join('') +
    `xref\n0 4\n${entries.join('')}` +
    `trailer\n${trailer}\nstartxref\n${String(xrefAt).padStart(10, '0')}\n%%EOF\n`
  return Buffer.from(text, 'latin1')
}

/** An archive with no entries: only the end-of-central-directory record, whose comment carries the padding. */
function emptyZip(bytes: number, seed: number): Buffer {
  const comment = asciiFiller(Math.min(65535, Math.max(0, bytes - 22)), seed)
  return Buffer.concat([
    u32le(0x06054b50),
    Buffer.alloc(8),
    Buffer.alloc(8),
    u16le(comment.length),
    comment
  ])
}

const ZIP_CONTAINERS = new Set(['docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp', 'epub', 'zip'])

export function encodeBinary(spec: PayloadSpec): Buffer {
  const ext = spec.ext ?? ''
  if (ext === 'pdf') return minimalPdf(spec.bytes, spec.seed)
  if (ZIP_CONTAINERS.has(ext)) return emptyZip(spec.bytes, spec.seed)
  return noiseBytes(spec.bytes, spec.seed)
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** Image extension, bytes no decoder accepts: noise, plain text, or a PNG signature followed by noise. */
export function encodeFakeImage(spec: PayloadSpec): Buffer {
  const variant = spec.seed % 3
  if (variant === 0) return noiseBytes(spec.bytes, spec.seed)
  if (variant === 1) {
    return Buffer.from(commentBlock(spec.bytes, spec.seed, 'not an image: ', ''), 'latin1')
  }
  return Buffer.concat([
    PNG_SIGNATURE,
    noiseBytes(Math.max(0, spec.bytes - 8), spec.seed)
  ]).subarray(0, spec.bytes)
}
