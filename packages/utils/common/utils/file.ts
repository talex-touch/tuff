// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = typeof window === 'undefined'
  ? require('path')
  : require('path-browserify')

/**
 * Enum for various file types.
 * @enum {string}
 */
export enum FileType {
  Image = 'Image',
  Document = 'Document',
  Audio = 'Audio',
  Video = 'Video',
  Archive = 'Archive',
  Code = 'Code',
  Text = 'Text',
  Design = 'Design',
  Model3D = '3D Model',
  Font = 'Font',
  Spreadsheet = 'Spreadsheet',
  Presentation = 'Presentation',
  Ebook = 'Ebook',
  Other = 'Other'
}

const extensionMap: Map<FileType, Set<string>> = new Map([
  [FileType.Image, new Set(['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico', '.tiff'])],
  [FileType.Document, new Set(['.doc', '.docx', '.pdf', '.odt', '.rtf'])],
  [FileType.Audio, new Set(['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a'])],
  [FileType.Video, new Set(['.mp4', '.avi', '.mov', '.wmv', '.mkv', '.flv', '.webm'])],
  [FileType.Archive, new Set(['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2'])],
  [FileType.Code, new Set(['.js', '.ts', '.jsx', '.tsx', '.html', '.css', '.scss', '.json', '.xml', '.java', '.py', '.c', '.cpp', '.go', '.rs', '.php', '.sh'])],
  [FileType.Text, new Set(['.txt', '.md', '.log'])],
  [FileType.Design, new Set(['.psd', '.ai', '.fig', '.sketch', '.xd', '.afdesign'])],
  [FileType.Model3D, new Set(['.obj', '.fbx', '.stl', '.dae', '.blend', '.3ds'])],
  [FileType.Font, new Set(['.ttf', '.otf', '.woff', '.woff2'])],
  [FileType.Spreadsheet, new Set(['.xls', '.xlsx', '.csv', '.numbers'])],
  [FileType.Presentation, new Set(['.ppt', '.pptx', '.key'])],
  [FileType.Ebook, new Set(['.epub', '.mobi', '.azw'])]
]);

/**
 * Get the file type from a file path.
 * @param {string} filePath - The path to the file.
 * @returns {FileType} The type of the file.
 */
export function getFileTypeFromPath(filePath: string): FileType {
  const extension = path.extname(filePath).toLowerCase()
  return getFileTypeFromExtension(extension)
}

/**
 * Get the file type from a file extension.
 * @param {string} extension - The file extension, including the dot.
 * @returns {FileType} The type of the file.
 */
export function getFileTypeFromExtension(extension: string): FileType {
  for (const [type, extensions] of extensionMap.entries()) {
    if (extensions.has(extension)) {
      return type
    }
  }
  return FileType.Other
}
