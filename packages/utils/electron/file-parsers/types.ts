export type FileParserStatus = 'success' | 'skipped' | 'failed'

export interface FileParserContext {
  filePath: string
  extension: string
  size: number
  maxBytes?: number
  metadata?: Record<string, any>
  signal?: AbortSignal
}

export interface FileParserProgress {
  processedBytes?: number
  totalBytes?: number
  percentage?: number
  message?: string
}

export interface FileParserEmbedding {
  provider: string
  model: string
  vector: number[]
  metadata?: Record<string, any>
}

export interface FileParserResult {
  status: FileParserStatus
  content?: string
  metadata?: Record<string, any>
  tags?: string[]
  warnings?: string[]
  processedBytes?: number
  totalBytes?: number
  reason?: string
  embeddings?: FileParserEmbedding[]
  durationMs?: number
}

export interface FileParser {
  readonly id: string
  /** Higher priority parsers win when multiple support the same extension */
  readonly priority?: number
  readonly supportedExtensions: string[] | Set<string>
  canParse?: (context: FileParserContext) => boolean | Promise<boolean>
  parse: (
    context: FileParserContext,
    onProgress?: (progress: FileParserProgress) => void,
  ) => Promise<FileParserResult>
}

export interface FileParserSelectionOptions {
  allowFallback?: boolean
}

export interface FileParserRegistryOptions {
  /** When true, registry falls back to lower priority parsers if the preferred one skips */
  enableFallback?: boolean
}
