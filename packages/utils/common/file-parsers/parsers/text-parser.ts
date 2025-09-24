import fs from 'fs/promises'
import path from 'path'
import {
  FileParser,
  FileParserContext,
  FileParserProgress,
  FileParserResult
} from '../types'

const TEXTUAL_EXTENSIONS = new Set(
  [
    '.txt',
    '.md',
    '.rtf',
    '.json',
    '.yaml',
    '.yml',
    '.xml',
    '.csv',
    '.log',
    '.ini',
    '.conf',
    '.env',
    '.html',
    '.htm',
    '.js',
    '.ts',
    '.tsx',
    '.jsx',
    '.py',
    '.go',
    '.rs',
    '.java',
    '.kt',
    '.cs',
    '.c',
    '.cpp',
    '.cc',
    '.hpp',
    '.m',
    '.mm',
    '.swift',
    '.php',
    '.rb',
    '.sh',
    '.bash',
    '.zsh',
    '.fish',
    '.bat',
    '.ps1',
    '.sql'
  ].map((ext) => ext.toLowerCase())
)

export class TextFileParser implements FileParser {
  readonly id = 'text-file-parser'
  readonly priority = 100
  readonly supportedExtensions = TEXTUAL_EXTENSIONS

  async parse(
    context: FileParserContext,
    onProgress?: (progress: FileParserProgress) => void
  ): Promise<FileParserResult> {
    const { filePath, extension, size, maxBytes } = context
    if (maxBytes && size > maxBytes) {
      return {
        status: 'skipped',
        reason: 'file-too-large',
        totalBytes: size,
        processedBytes: 0,
        warnings: [
          `File size ${(size / (1024 * 1024)).toFixed(2)}MB exceeds limit ${(maxBytes / (1024 * 1024)).toFixed(2)}MB`
        ]
      }
    }

    if (!TEXTUAL_EXTENSIONS.has(extension)) {
      return {
        status: 'skipped',
        reason: 'unsupported-extension'
      }
    }

    try {
      const content = await fs.readFile(filePath, 'utf8')
      if (onProgress) {
        onProgress({ processedBytes: size, totalBytes: size, percentage: 1 })
      }

      return {
        status: 'success',
        content,
        metadata: {
          length: content.length,
          basename: path.basename(filePath)
        },
        processedBytes: size,
        totalBytes: size
      }
    } catch (error) {
      return {
        status: 'failed',
        reason: error instanceof Error ? error.message : 'unknown-error'
      }
    }
  }
}

export const textFileParser = new TextFileParser()
