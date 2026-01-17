/**
 * File Tools
 *
 * Built-in tools for file operations.
 */

import type { AgentPermission } from '@talex-touch/utils'
import type { ToolExecutionContext } from '../tool-registry'
import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import { toolRegistry } from '../tool-registry'

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
      const resolvedPath = resolvePath(filePath, ctx.workingDirectory)
      return fs.readFile(resolvedPath, { encoding: encoding as BufferEncoding })
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
      const resolvedPath = resolvePath(filePath, ctx.workingDirectory)

      // Ensure directory exists
      await fs.mkdir(path.dirname(resolvedPath), { recursive: true })
      await fs.writeFile(resolvedPath, content, { encoding: encoding as BufferEncoding })

      return { success: true, path: resolvedPath }
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
      const resolvedPath = resolvePath(filePath, ctx.workingDirectory)

      try {
        await fs.access(resolvedPath)
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
      const resolvedPath = resolvePath(dirPath, ctx.workingDirectory)

      const entries = await fs.readdir(resolvedPath, { withFileTypes: true })
      const items: { name: string; type: 'file' | 'directory'; path: string }[] = []

      for (const entry of entries) {
        const itemPath = path.join(resolvedPath, entry.name)
        items.push({
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : 'file',
          path: itemPath
        })

        if (recursive && entry.isDirectory()) {
          // Recursively list subdirectory (simplified)
          try {
            const subEntries = await fs.readdir(itemPath, { withFileTypes: true })
            for (const subEntry of subEntries) {
              items.push({
                name: path.join(entry.name, subEntry.name),
                type: subEntry.isDirectory() ? 'directory' : 'file',
                path: path.join(itemPath, subEntry.name)
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
      const resolvedPath = resolvePath(filePath, ctx.workingDirectory)

      await fs.unlink(resolvedPath)
      return { success: true, deleted: resolvedPath }
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
      const srcPath = resolvePath(source, ctx.workingDirectory)
      const destPath = resolvePath(destination, ctx.workingDirectory)

      // Ensure destination directory exists
      await fs.mkdir(path.dirname(destPath), { recursive: true })
      await fs.copyFile(srcPath, destPath)

      return { success: true, source: srcPath, destination: destPath }
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
      const srcPath = resolvePath(source, ctx.workingDirectory)
      const destPath = resolvePath(destination, ctx.workingDirectory)

      // Ensure destination directory exists
      await fs.mkdir(path.dirname(destPath), { recursive: true })
      await fs.rename(srcPath, destPath)

      return { success: true, source: srcPath, destination: destPath }
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
      const resolvedPath = resolvePath(filePath, ctx.workingDirectory)

      const stats = await fs.stat(resolvedPath)

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
}

/**
 * Resolve path relative to working directory
 */
function resolvePath(filePath: string, workingDirectory?: string): string {
  if (path.isAbsolute(filePath)) {
    return filePath
  }

  const base = workingDirectory || process.cwd()
  return path.resolve(base, filePath)
}
