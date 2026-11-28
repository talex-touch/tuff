/**
 * File Tools
 *
 * Built-in tools for file operations. write/delete/copy/move run through the conversation file
 * review lifecycle: with a Main-supplied `ctx.workspace` the mutation is confined to the
 * conversation's project, serialized per path and recorded with before/after evidence; without one
 * it behaves as it always has (path locks only, nothing recorded).
 */

import type { AgentPermission } from '@talex-touch/utils'
import type { Dirent } from 'node:fs'
import type { ToolExecutionContext } from '../tool-registry'
import { constants as fsConstants, promises as fs } from 'node:fs'
import * as path from 'node:path'
import process from 'node:process'
import { app } from 'electron'
import { resolveRuntimeRootPath } from '../../../../utils/app-root-path'
import {
  checkConfinement,
  isCredentialPath,
  relativeInside,
  resolveToolPath
} from '../../../conversation/file-review-fs'
import { fileReviewService } from '../../../conversation/file-review-service'
import { toolRegistry } from '../tool-registry'

const MAX_FILE_READ_BYTES = 4 * 1024 * 1024

function resolveRuntimeRootSafe(): string | null {
  try {
    return resolveRuntimeRootPath(app)
  } catch {
    return null
  }
}

function isMissingFsError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null)?.code
  return code === 'ENOENT' || code === 'ENOTDIR'
}

async function resolveConfinedWorkspaceRoot(ctx: ToolExecutionContext): Promise<string> {
  const rawRoot = ctx.workingDirectory || process.cwd()
  return await fs.realpath(rawRoot)
}

async function assertConfinedToolPath(
  filePath: string,
  ctx: ToolExecutionContext,
  options: { allowDirectory?: boolean; allowMissing?: boolean } = {}
): Promise<{ canonicalRoot: string; resolvedPath: string; relativePath: string }> {
  if (typeof filePath !== 'string' || !filePath.trim() || filePath.includes('\0')) {
    throw new Error('TOOL_RESOURCE_ACCESS_DENIED')
  }
  const canonicalRoot = await resolveConfinedWorkspaceRoot(ctx)
  const resolvedPath = resolveToolPath(filePath, canonicalRoot)

  if (resolvedPath === canonicalRoot) {
    if (!options.allowDirectory) {
      throw new Error('TOOL_RESOURCE_ACCESS_DENIED')
    }
    return { canonicalRoot, resolvedPath, relativePath: '' }
  }

  const relativePath = relativeInside(canonicalRoot, resolvedPath)
  if (relativePath === null) {
    throw new Error('TOOL_RESOURCE_ACCESS_DENIED')
  }

  if (isCredentialPath(relativePath, resolvedPath, resolveRuntimeRootSafe())) {
    throw new Error('TOOL_RESOURCE_ACCESS_DENIED')
  }

  const confinement = await checkConfinement(canonicalRoot, resolvedPath)
  if (confinement === 'outside' || confinement === 'symlink') {
    throw new Error('TOOL_RESOURCE_ACCESS_DENIED')
  }
  if (confinement === 'not_file') {
    if (!options.allowDirectory) {
      throw new Error('TOOL_RESOURCE_ACCESS_DENIED')
    }
    try {
      const leafStat = await fs.lstat(resolvedPath)
      if (leafStat.isSymbolicLink() || !leafStat.isDirectory()) {
        throw new Error('TOOL_RESOURCE_ACCESS_DENIED')
      }
    } catch (error) {
      if (!options.allowMissing || !isMissingFsError(error)) {
        throw new Error('TOOL_RESOURCE_ACCESS_DENIED')
      }
    }
  }

  return { canonicalRoot, resolvedPath, relativePath }
}

async function readConfinedFileText(
  resolvedPath: string,
  encoding: BufferEncoding,
  maxBytes: number
): Promise<string> {
  const flags =
    fsConstants.O_RDONLY | (typeof fsConstants.O_NOFOLLOW === 'number' ? fsConstants.O_NOFOLLOW : 0)
  const handle = await fs.open(resolvedPath, flags)
  try {
    const stats = await handle.stat()
    if (!stats.isFile()) {
      throw new Error('TOOL_RESOURCE_ACCESS_DENIED')
    }
    if (stats.size > maxBytes) {
      throw new Error('FILE_TOO_LARGE')
    }
    const chunks: Buffer[] = []
    let total = 0
    const scratch = Buffer.allocUnsafe(Math.min(64 * 1024, maxBytes + 1))
    while (true) {
      const { bytesRead } = await handle.read(scratch, 0, scratch.length, null)
      if (bytesRead === 0) break
      total += bytesRead
      if (total > maxBytes) {
        throw new Error('FILE_TOO_LARGE')
      }
      chunks.push(Buffer.from(scratch.subarray(0, bytesRead)))
    }
    const buffer = chunks.length === 1 ? chunks[0]! : Buffer.concat(chunks, total)
    return buffer.toString(encoding)
  } finally {
    await handle.close().catch(() => undefined)
  }
}

/**
 * Register all file tools
 */
export function registerFileTools(): void {
  // file.read - Read file contents
  toolRegistry.registerTool(
    {
      id: 'file.read',
      name: 'Read File',
      description: 'Read the contents of a file. Returns the file content as text.',
      category: 'file',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the file to read' },
          encoding: { type: 'string', description: 'File encoding (default: utf-8)' }
        },
        required: ['path']
      },
      permissions: ['file:read' as AgentPermission]
    },
    async (input: unknown, ctx: ToolExecutionContext) => {
      const { path: filePath, encoding = 'utf-8' } = input as { path: string; encoding?: string }
      const { resolvedPath } = await assertConfinedToolPath(filePath, ctx)
      return await readConfinedFileText(
        resolvedPath,
        encoding as BufferEncoding,
        MAX_FILE_READ_BYTES
      )
    }
  )

  // file.write - Write file contents
  toolRegistry.registerTool(
    {
      id: 'file.write',
      name: 'Write File',
      description: 'Write content to a file. Creates the file if it does not exist.',
      category: 'file',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the file to write' },
          content: { type: 'string', description: 'Content to write to the file' },
          encoding: { type: 'string', description: 'File encoding (default: utf-8)' }
        },
        required: ['path', 'content']
      },
      permissions: ['file:write' as AgentPermission]
    },
    async (input: unknown, ctx: ToolExecutionContext) => {
      const {
        path: filePath,
        content,
        encoding = 'utf-8'
      } = input as {
        path: string
        content: string
        encoding?: string
      }
      return fileReviewService.executeFileOperation(
        ctx,
        'write',
        [filePath],
        async ([resolvedPath]) => {
          // Ensure directory exists
          await fs.mkdir(path.dirname(resolvedPath!), { recursive: true })
          await fs.writeFile(resolvedPath!, content, { encoding: encoding as BufferEncoding })
          return { success: true, path: resolvedPath }
        }
      )
    }
  )

  // file.exists - Check if file exists
  toolRegistry.registerTool(
    {
      id: 'file.exists',
      name: 'Check File Exists',
      description: 'Check if a file or directory exists.',
      category: 'file',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to check' }
        },
        required: ['path']
      },
      permissions: ['file:read' as AgentPermission]
    },
    async (input: unknown, ctx: ToolExecutionContext) => {
      const { path: filePath } = input as { path: string }
      const { resolvedPath } = await assertConfinedToolPath(filePath, ctx, {
        allowDirectory: true,
        allowMissing: true
      })

      try {
        await fs.lstat(resolvedPath)
        return { exists: true, path: resolvedPath }
      } catch {
        return { exists: false, path: resolvedPath }
      }
    }
  )

  // file.list - List directory contents
  toolRegistry.registerTool(
    {
      id: 'file.list',
      name: 'List Directory',
      description: 'List files and directories in a path.',
      category: 'file',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory path to list' },
          recursive: { type: 'boolean', description: 'Whether to list recursively' }
        },
        required: ['path']
      },
      permissions: ['file:read' as AgentPermission]
    },
    async (input: unknown, ctx: ToolExecutionContext) => {
      const { path: dirPath, recursive = false } = input as { path: string; recursive?: boolean }
      const { canonicalRoot, resolvedPath } = await assertConfinedToolPath(dirPath, ctx, {
        allowDirectory: true
      })
      const runtimeRoot = resolveRuntimeRootSafe()

      const entries = await fs.readdir(resolvedPath, { withFileTypes: true })
      const items: { name: string; type: 'file' | 'directory'; path: string }[] = []

      for (const entry of entries) {
        if (entry.isSymbolicLink()) continue
        const itemPath = path.join(resolvedPath, entry.name)
        const rel = relativeInside(canonicalRoot, itemPath)
        if (!rel || isCredentialPath(rel, itemPath, runtimeRoot)) continue
        items.push({
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : 'file',
          path: itemPath
        })

        if (recursive && entry.isDirectory()) {
          // Recursively list subdirectory (simplified, symlinks & credentials skipped)
          try {
            const subEntries = await fs.readdir(itemPath, { withFileTypes: true })
            for (const subEntry of subEntries) {
              if (subEntry.isSymbolicLink()) continue
              const subPath = path.join(itemPath, subEntry.name)
              const subRel = relativeInside(canonicalRoot, subPath)
              if (!subRel || isCredentialPath(subRel, subPath, runtimeRoot)) continue
              items.push({
                name: path.join(entry.name, subEntry.name),
                type: subEntry.isDirectory() ? 'directory' : 'file',
                path: subPath
              })
            }
          } catch {
            // Ignore errors in subdirectories
          }
        }
      }

      return items
    }
  )

  // file.delete - Delete a file
  toolRegistry.registerTool(
    {
      id: 'file.delete',
      name: 'Delete File',
      description: 'Delete a file or empty directory.',
      category: 'file',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to delete' }
        },
        required: ['path']
      },
      permissions: ['file:delete' as AgentPermission]
    },
    async (input: unknown, ctx: ToolExecutionContext) => {
      const { path: filePath } = input as { path: string }
      return fileReviewService.executeFileOperation(
        ctx,
        'delete',
        [filePath],
        async ([resolvedPath]) => {
          await fs.unlink(resolvedPath!)
          return { success: true, deleted: resolvedPath }
        }
      )
    }
  )

  // file.copy - Copy a file
  toolRegistry.registerTool(
    {
      id: 'file.copy',
      name: 'Copy File',
      description: 'Copy a file from source to destination.',
      category: 'file',
      inputSchema: {
        type: 'object',
        properties: {
          source: { type: 'string', description: 'Source file path' },
          destination: { type: 'string', description: 'Destination file path' }
        },
        required: ['source', 'destination']
      },
      permissions: ['file:read' as AgentPermission, 'file:write' as AgentPermission]
    },
    async (input: unknown, ctx: ToolExecutionContext) => {
      const { source, destination } = input as { source: string; destination: string }
      return fileReviewService.executeFileOperation(
        ctx,
        'copy',
        [source, destination],
        async ([srcPath, destPath]) => {
          // Ensure destination directory exists
          await fs.mkdir(path.dirname(destPath!), { recursive: true })
          await fs.copyFile(srcPath!, destPath!)
          return { success: true, source: srcPath, destination: destPath }
        }
      )
    }
  )

  // file.move - Move/rename a file
  toolRegistry.registerTool(
    {
      id: 'file.move',
      name: 'Move File',
      description: 'Move or rename a file.',
      category: 'file',
      inputSchema: {
        type: 'object',
        properties: {
          source: { type: 'string', description: 'Source file path' },
          destination: { type: 'string', description: 'Destination file path' }
        },
        required: ['source', 'destination']
      },
      permissions: [
        'file:read' as AgentPermission,
        'file:write' as AgentPermission,
        'file:delete' as AgentPermission
      ]
    },
    async (input: unknown, ctx: ToolExecutionContext) => {
      const { source, destination } = input as { source: string; destination: string }
      return fileReviewService.executeFileOperation(
        ctx,
        'move',
        [source, destination],
        async ([srcPath, destPath]) => {
          // Ensure destination directory exists
          await fs.mkdir(path.dirname(destPath!), { recursive: true })
          await fs.rename(srcPath!, destPath!)
          return { success: true, source: srcPath, destination: destPath }
        }
      )
    }
  )

  // file.info - Get file info
  toolRegistry.registerTool(
    {
      id: 'file.info',
      name: 'Get File Info',
      description: 'Get information about a file (size, modified time, etc).',
      category: 'file',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the file' }
        },
        required: ['path']
      },
      permissions: ['file:read' as AgentPermission]
    },
    async (input: unknown, ctx: ToolExecutionContext) => {
      const { path: filePath } = input as { path: string }
      const { resolvedPath } = await assertConfinedToolPath(filePath, ctx, {
        allowDirectory: true
      })

      const stats = await fs.lstat(resolvedPath)

      return {
        path: resolvedPath,
        name: path.basename(resolvedPath),
        size: stats.size,
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
        createdAt: stats.birthtime.toISOString(),
        modifiedAt: stats.mtime.toISOString(),
        accessedAt: stats.atime.toISOString()
      }
    }
  )

  // file.search - Search file contents across workspace files
  const EXCLUDED_DIRS = new Set([
    '.git',
    'node_modules',
    'dist',
    'build',
    '.turbo',
    '.next',
    '.nuxt',
    'target'
  ])
  const MAX_FILE_SEARCH_BYTES = 2 * 1024 * 1024

  toolRegistry.registerTool(
    {
      id: 'file.search',
      name: 'Search Files',
      description:
        'Search file contents across workspace files for a text string or regular expression.',
      category: 'file',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Directory path to search in (relative to working directory, default: .)'
          },
          pattern: { type: 'string', description: 'Search pattern (plain text or regex)' },
          regex: { type: 'boolean', description: 'Whether pattern is a regular expression' },
          maxResults: { type: 'number', description: 'Maximum matching lines to return (max 50)' }
        },
        required: ['pattern']
      },
      permissions: ['file:read' as AgentPermission]
    },
    async (input: unknown, ctx: ToolExecutionContext) => {
      const parsed = input as {
        path?: string
        pattern: string
        regex?: boolean
        maxResults?: number
      }
      const { canonicalRoot, resolvedPath: searchDir } = await assertConfinedToolPath(
        parsed.path || '.',
        ctx,
        { allowDirectory: true }
      )
      const runtimeRoot = resolveRuntimeRootSafe()
      const maxMatches = Math.min(Math.max(1, parsed.maxResults ?? 30), 50)
      let matcher: RegExp
      try {
        matcher = parsed.regex
          ? new RegExp(parsed.pattern, 'u')
          : new RegExp(parsed.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ui')
      } catch {
        throw new Error('INVALID_REGEX_PATTERN')
      }

      const matches: Array<{ file: string; line: number; text: string }> = []
      const walk = async (currentDir: string): Promise<void> => {
        if (matches.length >= maxMatches) return
        let entries: Dirent[]
        try {
          entries = await fs.readdir(currentDir, { withFileTypes: true })
        } catch {
          return
        }
        for (const entry of entries) {
          if (matches.length >= maxMatches) break
          if (entry.isSymbolicLink()) continue
          const entryPath = path.join(currentDir, entry.name)
          const rel = relativeInside(canonicalRoot, entryPath)
          if (!rel || isCredentialPath(rel, entryPath, runtimeRoot)) continue
          if (entry.isDirectory()) {
            if (!EXCLUDED_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
              await walk(entryPath)
            }
            continue
          }
          if (!entry.isFile()) continue
          try {
            const content = await readConfinedFileText(entryPath, 'utf8', MAX_FILE_SEARCH_BYTES)
            const lines = content.split(/\r?\n/)
            for (let i = 0; i < lines.length; i++) {
              if (matcher.test(lines[i]!)) {
                matches.push({
                  file: path.relative(canonicalRoot, entryPath),
                  line: i + 1,
                  text: lines[i]!.slice(0, 300).trim()
                })
                if (matches.length >= maxMatches) break
              }
            }
          } catch {
            // Ignore unreadable, oversized, symlinked, or non-regular files
          }
        }
      }
      await walk(searchDir)
      return { matches, count: matches.length }
    }
  )
}
