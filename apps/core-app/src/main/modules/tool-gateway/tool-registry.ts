import { readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, resolve } from 'node:path'

/**
 * How much damage a tool can do, which decides whether a session-level
 * "remember" is allowed to skip its confirmation.
 */
export type ToolRisk = 'read' | 'write' | 'execute'

export interface ToolResult {
  output: string
  isError: boolean
}

export interface ToolDefinition {
  name: string
  risk: ToolRisk
  /** One-line description shown on the confirmation card. */
  summarize: (args: Record<string, unknown>) => string
  execute: (args: Record<string, unknown>) => Promise<ToolResult>
}

/** Only read-risk tools may be waved through by a remembered approval. */
export function isRememberable(risk: ToolRisk): boolean {
  return risk === 'read'
}

function readStringArg(args: Record<string, unknown>, key: string): string {
  const value = args[key]
  return typeof value === 'string' ? value : ''
}

/**
 * Resolves a user-supplied path to an absolute one, expanding `~`. Paths are
 * not* sandboxed to a root here: the confirmation dialog shows the resolved
 * path and the user approves that exact string, so the gate is consent rather
 * than a fixed allowlist — which would make "read the file I'm asking about"
 * impossible.
 */
export function resolveUserPath(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return ''
  const expanded = trimmed.startsWith('~') ? trimmed.replace(/^~/, homedir()) : trimmed
  return isAbsolute(expanded) ? expanded : resolve(expanded)
}

/** Reading more than this into a model's context is never the intent. */
const MAX_READ_BYTES = 256 * 1024

const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.bmp',
  '.ico',
  '.icns',
  '.pdf',
  '.zip',
  '.gz',
  '.tar',
  '.7z',
  '.dmg',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.mp3',
  '.mp4',
  '.mov',
  '.avi',
  '.wav',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf'
])

function looksBinary(path: string): boolean {
  const dot = path.lastIndexOf('.')
  return dot >= 0 && BINARY_EXTENSIONS.has(path.slice(dot).toLowerCase())
}

export interface ToolRegistryOptions {
  /** Injected so the gateway can be tested without the search subsystem. */
  searchFiles: (query: string, limit: number) => Promise<Array<{ name: string; path: string }>>
  openPath: (path: string) => Promise<string>
}

export function createToolRegistry(options: ToolRegistryOptions): Map<string, ToolDefinition> {
  const tools: ToolDefinition[] = [
    {
      name: 'tuff_search_files',
      risk: 'read',
      summarize: (args) => `Search files for "${readStringArg(args, 'query')}"`,
      execute: async (args) => {
        const query = readStringArg(args, 'query').trim()
        if (!query) return { output: 'query is required', isError: true }
        const limitArg = args.limit
        const limit = typeof limitArg === 'number' && limitArg > 0 ? Math.min(limitArg, 50) : 20

        const results = await options.searchFiles(query, limit)
        if (results.length === 0) return { output: 'No files matched.', isError: false }
        return {
          output: results.map((item) => `${item.name}\t${item.path}`).join('\n'),
          isError: false
        }
      }
    },
    {
      name: 'tuff_read_file',
      risk: 'read',
      summarize: (args) => `Read ${readStringArg(args, 'path')}`,
      execute: async (args) => {
        const path = resolveUserPath(readStringArg(args, 'path'))
        if (!path) return { output: 'path is required', isError: true }
        if (looksBinary(path)) return { output: 'Refusing to read a binary file.', isError: true }

        try {
          const info = await stat(path)
          if (info.isDirectory()) return { output: 'Path is a directory.', isError: true }
          if (info.size > MAX_READ_BYTES) {
            return {
              output: `File is ${Math.round(info.size / 1024)}KB, over the ${MAX_READ_BYTES / 1024}KB read limit.`,
              isError: true
            }
          }
          return { output: await readFile(path, 'utf8'), isError: false }
        } catch (error) {
          return { output: `Could not read file: ${(error as Error).message}`, isError: true }
        }
      }
    },
    {
      name: 'tuff_open_path',
      risk: 'execute',
      summarize: (args) => `Open ${readStringArg(args, 'path')} in the system default app`,
      execute: async (args) => {
        const path = resolveUserPath(readStringArg(args, 'path'))
        if (!path) return { output: 'path is required', isError: true }
        const failure = await options.openPath(path)
        return failure
          ? { output: `Could not open: ${failure}`, isError: true }
          : { output: `Opened ${path}`, isError: false }
      }
    }
  ]

  return new Map(tools.map((tool) => [tool.name, tool]))
}
