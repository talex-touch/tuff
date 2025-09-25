import {
  FileParser,
  FileParserContext,
  FileParserProgress,
  FileParserResult,
  FileParserSelectionOptions
} from './types'

interface RegisteredParser {
  parser: FileParser
  extensions: Set<string>
  priority: number
}

export class FileParserRegistry {
  private readonly parsers: RegisteredParser[] = []

  register(parser: FileParser): void {
    const extensions = new Set(
      Array.from(parser.supportedExtensions).map((ext) => ext.trim().toLowerCase())
    )
    if (extensions.size === 0) {
      throw new Error(`[FileParserRegistry] Parser ${parser.id} registered without extensions`)
    }

    this.parsers.push({ parser, extensions, priority: parser.priority ?? 0 })
    this.parsers.sort((a, b) => b.priority - a.priority)
  }

  unregister(parserId: string): void {
    const index = this.parsers.findIndex(({ parser }) => parser.id === parserId)
    if (index >= 0) {
      this.parsers.splice(index, 1)
    }
  }

  getParsersForExtension(extension: string): FileParser[] {
    if (!extension) return []
    const normalized = extension.toLowerCase()
    return this.parsers
      .filter(({ extensions }) => extensions.has(normalized))
      .map(({ parser }) => parser)
  }

  getPreferredParser(extension: string, options?: FileParserSelectionOptions): FileParser | null {
    const [preferred] = this.getParsersForExtension(extension)
    if (!preferred && options?.allowFallback) {
      // Allow fallback to wildcard parsers if they exist in the registry
      const wildcard = this.parsers.find(({ extensions }) => extensions.has('*'))
      return wildcard?.parser ?? null
    }
    return preferred ?? null
  }

  async parseWithBestParser(
    context: FileParserContext,
    onProgress?: (progress: FileParserProgress) => void
  ): Promise<FileParserResult | null> {
    const candidates = this.getParsersForExtension(context.extension)
    const allParsers = context.extension !== '*' ? candidates : []

    if (context.extension !== '*') {
      const wildcard = this.getParsersForExtension('*')
      allParsers.push(...wildcard)
    }

    for (const parser of allParsers) {
      if (parser.canParse && !(await parser.canParse(context))) {
        continue
      }
      try {
        const result = await parser.parse(context, onProgress)
        if (!result) {
          continue
        }
        if (result.status !== 'skipped') {
          return result
        }
      } catch (error) {
        console.error(`[FileParserRegistry] Parser ${parser.id} failed:`, error)
        return {
          status: 'failed',
          reason: error instanceof Error ? error.message : 'unknown-error'
        }
      }
    }

    return null
  }
}

export const fileParserRegistry = new FileParserRegistry()
