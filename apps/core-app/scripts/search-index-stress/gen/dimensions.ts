import type { ScenarioClass } from '../types'

/** Plain-data dimension table: [id, default weight, note]. Per-class overrides are in CLASS_WEIGHTS; `app` values come from GenerateOptions.apps. */
export type DimensionName =
  | 'format'
  | 'nameStyle'
  | 'placement'
  | 'size'
  | 'writeMode'
  | 'query'
  | 'fileType'
  | 'change'
  | 'rule'
  | 'app'

export type DimensionRow = readonly [id: string, weight: number, note: string]

export const DIMENSIONS: Record<Exclude<DimensionName, 'app'>, readonly DimensionRow[]> = {
  format: [
    ['png', 24, 'real PNG, 8-bit RGB'],
    ['jpg', 22, 'real baseline JPEG; extension alternates jpg / jpeg'],
    ['heic', 8, 'real 16x16 HEIC authored with sips, padded with a top-level free box'],
    ['webp', 8, 'real lossless WebP (VP8X + VP8L), padded with an unknown chunk'],
    ['gif', 6, 'real GIF89a, 256-colour palette'],
    ['bmp', 5, 'real 24-bit BMP'],
    ['tiff', 5, 'real uncompressed RGB TIFF, extension .tiff (.tif is not indexed)'],
    ['svg', 6, 'valid SVG XML'],
    [
      'fake-image',
      8,
      'image extension, bytes no decoder accepts (noise, text, or PNG signature + noise)'
    ],
    ['zero-byte', 5, 'image extension, empty file']
  ],
  nameStyle: [
    ['ascii-lower', 4, 'token+word fused, lowercase: kobabi7harbor'],
    ['ascii-upper', 2, 'KOBABI7HARBOR'],
    ['ascii-mixed', 4, 'Kobabi7Harbor'],
    ['digits', 3, 'timestamp digits then token: 20261030061703kobabi7'],
    ['spaces', 5, 'kobabi7 harbor sunset'],
    ['dots', 2, 'kobabi7.harbor.sunset'],
    ['dashes', 4, 'kobabi7-harbor-sunset'],
    ['underscores', 4, 'kobabi7_harbor_sunset'],
    ['parens', 3, 'harbor (kobabi7)'],
    ['brackets', 2, '[kobabi7] harbor'],
    ['long-255', 1.5, 'name + extension are exactly 255 bytes (APFS limit)'],
    ['han-simplified', 4, '三个简体汉字令牌 + 词: 山水云风景'],
    ['han-traditional', 2, '三個繁體漢字令牌 + 詞'],
    ['japanese', 2, 'kana token + 写真'],
    ['korean', 2, 'hangul token + 사진'],
    ['accented-latin', 2.5, 'composed diacritics: café kobabi7 crème'],
    ['nfc-accent', 1.5, 'kobabi7 résumé created with the NFC byte sequence'],
    ['nfd-accent', 1.5, 'same name created with the NFD byte sequence (APFS keeps it as given)'],
    ['emoji', 2, 'kobabi7 + single-codepoint emoji'],
    ['fullwidth', 1, 'ｋｏｂａｂｉ７ｈａｒｂｏｒ (U+FF00 block)'],
    ['rtl-arabic', 1, 'Arabic token + صورة'],
    ['rtl-hebrew', 1, 'Hebrew token + תמונה'],
    ['screenshot-macos-24h', 4, 'Screenshot 2026-10-30 at 06.17.03 <token>'],
    [
      'screenshot-macos-12h',
      3,
      'Screenshot 2026-10-30 at 6.17.03<U+202F>AM <token> (narrow no-break space since macOS 13)'
    ],
    ['pixpin', 2, 'PixPin_2026-10-30_06-17-03_<token>'],
    ['screenshot-cn', 2, '截屏2026-10-30 06.17.03 <token>'],
    ['wechat', 2, '微信图片_20261030061703_<token>'],
    ['iphone-img', 3, 'IMG_1234_<token>'],
    ['upper-ext', 2, 'extension in capitals: .PNG'],
    ['mixed-ext', 1.5, 'extension in mixed case: .PnG'],
    ['double-ext', 1.5, 'two extensions: photo.final.png']
  ],
  placement: [
    ['root', 10, 'directly in the corpus root'],
    ['depth-1', 14, 'one directory deep'],
    ['depth-2', 12, 'two directories deep'],
    ['depth-3', 9, 'three directories deep'],
    ['depth-4', 6, 'four directories deep'],
    ['depth-5', 4, 'five directories deep'],
    ['depth-6', 3, 'six directories deep'],
    ['dir-spaces', 8, 'directories with spaces: My Photos/Summer Trip'],
    ['dir-cjk', 7, 'directories with CJK names: 相册/风景照'],
    [
      'new-dir',
      8,
      'a directory used by this scenario only (created in the same step for create classes)'
    ],
    ['crowded', 9, 'a directory that already holds ~120 unrelated siblings']
  ],
  size: [
    ['empty', 5, '0 bytes (only with format zero-byte)'],
    ['tiny', 40, '2 KiB'],
    ['small', 30, '24 KiB'],
    ['medium', 20, '200 KiB'],
    ['large', 7, '1 MiB'],
    ['xlarge', 3, '3 MiB'],
    ['wide', 1.2, '2.4 MB strip of 12,288 x 64 pixels (raster formats only)']
  ],
  writeMode: [
    ['direct', 22, 'one write'],
    ['chunked-2', 5, 'slow writer, 2 chunks'],
    ['chunked-4', 5, 'slow writer, 4 chunks'],
    ['chunked-8', 3, 'slow writer, 8 chunks'],
    ['atomic-rename', 9, 'temp name in the same directory, then rename onto the final name'],
    [
      'download-rename',
      6,
      'browser download: slow chunks into name.<crdownload|part|download>, then rename'
    ],
    ['copy-in', 8, 'Finder-style copy of a corpus file into place'],
    ['move-in-stage', 6, 'written to hidden .stage/ inside the corpus, then moved into place'],
    ['burst-2', 4, '2 files written in the same tick'],
    ['burst-4', 4, '4 files written in the same tick'],
    ['burst-8', 3, '8 files written in the same tick'],
    ['burst-16', 2, '16 files written in the same tick'],
    ['overwrite', 7, 'created small, then overwritten in place with the final content'],
    ['rename-after-create', 5, 'created under one name, renamed to the final name'],
    ['create-then-delete', 5, 'created and deleted again: must not stay searchable'],
    ['touch-empty', 3, 'created empty through touch (only with format zero-byte)']
  ],
  query: [
    ['exact-ext', 10, 'full file name with extension'],
    ['exact-stem', 8, 'file name without extension'],
    ['prefix-3', 5, 'first 3 characters of the name'],
    ['prefix-4', 5, 'first 4 characters'],
    ['prefix-5', 5, 'first 5 characters'],
    ['prefix-6', 4, 'first 6 characters'],
    ['prefix-7', 3, 'first 7 characters'],
    ['prefix-8', 3, 'first 8 characters'],
    ['middle-substring', 7, 'six characters from the middle of the name'],
    ['lowercase', 5, 'whole name lowercased'],
    ['uppercase', 2, 'whole name uppercased'],
    ['first-token', 6, 'first word of the name'],
    ['token-subset', 4, 'first and last word of the name'],
    ['unique-token', 6, 'only the scenario token'],
    ['cjk-first-2', 3, 'first two CJK characters'],
    ['typo-1', 5, 'one character wrong in the first word'],
    ['diacritics-stripped', 3, 'accents removed from the name'],
    ['extra-whitespace', 4, 'leading, trailing and doubled spaces around the name'],
    ['nfd-typed', 2, 'name typed in decomposed form'],
    ['pinyin-full', 2, 'pinyin of the three-character token'],
    ['pinyin-initials', 2, 'pinyin initials of the token'],
    ['compact', 2, 'name with delimiters removed'],
    ['acronym', 2, 'first letters of the words'],
    ['fullwidth-typed', 1, 'token typed with full-width letters']
  ],
  fileType: [
    ['document', 22, 'pdf docx doc xlsx pptx rtf odt epub'],
    ['text', 22, 'txt md log csv json xml yaml toml ini conf tex rst org sql'],
    ['code', 22, 'js ts tsx jsx py go rs java swift sh c cpp rb php'],
    ['audio', 8, 'mp3 wav flac m4a aac ogg'],
    ['video', 8, 'mp4 mov mkv avi webm'],
    ['archive', 10, 'zip 7z tar gz'],
    ['design', 8, 'psd ai sketch xd']
  ],
  change: [
    ['rename', 14, 'renamed in the same directory'],
    ['rename-case', 4, 'only the letter case of the name changes'],
    ['move', 10, 'moved to another existing directory'],
    ['move-new-dir', 6, 'moved into a directory created in the same step'],
    ['overwrite', 12, 'content replaced in place'],
    ['replace-atomic', 8, 'temp file renamed over the original (editor save)'],
    ['delete', 12, 'deleted'],
    ['delete-recreate', 7, 'deleted, then written again under the same name'],
    ['touch', 6, 'only the modification time changes'],
    ['rename-to-hidden-name', 5, 'renamed to a dot-prefixed name (indexer reason hidden-name)'],
    ['rename-to-temporary-name', 5, 'renamed to name.bak (indexer reason temporary-name)'],
    ['restore-from-temporary-name', 5, 'name.bak renamed back to a normal name']
  ],
  rule: [
    ['hidden-name:dot-prefix', 4, '.name.png'],
    ['hidden-name:tilde-prefix', 3, '~name.png'],
    ['hidden-name:hash-prefix', 3, '#name.png'],
    ['hidden-name:dollar-prefix', 3, '$name.png'],
    ['system-metadata:appledouble', 3, '._name.png'],
    ['temporary-name:tilde-suffix', 3, 'name.png~'],
    ['temporary-name:tmp', 3, 'name.png.tmp'],
    ['temporary-name:bak', 3, 'name.png.bak'],
    ['temporary-name:old', 3, 'name.png.old'],
    ['temporary-name:orig', 3, 'name.png.orig'],
    ['temporary-name:swp', 3, 'name.png.swp'],
    ['temporary-name:temp', 3, 'name.png.temp'],
    ['temporary-name:backup', 3, 'name.png.backup'],
    ['hidden-name:hidden-directory', 4, '.dir/name.png'],
    ['hidden-name:hidden-ancestor', 3, 'dir/.cache-x/sub/name.png'],
    ['bundle-internal:app', 3, 'Name.app/Contents/Resources/name.png'],
    ['bundle-internal:photoslibrary', 3, 'Name.photoslibrary/originals/name.png'],
    [
      'bundle-internal:media-library',
      3,
      'Name.<tvlibrary|theater|imovielibrary|musiclibrary|aplibrary|localized>/name.png'
    ],
    ['development-path:node_modules', 3, 'pkg/node_modules/x/name.png'],
    ['development-path:pycache', 3, 'pkg/__pycache__/name.png'],
    ['development-path:site-packages', 3, 'env/site-packages/x/name.png'],
    ['development-path:uvcache', 3, 'tool/uvcache/name.png'],
    ['development-path:project-dist', 3, 'proj/package.json + proj/dist/name.png'],
    ['development-path:project-build', 3, 'proj/Cargo.toml + proj/build/name.png'],
    ['development-path:project-cache', 3, 'proj/go.mod + proj/cache/name.png'],
    ['development-path:project-out', 3, 'proj/Makefile + proj/out/name.png'],
    ['development-path:project-target', 3, 'proj/pom.xml + proj/target/name.png'],
    ['cache-path:project-tmp', 3, 'proj/tsconfig.json + proj/tmp/name.png'],
    ['unsupported-extension:no-extension', 3, 'name without any extension'],
    [
      'unsupported-extension:not-whitelisted',
      3,
      'name.tif / .ico / .avif / .jfif are not in the extension whitelist'
    ],
    ['scan-skips:symlink-to-file', 3, 'symlink pointing at an indexed image'],
    ['scan-skips:symlink-to-directory', 3, 'symlinked directory holding an indexed image'],
    ['scan-skips:beyond-max-depth', 3, 'deeper than FILE_SCAN_MAX_DEPTH (24)']
  ]
}

export const CLASS_DIMENSIONS: Record<ScenarioClass, readonly DimensionName[]> = {
  'search-app': ['app', 'query'],
  'search-file': ['fileType', 'nameStyle', 'placement', 'query'],
  'search-image': ['format', 'nameStyle', 'placement', 'size', 'query'],
  'create-image': ['format', 'nameStyle', 'placement', 'size', 'writeMode', 'query'],
  'change-image': ['format', 'nameStyle', 'placement', 'size', 'change', 'query'],
  'ignore-image': ['rule', 'format', 'nameStyle', 'size', 'query'],
  'search-created': ['format', 'nameStyle', 'placement', 'size', 'writeMode', 'query']
}

type WeightOverrides = Partial<Record<DimensionName, Record<string, number>>>

const SEEDED_SIZES = { empty: 5, tiny: 78, small: 15, medium: 1.5, large: 0.2, xlarge: 0, wide: 0 }

/** Acronyms are made from the words of an app name; a file's name never gets one. */
const NO_ACRONYM = { acronym: 0 }

/** Weight 0 removes a value from a class. Seeded classes stay small so the corpus fits its budget. */
export const CLASS_WEIGHTS: Partial<Record<ScenarioClass, WeightOverrides>> = {
  'search-image': { size: SEEDED_SIZES, query: NO_ACRONYM },
  'change-image': { size: SEEDED_SIZES, query: NO_ACRONYM },
  'create-image': { query: NO_ACRONYM },
  'ignore-image': {
    size: { empty: 5, tiny: 70, small: 25, medium: 0, large: 0, xlarge: 0, wide: 0 },
    query: { 'exact-ext': 5, 'exact-stem': 2, 'unique-token': 3, acronym: 0 }
  },
  'search-file': {
    nameStyle: { 'upper-ext': 0, 'mixed-ext': 0, 'iphone-img': 0 },
    query: NO_ACRONYM
  },
  'search-created': { writeMode: { 'create-then-delete': 0 }, query: NO_ACRONYM },
  'search-app': {
    query: { 'exact-ext': 0, 'unique-token': 0, 'nfd-typed': 1 }
  }
}

/** A tuple is rejected when, for every dimension named in a row, its value is one of that row's values. */
export const FORBIDDEN: ReadonlyArray<Partial<Record<DimensionName, readonly string[]>>> = [
  {
    writeMode: ['touch-empty'],
    format: ['png', 'jpg', 'gif', 'bmp', 'webp', 'tiff', 'heic', 'svg', 'fake-image']
  },
  { writeMode: ['chunked-2', 'chunked-4', 'chunked-8', 'download-rename'], format: ['zero-byte'] },
  { format: ['zero-byte'], size: ['tiny', 'small', 'medium', 'large', 'xlarge'] },
  {
    format: ['png', 'jpg', 'gif', 'bmp', 'webp', 'tiff', 'heic', 'svg', 'fake-image'],
    size: ['empty']
  },
  // Per-scenario writes stay under 4 MiB: N files of the bucket size must fit.
  { writeMode: ['burst-2'], size: ['xlarge'] },
  { writeMode: ['burst-4'], size: ['large', 'xlarge'] },
  { writeMode: ['burst-8', 'burst-16'], size: ['large', 'xlarge'] },
  { writeMode: ['overwrite'], size: ['xlarge'], format: ['gif', 'bmp', 'tiff'] },
  // The copy sources are a fixed pool with no 3 MiB entries.
  { writeMode: ['copy-in'], size: ['xlarge'] },
  {
    writeMode: ['move-in-stage', 'rename-after-create'],
    size: ['xlarge'],
    format: ['gif', 'bmp', 'tiff']
  },
  { size: ['wide'], format: ['heic', 'svg', 'fake-image', 'zero-byte'] },
  { size: ['wide'], writeMode: ['burst-2', 'burst-4', 'burst-8', 'burst-16', 'copy-in'] },
  // Only png and jpg have a 1 MiB copy source; the other formats stop at 200 KiB to keep the corpus small.
  {
    writeMode: ['copy-in'],
    size: ['large'],
    format: ['gif', 'bmp', 'webp', 'tiff', 'heic', 'svg', 'fake-image']
  }
]

export const SIZE_BYTES: Record<string, number> = {
  empty: 0,
  tiny: 2048,
  small: 24 * 1024,
  medium: 200 * 1024,
  large: 1024 * 1024,
  xlarge: 3 * 1024 * 1024,
  wide: 2_400_000
}

/** Sizes that fix the pixel dimensions instead of letting them follow from the byte count. */
export const PIXEL_SIZES: Record<string, { width: number; height: number }> = {
  wide: { width: 12_288, height: 64 }
}

export const MAX_SCENARIO_WRITE_BYTES = 4 * 1024 * 1024
export const MAX_CORPUS_BYTES = 64 * 1024 * 1024
export const MAX_CORPUS_FILES = 8000

/** The 10,000-scenario cap, scaled with the number of seeded files a plan of `count` scenarios holds (floor 24 MiB for the fixed part). */
export function maxCorpusBytes(count: number): number {
  return Math.max(24 * 1024 * 1024, Math.round((MAX_CORPUS_BYTES * count) / 10_000))
}

export const FILE_TYPE_EXTENSIONS: Record<string, readonly string[]> = {
  document: ['pdf', 'docx', 'doc', 'xlsx', 'pptx', 'rtf', 'odt', 'epub'],
  text: [
    'txt',
    'md',
    'log',
    'csv',
    'json',
    'xml',
    'yaml',
    'toml',
    'ini',
    'conf',
    'tex',
    'rst',
    'org',
    'sql'
  ],
  code: [
    'js',
    'ts',
    'tsx',
    'jsx',
    'py',
    'go',
    'rs',
    'java',
    'swift',
    'sh',
    'c',
    'cpp',
    'rb',
    'php'
  ],
  audio: ['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg'],
  video: ['mp4', 'mov', 'mkv', 'avi', 'webm'],
  archive: ['zip', '7z', 'tar', 'gz'],
  design: ['psd', 'ai', 'sketch', 'xd']
}

/** Image extensions the indexer admits for each payload kind (lowercase, canonical first). */
export const FORMAT_EXTENSIONS: Record<string, readonly string[]> = {
  png: ['png'],
  jpg: ['jpg', 'jpeg'],
  gif: ['gif'],
  bmp: ['bmp'],
  webp: ['webp'],
  tiff: ['tiff'],
  heic: ['heic'],
  svg: ['svg'],
  'fake-image': ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tiff', 'heic', 'svg'],
  'zero-byte': ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tiff', 'heic', 'svg']
}

/** Every extension the generator puts on a file that must be indexed; policy.test.ts proves the indexer admits each one. */
export const ADMITTED_EXTENSIONS: ReadonlySet<string> = new Set([
  ...Object.values(FILE_TYPE_EXTENSIONS).flat(),
  ...Object.values(FORMAT_EXTENSIONS).flat()
])

export const SEARCH_APP_QUERIES = [
  'exact-stem',
  'prefix-3',
  'prefix-4',
  'prefix-5',
  'prefix-6',
  'prefix-7',
  'prefix-8',
  'middle-substring',
  'lowercase',
  'uppercase',
  'first-token',
  'token-subset',
  'cjk-first-2',
  'typo-1',
  'diacritics-stripped',
  'extra-whitespace',
  'nfd-typed',
  'pinyin-full',
  'pinyin-initials',
  'compact',
  'acronym',
  'fullwidth-typed'
] as const

export function valueIds(dimension: Exclude<DimensionName, 'app'>): string[] {
  return DIMENSIONS[dimension].map(([id]) => id)
}

export function weightOf(
  cls: ScenarioClass,
  dimension: Exclude<DimensionName, 'app'>,
  id: string
): number {
  const override = CLASS_WEIGHTS[cls]?.[dimension]?.[id]
  if (override !== undefined) return override
  return DIMENSIONS[dimension].find(([value]) => value === id)?.[1] ?? 0
}
