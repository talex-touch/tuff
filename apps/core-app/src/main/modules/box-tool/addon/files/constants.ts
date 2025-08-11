export const KEYWORD_MAP: Record<string, string[]> = {
  // Documents
  '.txt': ['text', 'document', 'note'],
  '.pdf': ['pdf', 'document', 'ebook'],
  '.doc': ['word', 'document'],
  '.docx': ['word', 'document'],
  '.xls': ['excel', 'spreadsheet', 'sheet'],
  '.xlsx': ['excel', 'spreadsheet', 'sheet'],
  '.ppt': ['powerpoint', 'presentation', 'slide'],
  '.pptx': ['powerpoint', 'presentation', 'slide'],
  '.rtf': ['document', 'text'],
  '.md': ['markdown', 'document', 'text'],
  // Media
  '.jpg': ['image', 'jpeg', 'picture', 'photo'],
  '.jpeg': ['image', 'jpeg', 'picture', 'photo'],
  '.png': ['image', 'picture', 'photo'],
  '.gif': ['image', 'gif', 'animation'],
  '.bmp': ['image', 'bitmap'],
  '.mp4': ['video', 'movie'],
  '.avi': ['video', 'movie'],
  '.mkv': ['video', 'movie'],
  '.mov': ['video', 'movie'],
  '.wmv': ['video', 'movie'],
  '.flv': ['video', 'movie'],
  '.mp3': ['audio', 'music', 'sound'],
  '.wav': ['audio', 'sound'],
  '.flac': ['audio', 'music'],
  // Archives
  '.zip': ['archive', 'compressed'],
  '.rar': ['archive', 'compressed'],
  '.7z': ['archive', 'compressed'],
  '.tar': ['archive', 'compressed'],
  '.gz': ['archive', 'compressed'],
  '.bz2': ['archive', 'compressed'],
  // Data
  '.csv': ['data', 'spreadsheet', 'comma separated'],
  '.json': ['data', 'json'],
  '.xml': ['data', 'xml'],
  '.yaml': ['data', 'yaml', 'yml'],
  '.yml': ['data', 'yaml', 'yml'],
  // Ebooks
  '.epub': ['ebook', 'book'],
  '.mobi': ['ebook', 'book'],
  // Installers
  '.exe': ['application', 'executable', 'installer'],
  '.msi': ['application', 'installer'],
  '.dmg': ['application', 'installer', 'disk image'],
  '.deb': ['application', 'installer', 'debian package'],
  '.rpm': ['application', 'installer', 'redhat package']
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
export const BLACKLISTED_EXTENSIONS = new Set(['.tmp', '.temp', '.log', '.app'])

export const WHITELISTED_EXTENSIONS = new Set([
  // Docs
  '.txt',
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.rtf',
  '.md',
  // Media
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.bmp',
  '.mp4',
  '.avi',
  '.mkv',
  '.mov',
  '.wmv',
  '.flv',
  '.mp3',
  '.wav',
  '.flac',
  // Archives
  '.zip',
  '.rar',
  '.7z',
  '.tar',
  '.gz',
  '.bz2',
  // Data
  '.csv',
  '.json',
  '.xml',
  '.yaml',
  '.yml',
  // Ebooks
  '.epub',
  '.mobi',
  // Installers
  '.exe',
  '.msi',
  '.dmg',
  '.deb',
  '.rpm'
])
