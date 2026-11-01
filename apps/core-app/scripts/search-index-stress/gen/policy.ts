/** The production indexer's exclusion rules as data; policy.test.ts runs the real FileFilterService against every rule. */
import type { FsStep } from '../types'

const BUNDLE_SUFFIXES = [
  '.app',
  '.photoslibrary',
  '.tvlibrary',
  '.theater',
  '.imovielibrary',
  '.musiclibrary',
  '.aplibrary',
  '.localized'
]
const FILE_PREFIXES = ['.', '~', '#', '$']
const FILE_SUFFIXES = ['~', '.tmp', '.bak', '.old', '.orig', '.swp', '.swo']
const HIDDEN_EXTENSIONS = new Set([
  'tmp',
  'temp',
  'bak',
  'backup',
  'old',
  'orig',
  'swp',
  'swo',
  'localized'
])

/** Directory names the indexer drops somewhere (unconditionally, beside a project marker, or as a system/app location). */
export const RESERVED_DIRECTORY_NAMES: ReadonlySet<string> = new Set([
  'node_modules',
  '__pycache__',
  'site-packages',
  'uvcache',
  'dist',
  'build',
  'target',
  'out',
  'bin',
  'cache',
  'coverage',
  'logs',
  'tmp',
  'temp',
  'temporary',
  'library',
  'application support',
  'applications',
  'system',
  'private',
  'usr',
  'sbin',
  'var',
  'opt',
  'etc',
  'dev',
  'system32',
  'windows',
  'program files',
  'program files (x86)',
  'programdata',
  'appdata',
  'localappdata',
  'windows.old',
  'recovery',
  'boot',
  'efi',
  'system volume information',
  '$recycle.bin',
  'proc',
  'sys',
  'lib',
  'lib64',
  'mnt',
  'media',
  'srv',
  'chrome',
  'firefox',
  'safari',
  'edge',
  'opera',
  'brave',
  'vivaldi',
  'tor browser',
  'local storage',
  'session storage',
  'indexeddb',
  'webstorage',
  'icloud drive',
  'mobile documents',
  'database',
  'search',
  'spotlight',
  'snap',
  'flatpak'
])

export function utf8Length(value: string): number {
  return Buffer.byteLength(value, 'utf8')
}

/** Problem with a directory name that must stay indexable, or null. */
export function directoryNameProblem(segment: string): string | null {
  const lower = segment.toLowerCase()
  if (segment.startsWith('.')) return `hidden directory name: ${segment}`
  if (RESERVED_DIRECTORY_NAMES.has(lower)) return `reserved directory name: ${segment}`
  if (BUNDLE_SUFFIXES.some((suffix) => lower.endsWith(suffix)))
    return `bundle directory name: ${segment}`
  return null
}

/** Problem with a file name that must be indexed, or null. `extensions` is the admitted set. */
export function fileNameProblem(name: string, extensions: ReadonlySet<string>): string | null {
  const lower = name.toLowerCase()
  if (FILE_PREFIXES.some((prefix) => name.startsWith(prefix))) return `excluded prefix: ${name}`
  if (lower.startsWith('._')) return `AppleDouble name: ${name}`
  if (FILE_SUFFIXES.some((suffix) => lower.endsWith(suffix))) return `excluded suffix: ${name}`
  const dot = lower.lastIndexOf('.')
  if (dot <= 0 || dot === lower.length - 1) return `no extension: ${name}`
  const ext = lower.slice(dot + 1)
  if (HIDDEN_EXTENSIONS.has(ext)) return `hidden extension: ${name}`
  if (!extensions.has(ext)) return `extension not admitted: ${name}`
  return null
}

const MAX_COMPONENT_BYTES = 255
const MAX_RELATIVE_PATH_BYTES = 700

/** Problem with a corpus-relative path, or null. Checks escape, NUL, APFS limits, NFC/NFD length. */
export function pathProblem(path: string): string | null {
  if (path.length === 0) return 'empty path'
  if (path.includes('\0')) return 'NUL in path'
  if (path.startsWith('/') || /^[a-z]:/i.test(path)) return `absolute path: ${path}`
  if (path.includes('\\')) return `backslash in path: ${path}`
  const parts = path.split('/')
  for (const part of parts) {
    if (part === '' || part === '.' || part === '..') return `bad path component in: ${path}`
    for (const form of [part, part.normalize('NFC'), part.normalize('NFD')]) {
      if (utf8Length(form) > MAX_COMPONENT_BYTES)
        return `component over ${MAX_COMPONENT_BYTES} bytes: ${part.slice(0, 40)}`
    }
  }
  if (utf8Length(path) > MAX_RELATIVE_PATH_BYTES)
    return `path over ${MAX_RELATIVE_PATH_BYTES} bytes`
  return null
}

const DEV_DIRECTORIES = new Set(['node_modules', '__pycache__', 'site-packages', 'uvcache'])

/** True when the traversal policy drops the path whatever sits around it: its name, a hidden or bundle ancestor, a dev directory. */
export function excludedUnconditionally(path: string, extensions: ReadonlySet<string>): boolean {
  const parts = path.split('/')
  if (fileNameProblem(parts[parts.length - 1] as string, extensions) !== null) return true
  return parts.slice(0, -1).some((dir) => {
    const lower = dir.toLowerCase()
    return (
      dir.startsWith('.') ||
      BUNDLE_SUFFIXES.some((suffix) => lower.endsWith(suffix)) ||
      DEV_DIRECTORIES.has(lower)
    )
  })
}

type Item =
  | { dir: string }
  | { marker: string; name: string }
  | { image: string }
  | { link: string; to: string }

interface Layout {
  items: Item[]
  absent: string
  hard: boolean
}

export interface IgnoreInput {
  token: string
  name: string
  serial: number
  write: (path: string) => FsStep
  writeMarker: (path: string, name: string) => FsStep
}

export interface IgnoreBuild {
  steps: FsStep[]
  absentPath: string
  absentName: string
  hard: boolean
}

const CONTAINER = 'ignored'
const MEDIA_SUFFIXES = [
  'tvlibrary',
  'theater',
  'imovielibrary',
  'musiclibrary',
  'aplibrary',
  'localized'
]
const OTHER_IMAGE_EXTENSIONS = ['tif', 'ico', 'avif', 'jfif']
const PROJECTS: Record<string, readonly [marker: string, output: string]> = {
  'project-dist': ['package.json', 'dist'],
  'project-build': ['Cargo.toml', 'build'],
  'project-cache': ['go.mod', 'cache'],
  'project-out': ['Makefile', 'out'],
  'project-target': ['pom.xml', 'target'],
  'project-tmp': ['tsconfig.json', 'tmp']
}

function chain(...parts: string[]): Item[] {
  return parts.map((_, index) => ({ dir: parts.slice(0, index + 1).join('/') }))
}

function plain(file: string, hard: boolean, dirs: string[] = []): Layout {
  return { items: [...dirs.map((dir) => ({ dir })), { image: file }], absent: file, hard }
}

function layoutFor(rule: string, input: IgnoreInput): Layout {
  const { name, token } = input
  const detail = rule.slice(rule.indexOf(':') + 1)
  const reason = rule.slice(0, rule.indexOf(':'))
  if (rule === 'hidden-name:dot-prefix') return plain(`.${name}`, true)
  if (rule === 'hidden-name:tilde-prefix') return plain(`~${name}`, true)
  if (rule === 'hidden-name:hash-prefix') return plain(`#${name}`, true)
  if (rule === 'hidden-name:dollar-prefix') return plain(`$${name}`, true)
  if (rule === 'system-metadata:appledouble') return plain(`._${name}`, true)
  if (rule === 'temporary-name:tilde-suffix') return plain(`${name}~`, true)
  if (reason === 'temporary-name') return plain(`${name}.${detail}`, true)
  if (rule === 'hidden-name:hidden-directory') {
    const dir = `.${token}-hidden`
    return plain(`${dir}/${name}`, true, [dir])
  }
  if (rule === 'hidden-name:hidden-ancestor') {
    const dir = `.cache-${token}`
    return {
      items: [...chain(dir, 'sub'), { image: `${dir}/sub/${name}` }],
      absent: `${dir}/sub/${name}`,
      hard: true
    }
  }
  if (rule === 'bundle-internal:app') {
    const dir = `Demo${token}.app`
    const file = `${dir}/Contents/Resources/${name}`
    return {
      items: [...chain(dir, 'Contents', 'Resources'), { image: file }],
      absent: file,
      hard: true
    }
  }
  if (rule === 'bundle-internal:photoslibrary') {
    const dir = `Pics${token}.photoslibrary`
    return plain(`${dir}/originals/${name}`, true, [dir, `${dir}/originals`])
  }
  if (rule === 'bundle-internal:media-library') {
    const dir = `Lib${token}.${MEDIA_SUFFIXES[input.serial % MEDIA_SUFFIXES.length]}`
    return plain(`${dir}/${name}`, true, [dir])
  }
  if (rule === 'development-path:node_modules') {
    return plain(`pkg/node_modules/mod/${name}`, true, [
      'pkg',
      'pkg/node_modules',
      'pkg/node_modules/mod'
    ])
  }
  if (rule === 'development-path:pycache')
    return plain(`app/__pycache__/${name}`, true, ['app', 'app/__pycache__'])
  if (rule === 'development-path:site-packages') {
    return plain(`env/site-packages/lib/${name}`, true, [
      'env',
      'env/site-packages',
      'env/site-packages/lib'
    ])
  }
  if (rule === 'development-path:uvcache')
    return plain(`tool/uvcache/${name}`, true, ['tool', 'tool/uvcache'])
  const project = PROJECTS[detail]
  if (project) {
    const [marker, output] = project
    const file = `proj/${output}/${name}`
    return {
      items: [
        { dir: 'proj' },
        { marker: `proj/${marker}`, name: marker },
        { dir: `proj/${output}` },
        { image: file }
      ],
      absent: file,
      hard: false
    }
  }
  if (rule === 'unsupported-extension:no-extension') return plain(name.replace(/\./g, '-'), false)
  if (rule === 'unsupported-extension:not-whitelisted') {
    const other = OTHER_IMAGE_EXTENSIONS[input.serial % OTHER_IMAGE_EXTENSIONS.length]
    return plain(`${name.slice(0, name.lastIndexOf('.'))}.${other}`, false)
  }
  if (rule === 'scan-skips:symlink-to-file') {
    return {
      items: [{ dir: 'real' }, { image: `real/${name}` }, { link: name, to: `real/${name}` }],
      absent: name,
      hard: false
    }
  }
  if (rule === 'scan-skips:symlink-to-directory') {
    return {
      items: [{ dir: 'real' }, { image: `real/${name}` }, { link: 'linked', to: 'real' }],
      absent: `linked/${name}`,
      hard: false
    }
  }
  if (rule === 'scan-skips:beyond-max-depth') {
    const parts = Array.from({ length: 26 }, (_, index) => `d${index + 1}`)
    const file = `${parts.join('/')}/${name}`
    return { items: [...chain(...parts), { image: file }], absent: file, hard: false }
  }
  throw new Error(`unknown ignore rule: ${rule}`)
}

export function buildIgnore(rule: string, input: IgnoreInput): IgnoreBuild {
  const layout = layoutFor(rule, input)
  const root = `${CONTAINER}/${input.token}`
  const steps: FsStep[] = [{ op: 'mkdir', path: root }]
  for (const item of layout.items) {
    if ('dir' in item) steps.push({ op: 'mkdir', path: `${root}/${item.dir}` })
    else if ('marker' in item) steps.push(input.writeMarker(`${root}/${item.marker}`, item.name))
    else if ('image' in item) steps.push(input.write(`${root}/${item.image}`))
    else steps.push({ op: 'symlink', path: `${root}/${item.link}`, target: `${root}/${item.to}` })
  }
  const absentPath = `${root}/${layout.absent}`
  return {
    steps,
    absentPath,
    absentName: absentPath.slice(absentPath.lastIndexOf('/') + 1),
    hard: layout.hard
  }
}

export const IGNORE_CONTAINER = CONTAINER
