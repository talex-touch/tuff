export type FileTypeTag =
  | 'text'
  | 'document'
  | 'spreadsheet'
  | 'presentation'
  | 'data'
  | 'code'
  | 'image'
  | 'video'
  | 'audio'
  | 'archive'
  | 'ebook'
  | 'installer'
  | 'design'
  | 'other'

export interface ExtensionMetadata {
  tags: FileTypeTag[]
  keywords: string[]
  enableContentIndexing: boolean
  /** Maximum size (in megabytes) for content extraction; undefined means use default */
  maxContentSizeMB?: number
}

const DEFAULT_CONTENT_SIZE_LIMIT_MB = 25

export const EXTENSION_METADATA: Record<string, ExtensionMetadata> = {
  // Text & documents
  '.txt': {
    tags: ['text', 'document'],
    keywords: ['text', 'document', 'note'],
    enableContentIndexing: true,
    maxContentSizeMB: 5
  },
  '.md': {
    tags: ['text', 'document', 'code'],
    keywords: ['markdown', 'document', 'note'],
    enableContentIndexing: true,
    maxContentSizeMB: 10
  },
  '.rtf': {
    tags: ['document'],
    keywords: ['rich text', 'document'],
    enableContentIndexing: true,
    maxContentSizeMB: 10
  },
  '.pdf': {
    tags: ['document'],
    keywords: ['pdf', 'document', 'ebook'],
    enableContentIndexing: true,
    maxContentSizeMB: 50
  },
  '.doc': {
    tags: ['document'],
    keywords: ['word', 'document'],
    enableContentIndexing: true,
    maxContentSizeMB: 40
  },
  '.docx': {
    tags: ['document'],
    keywords: ['word', 'document'],
    enableContentIndexing: true,
    maxContentSizeMB: 40
  },
  '.odt': {
    tags: ['document'],
    keywords: ['document', 'open office'],
    enableContentIndexing: true,
    maxContentSizeMB: 40
  },
  '.html': {
    tags: ['document', 'text'],
    keywords: ['html', 'web', 'document'],
    enableContentIndexing: true,
    maxContentSizeMB: 10
  },
  '.epub': {
    tags: ['ebook', 'document'],
    keywords: ['ebook', 'epub', 'book'],
    enableContentIndexing: true,
    maxContentSizeMB: 100
  },
  '.mobi': {
    tags: ['ebook', 'document'],
    keywords: ['ebook', 'mobi', 'book'],
    enableContentIndexing: true,
    maxContentSizeMB: 100
  },
  '.azw': {
    tags: ['ebook', 'document'],
    keywords: ['ebook', 'kindle', 'book'],
    enableContentIndexing: true,
    maxContentSizeMB: 100
  },
  '.ppt': {
    tags: ['presentation'],
    keywords: ['powerpoint', 'presentation', 'slide'],
    enableContentIndexing: true,
    maxContentSizeMB: 80
  },
  '.pptx': {
    tags: ['presentation'],
    keywords: ['powerpoint', 'presentation', 'slide'],
    enableContentIndexing: true,
    maxContentSizeMB: 80
  },
  '.key': {
    tags: ['presentation'],
    keywords: ['keynote', 'presentation', 'slide'],
    enableContentIndexing: true,
    maxContentSizeMB: 80
  },
  '.xls': {
    tags: ['spreadsheet', 'data'],
    keywords: ['excel', 'spreadsheet', 'sheet'],
    enableContentIndexing: true,
    maxContentSizeMB: 60
  },
  '.xlsx': {
    tags: ['spreadsheet', 'data'],
    keywords: ['excel', 'spreadsheet', 'sheet'],
    enableContentIndexing: true,
    maxContentSizeMB: 60
  },
  '.csv': {
    tags: ['spreadsheet', 'data'],
    keywords: ['csv', 'data'],
    enableContentIndexing: true,
    maxContentSizeMB: 15
  },
  '.json': {
    tags: ['data', 'code'],
    keywords: ['json', 'data'],
    enableContentIndexing: true,
    maxContentSizeMB: 10
  },
  '.xml': {
    tags: ['data', 'code'],
    keywords: ['xml', 'data'],
    enableContentIndexing: true,
    maxContentSizeMB: 10
  },
  '.yaml': {
    tags: ['data', 'code'],
    keywords: ['yaml', 'data'],
    enableContentIndexing: true,
    maxContentSizeMB: 10
  },
  '.yml': {
    tags: ['data', 'code'],
    keywords: ['yaml', 'data'],
    enableContentIndexing: true,
    maxContentSizeMB: 10
  },
  '.sql': {
    tags: ['data', 'code'],
    keywords: ['sql', 'database'],
    enableContentIndexing: true,
    maxContentSizeMB: 10
  },
  '.log': {
    tags: ['text'],
    keywords: ['log', 'text'],
    enableContentIndexing: true,
    maxContentSizeMB: 5
  },
  '.ini': {
    tags: ['text', 'code'],
    keywords: ['config', 'settings'],
    enableContentIndexing: true,
    maxContentSizeMB: 2
  },
  '.conf': {
    tags: ['text', 'code'],
    keywords: ['config', 'settings'],
    enableContentIndexing: true,
    maxContentSizeMB: 2
  },
  '.env': {
    tags: ['text', 'code'],
    keywords: ['env', 'config'],
    enableContentIndexing: true,
    maxContentSizeMB: 1
  },

  // Code files
  '.js': {
    tags: ['code'],
    keywords: ['javascript', 'code'],
    enableContentIndexing: true,
    maxContentSizeMB: 5
  },
  '.ts': {
    tags: ['code'],
    keywords: ['typescript', 'code'],
    enableContentIndexing: true,
    maxContentSizeMB: 5
  },
  '.tsx': {
    tags: ['code'],
    keywords: ['typescript', 'react', 'code'],
    enableContentIndexing: true,
    maxContentSizeMB: 5
  },
  '.jsx': {
    tags: ['code'],
    keywords: ['javascript', 'react', 'code'],
    enableContentIndexing: true,
    maxContentSizeMB: 5
  },
  '.py': {
    tags: ['code'],
    keywords: ['python', 'code'],
    enableContentIndexing: true,
    maxContentSizeMB: 5
  },
  '.go': {
    tags: ['code'],
    keywords: ['golang', 'code'],
    enableContentIndexing: true,
    maxContentSizeMB: 5
  },
  '.rs': {
    tags: ['code'],
    keywords: ['rust', 'code'],
    enableContentIndexing: true,
    maxContentSizeMB: 5
  },
  '.java': {
    tags: ['code'],
    keywords: ['java', 'code'],
    enableContentIndexing: true,
    maxContentSizeMB: 5
  },
  '.kt': {
    tags: ['code'],
    keywords: ['kotlin', 'code'],
    enableContentIndexing: true,
    maxContentSizeMB: 5
  },
  '.cs': {
    tags: ['code'],
    keywords: ['csharp', 'dotnet', 'code'],
    enableContentIndexing: true,
    maxContentSizeMB: 5
  },
  '.c': {
    tags: ['code'],
    keywords: ['c', 'code'],
    enableContentIndexing: true,
    maxContentSizeMB: 5
  },
  '.cpp': {
    tags: ['code'],
    keywords: ['cpp', 'c++', 'code'],
    enableContentIndexing: true,
    maxContentSizeMB: 5
  },
  '.swift': {
    tags: ['code'],
    keywords: ['swift', 'code'],
    enableContentIndexing: true,
    maxContentSizeMB: 5
  },
  '.php': {
    tags: ['code'],
    keywords: ['php', 'code'],
    enableContentIndexing: true,
    maxContentSizeMB: 5
  },
  '.rb': {
    tags: ['code'],
    keywords: ['ruby', 'code'],
    enableContentIndexing: true,
    maxContentSizeMB: 5
  },
  '.sh': {
    tags: ['code'],
    keywords: ['shell', 'script'],
    enableContentIndexing: true,
    maxContentSizeMB: 2
  },
  '.bat': {
    tags: ['code'],
    keywords: ['batch', 'script'],
    enableContentIndexing: true,
    maxContentSizeMB: 2
  },
  '.ps1': {
    tags: ['code'],
    keywords: ['powershell', 'script'],
    enableContentIndexing: true,
    maxContentSizeMB: 2
  },

  // Images
  '.jpg': {
    tags: ['image'],
    keywords: ['image', 'jpeg', 'picture', 'photo'],
    enableContentIndexing: false
  },
  '.jpeg': {
    tags: ['image'],
    keywords: ['image', 'jpeg', 'picture', 'photo'],
    enableContentIndexing: false
  },
  '.png': {
    tags: ['image'],
    keywords: ['image', 'png', 'picture', 'photo'],
    enableContentIndexing: false
  },
  '.gif': {
    tags: ['image'],
    keywords: ['gif', 'animation', 'image'],
    enableContentIndexing: false
  },
  '.bmp': {
    tags: ['image'],
    keywords: ['image', 'bitmap'],
    enableContentIndexing: false
  },
  '.tiff': {
    tags: ['image'],
    keywords: ['image', 'tiff'],
    enableContentIndexing: false
  },
  '.svg': {
    tags: ['image', 'design'],
    keywords: ['vector', 'svg'],
    enableContentIndexing: true,
    maxContentSizeMB: 5
  },
  '.webp': {
    tags: ['image'],
    keywords: ['image', 'webp'],
    enableContentIndexing: false
  },
  '.heic': {
    tags: ['image'],
    keywords: ['image', 'heic'],
    enableContentIndexing: false
  },

  // Video
  '.mp4': {
    tags: ['video'],
    keywords: ['video', 'mp4', 'movie'],
    enableContentIndexing: false
  },
  '.mov': {
    tags: ['video'],
    keywords: ['video', 'mov', 'movie'],
    enableContentIndexing: false
  },
  '.avi': {
    tags: ['video'],
    keywords: ['video', 'avi', 'movie'],
    enableContentIndexing: false
  },
  '.mkv': {
    tags: ['video'],
    keywords: ['video', 'mkv', 'movie'],
    enableContentIndexing: false
  },
  '.wmv': {
    tags: ['video'],
    keywords: ['video', 'wmv', 'movie'],
    enableContentIndexing: false
  },
  '.flv': {
    tags: ['video'],
    keywords: ['video', 'flv', 'movie'],
    enableContentIndexing: false
  },
  '.webm': {
    tags: ['video'],
    keywords: ['video', 'webm', 'movie'],
    enableContentIndexing: false
  },

  // Audio
  '.mp3': {
    tags: ['audio'],
    keywords: ['audio', 'music', 'mp3'],
    enableContentIndexing: false
  },
  '.wav': {
    tags: ['audio'],
    keywords: ['audio', 'sound', 'wav'],
    enableContentIndexing: false
  },
  '.flac': {
    tags: ['audio'],
    keywords: ['audio', 'flac', 'music'],
    enableContentIndexing: false
  },
  '.aac': {
    tags: ['audio'],
    keywords: ['audio', 'aac'],
    enableContentIndexing: false
  },
  '.ogg': {
    tags: ['audio'],
    keywords: ['audio', 'ogg'],
    enableContentIndexing: false
  },
  '.m4a': {
    tags: ['audio'],
    keywords: ['audio', 'm4a', 'music'],
    enableContentIndexing: false
  },

  // Archives
  '.zip': {
    tags: ['archive'],
    keywords: ['archive', 'compressed', 'zip'],
    enableContentIndexing: false
  },
  '.rar': {
    tags: ['archive'],
    keywords: ['archive', 'compressed', 'rar'],
    enableContentIndexing: false
  },
  '.7z': {
    tags: ['archive'],
    keywords: ['archive', 'compressed', '7z'],
    enableContentIndexing: false
  },
  '.tar': {
    tags: ['archive'],
    keywords: ['archive', 'compressed', 'tar'],
    enableContentIndexing: false
  },
  '.gz': {
    tags: ['archive'],
    keywords: ['archive', 'compressed', 'gz'],
    enableContentIndexing: false
  },
  '.bz2': {
    tags: ['archive'],
    keywords: ['archive', 'compressed', 'bz2'],
    enableContentIndexing: false
  },
  '.xz': {
    tags: ['archive'],
    keywords: ['archive', 'compressed', 'xz'],
    enableContentIndexing: false
  },

  // Installers & packages
  '.exe': {
    tags: ['installer'],
    keywords: ['application', 'exe', 'installer'],
    enableContentIndexing: false
  },
  '.msi': {
    tags: ['installer'],
    keywords: ['application', 'msi', 'installer'],
    enableContentIndexing: false
  },
  '.dmg': {
    tags: ['installer'],
    keywords: ['application', 'dmg', 'installer'],
    enableContentIndexing: false
  },
  '.pkg': {
    tags: ['installer'],
    keywords: ['application', 'pkg', 'installer'],
    enableContentIndexing: false
  },
  '.deb': {
    tags: ['installer'],
    keywords: ['application', 'deb', 'installer'],
    enableContentIndexing: false
  },
  '.rpm': {
    tags: ['installer'],
    keywords: ['application', 'rpm', 'installer'],
    enableContentIndexing: false
  },

  // Design formats
  '.psd': {
    tags: ['design', 'image'],
    keywords: ['photoshop', 'design', 'image'],
    enableContentIndexing: false
  },
  '.ai': {
    tags: ['design'],
    keywords: ['illustrator', 'design'],
    enableContentIndexing: false
  },
  '.xd': {
    tags: ['design'],
    keywords: ['adobe xd', 'design'],
    enableContentIndexing: false
  },
  '.sketch': {
    tags: ['design'],
    keywords: ['sketch', 'design'],
    enableContentIndexing: false
  }
}

export const WHITELISTED_EXTENSIONS = new Set(Object.keys(EXTENSION_METADATA))

export const KEYWORD_MAP: Record<string, string[]> = Object.fromEntries(
  Object.entries(EXTENSION_METADATA).map(([ext, metadata]) => [ext, metadata.keywords])
)

export const CONTENT_INDEXABLE_EXTENSIONS = new Set(
  Object.entries(EXTENSION_METADATA)
    .filter(([, metadata]) => metadata.enableContentIndexing)
    .map(([ext]) => ext)
)

export function getContentSizeLimitMB(extension: string): number {
  const metadata = EXTENSION_METADATA[extension]
  if (!metadata) return DEFAULT_CONTENT_SIZE_LIMIT_MB
  return metadata.maxContentSizeMB ?? DEFAULT_CONTENT_SIZE_LIMIT_MB
}

export const BLACKLISTED_DIRS = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  '.npm',
  '.yarn',
  '.m2',
  'dist',
  'build',
  'target',
  'out',
  'bin',
  'cache',
  '.cache',
  '.vscode',
  '.idea',
  // Mac specific
  'Library',
  'Application Support',
  'Applications',
  'System'
])

export const BLACKLISTED_FILES_PREFIX = new Set(['.'])
export const BLACKLISTED_FILES_SUFFIX = new Set(['~'])
export const BLACKLISTED_EXTENSIONS = new Set([
  '.tmp',
  '.temp',
  '.app',
  '.db',
  '.db-journal'
])

const typeTagExtensionMap: Record<FileTypeTag, string[]> = {
  text: [],
  document: [],
  spreadsheet: [],
  presentation: [],
  data: [],
  code: [],
  image: [],
  video: [],
  audio: [],
  archive: [],
  ebook: [],
  installer: [],
  design: [],
  other: []
}

for (const [ext, metadata] of Object.entries(EXTENSION_METADATA)) {
  for (const tag of metadata.tags) {
    typeTagExtensionMap[tag].push(ext)
  }
}

export const TYPE_TAG_EXTENSION_MAP = typeTagExtensionMap

export function getTypeTagsForExtension(extension: string): FileTypeTag[] {
  const metadata = EXTENSION_METADATA[extension]
  return metadata?.tags ?? ['other']
}
