import type { FileTypeTag } from '../modules/box-tool/addon/files/constants'

/**
 * File type alias mappings for search queries
 * Maps common search terms to their corresponding file type tags
 */
export const TYPE_ALIAS_MAP: Record<string, FileTypeTag> = {
  video: 'video',
  videos: 'video',
  movie: 'video',
  movies: 'video',
  视频: 'video',
  影片: 'video',
  audio: 'audio',
  audios: 'audio',
  music: 'audio',
  song: 'audio',
  songs: 'audio',
  音频: 'audio',
  音乐: 'audio',
  document: 'document',
  documents: 'document',
  doc: 'document',
  docs: 'document',
  pdf: 'document',
  text: 'text',
  texts: 'text',
  note: 'text',
  notes: 'text',
  image: 'image',
  images: 'image',
  picture: 'image',
  pictures: 'image',
  photo: 'image',
  photos: 'image',
  图片: 'image',
  截图: 'image',
  spreadsheet: 'spreadsheet',
  spreadsheets: 'spreadsheet',
  excel: 'spreadsheet',
  sheet: 'spreadsheet',
  sheets: 'spreadsheet',
  table: 'spreadsheet',
  tables: 'spreadsheet',
  data: 'data',
  dataset: 'data',
  csv: 'data',
  code: 'code',
  codes: 'code',
  source: 'code',
  sources: 'code',
  script: 'code',
  scripts: 'code',
  archive: 'archive',
  archives: 'archive',
  zip: 'archive',
  zips: 'archive',
  压缩包: 'archive',
  installer: 'installer',
  installers: 'installer',
  setup: 'installer',
  安装包: 'installer',
  ebook: 'ebook',
  ebooks: 'ebook',
  book: 'ebook',
  books: 'ebook',
  design: 'design',
  designs: 'design',
  设计: 'design'
}

/**
 * File index status enumeration
 */
export const FILE_INDEX_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed'
} as const

export type FileIndexStatus = (typeof FILE_INDEX_STATUS)[keyof typeof FILE_INDEX_STATUS]
