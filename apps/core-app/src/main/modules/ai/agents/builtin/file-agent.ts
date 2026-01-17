/**
 * FileAgent - 文件管理智能体
 *
 * 能力:
 * - 文件搜索与筛选
 * - 批量重命名
 * - 文件整理与归档
 * - 重复文件检测
 */

import type { AgentDescriptor, AgentPlanStep } from '@talex-touch/utils'
import type { AgentExecutionContext, AgentImpl } from '../agent-registry'
import { agentRegistry } from '../agent-registry'
import { toolRegistry } from '../tool-registry'

const FILE_AGENT_ID = 'builtin.file-agent'

const descriptor: AgentDescriptor = {
  id: FILE_AGENT_ID,
  name: 'File Agent',
  description: '智能文件管理助手，支持文件搜索、批量重命名、自动整理和重复检测',
  version: '1.0.0',
  capabilities: [
    {
      id: 'file.search',
      name: '文件搜索',
      type: 'query',
      description: '根据条件搜索文件',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词' },
          path: { type: 'string', description: '搜索路径' },
          extensions: { type: 'array', items: { type: 'string' }, description: '文件扩展名过滤' },
          maxResults: { type: 'number', description: '最大结果数' }
        },
        required: ['query']
      },
      outputSchema: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            name: { type: 'string' },
            size: { type: 'number' },
            modifiedAt: { type: 'string' }
          }
        }
      }
    },
    {
      id: 'file.rename',
      name: '批量重命名',
      type: 'action',
      description: '批量重命名文件',
      inputSchema: {
        type: 'object',
        properties: {
          files: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                source: { type: 'string' },
                target: { type: 'string' }
              }
            }
          },
          pattern: { type: 'string', description: '重命名模式' }
        },
        required: ['files']
      },
      outputSchema: {
        type: 'object',
        properties: {
          success: { type: 'number' },
          failed: { type: 'number' },
          results: { type: 'array' }
        }
      }
    },
    {
      id: 'file.organize',
      name: '文件整理',
      type: 'action',
      description: '按规则自动整理文件',
      inputSchema: {
        type: 'object',
        properties: {
          sourcePath: { type: 'string', description: '源目录' },
          rules: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                match: { type: 'string', description: '匹配规则 (glob 或正则)' },
                targetFolder: { type: 'string', description: '目标文件夹' }
              }
            }
          },
          dryRun: { type: 'boolean', description: '仅预览不执行' }
        },
        required: ['sourcePath']
      },
      outputSchema: {
        type: 'object',
        properties: {
          moved: { type: 'number' },
          skipped: { type: 'number' },
          details: { type: 'array' }
        }
      }
    },
    {
      id: 'file.duplicates',
      name: '重复检测',
      type: 'query',
      description: '检测重复文件',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '扫描路径' },
          recursive: { type: 'boolean', description: '是否递归' },
          minSize: { type: 'number', description: '最小文件大小 (bytes)' }
        },
        required: ['path']
      },
      outputSchema: {
        type: 'object',
        properties: {
          groups: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                hash: { type: 'string' },
                size: { type: 'number' },
                files: { type: 'array', items: { type: 'string' } }
              }
            }
          },
          totalDuplicates: { type: 'number' },
          potentialSavings: { type: 'number' }
        }
      }
    }
  ],
  tools: [
    { toolId: 'file.read' },
    { toolId: 'file.write' },
    { toolId: 'file.list' },
    { toolId: 'file.move' },
    { toolId: 'file.copy' },
    { toolId: 'file.delete' },
    { toolId: 'file.info' },
    { toolId: 'file.exists' }
  ],
  enabled: true
}

const implementation: AgentImpl = {
  async execute(input: unknown, ctx: AgentExecutionContext): Promise<unknown> {
    const { capability, ...params } = input as { capability: string; [key: string]: unknown }

    switch (capability) {
      case 'file.search':
        return executeSearch(params, ctx)
      case 'file.rename':
        return executeRename(params, ctx)
      case 'file.organize':
        return executeOrganize(params, ctx)
      case 'file.duplicates':
        return executeDuplicates(params, ctx)
      default:
        throw new Error(`Unknown capability: ${capability}`)
    }
  },

  async plan(input: unknown, _ctx: AgentExecutionContext): Promise<AgentPlanStep[]> {
    const { goal } = input as { goal: string }

    // Simple plan generation based on goal keywords
    const steps: AgentPlanStep[] = []

    if (
      goal.includes('搜索') ||
      goal.includes('查找') ||
      goal.includes('search') ||
      goal.includes('find')
    ) {
      steps.push({
        id: 'search',
        toolId: 'file.search',
        input: { query: goal },
        description: '搜索符合条件的文件'
      })
    }

    if (goal.includes('重命名') || goal.includes('rename')) {
      steps.push({
        id: 'rename',
        toolId: 'file.rename',
        input: {},
        description: '批量重命名文件',
        dependsOn: steps.length > 0 ? [steps[steps.length - 1].id] : undefined
      })
    }

    if (goal.includes('整理') || goal.includes('organize') || goal.includes('分类')) {
      steps.push({
        id: 'organize',
        toolId: 'file.organize',
        input: {},
        description: '按规则整理文件'
      })
    }

    if (goal.includes('重复') || goal.includes('duplicate')) {
      steps.push({
        id: 'duplicates',
        toolId: 'file.duplicates',
        input: {},
        description: '检测重复文件'
      })
    }

    return steps
  }
}

// ============================================================================
// Capability Implementations
// ============================================================================

async function executeSearch(
  params: Record<string, unknown>,
  ctx: AgentExecutionContext
): Promise<unknown> {
  const {
    query,
    path = '.',
    extensions,
    maxResults = 100
  } = params as {
    query: string
    path?: string
    extensions?: string[]
    maxResults?: number
  }

  // Use file.list tool to get files
  const listResult = await toolRegistry.executeTool(
    'file.list',
    { path, recursive: true },
    {
      taskId: ctx.taskId,
      agentId: FILE_AGENT_ID,
      workingDirectory: ctx.workingDirectory
    }
  )

  if (!listResult.success) {
    throw new Error(listResult.error || 'Failed to list files')
  }

  const files = listResult.output as Array<{ name: string; path: string; type: string }>
  const queryLower = query.toLowerCase()

  // Filter files by query and extensions
  const results = files
    .filter((f) => {
      if (f.type !== 'file') return false
      if (!f.name.toLowerCase().includes(queryLower)) return false
      if (extensions?.length) {
        const ext = f.name.split('.').pop()?.toLowerCase()
        if (!ext || !extensions.includes(ext)) return false
      }
      return true
    })
    .slice(0, maxResults)

  return {
    query,
    total: results.length,
    files: results
  }
}

async function executeRename(
  params: Record<string, unknown>,
  ctx: AgentExecutionContext
): Promise<unknown> {
  const { files, pattern } = params as {
    files: Array<{ source: string; target: string }>
    pattern?: string
  }

  const results: Array<{ source: string; target: string; success: boolean; error?: string }> = []
  let success = 0
  let failed = 0

  for (const file of files) {
    let targetName = file.target

    // Apply pattern if provided
    if (pattern && !file.target) {
      // Simple pattern replacement: {name}, {ext}, {index}
      const parts = file.source.split('/')
      const filename = parts[parts.length - 1]
      const ext = filename.includes('.') ? filename.split('.').pop() : ''
      const name = filename.replace(`.${ext}`, '')

      targetName = pattern
        .replace('{name}', name)
        .replace('{ext}', ext || '')
        .replace('{index}', String(results.length + 1))
    }

    const moveResult = await toolRegistry.executeTool(
      'file.move',
      {
        source: file.source,
        destination: targetName
      },
      {
        taskId: ctx.taskId,
        agentId: FILE_AGENT_ID,
        workingDirectory: ctx.workingDirectory
      }
    )

    if (moveResult.success) {
      success++
      results.push({ source: file.source, target: targetName, success: true })
    } else {
      failed++
      results.push({
        source: file.source,
        target: targetName,
        success: false,
        error: moveResult.error
      })
    }
  }

  return { success, failed, results }
}

async function executeOrganize(
  params: Record<string, unknown>,
  ctx: AgentExecutionContext
): Promise<unknown> {
  const {
    sourcePath,
    rules,
    dryRun = false
  } = params as {
    sourcePath: string
    rules?: Array<{ match: string; targetFolder: string }>
    dryRun?: boolean
  }

  // Default rules if not provided
  const effectiveRules = rules || [
    { match: '*.{jpg,jpeg,png,gif,webp}', targetFolder: 'Images' },
    { match: '*.{mp4,avi,mkv,mov}', targetFolder: 'Videos' },
    { match: '*.{mp3,wav,flac,aac}', targetFolder: 'Audio' },
    { match: '*.{doc,docx,pdf,txt,md}', targetFolder: 'Documents' },
    { match: '*.{zip,rar,7z,tar,gz}', targetFolder: 'Archives' }
  ]

  // List files
  const listResult = await toolRegistry.executeTool(
    'file.list',
    { path: sourcePath },
    {
      taskId: ctx.taskId,
      agentId: FILE_AGENT_ID,
      workingDirectory: ctx.workingDirectory
    }
  )

  if (!listResult.success) {
    throw new Error(listResult.error || 'Failed to list files')
  }

  const files = listResult.output as Array<{ name: string; path: string; type: string }>
  const details: Array<{ file: string; action: string; target?: string }> = []
  let moved = 0
  let skipped = 0

  for (const file of files) {
    if (file.type !== 'file') continue

    // Find matching rule
    let matched = false
    for (const rule of effectiveRules) {
      if (matchGlob(file.name, rule.match)) {
        const targetPath = `${sourcePath}/${rule.targetFolder}/${file.name}`

        if (dryRun) {
          details.push({ file: file.path, action: 'would_move', target: targetPath })
        } else {
          const moveResult = await toolRegistry.executeTool(
            'file.move',
            {
              source: file.path,
              destination: targetPath
            },
            {
              taskId: ctx.taskId,
              agentId: FILE_AGENT_ID,
              workingDirectory: ctx.workingDirectory
            }
          )

          if (moveResult.success) {
            moved++
            details.push({ file: file.path, action: 'moved', target: targetPath })
          } else {
            details.push({ file: file.path, action: 'failed', target: targetPath })
          }
        }

        matched = true
        break
      }
    }

    if (!matched) {
      skipped++
      details.push({ file: file.path, action: 'skipped' })
    }
  }

  return { moved, skipped, details, dryRun }
}

async function executeDuplicates(
  params: Record<string, unknown>,
  ctx: AgentExecutionContext
): Promise<unknown> {
  const {
    path,
    recursive = true,
    minSize = 1024
  } = params as {
    path: string
    recursive?: boolean
    minSize?: number
  }

  // List files
  const listResult = await toolRegistry.executeTool(
    'file.list',
    { path, recursive },
    {
      taskId: ctx.taskId,
      agentId: FILE_AGENT_ID,
      workingDirectory: ctx.workingDirectory
    }
  )

  if (!listResult.success) {
    throw new Error(listResult.error || 'Failed to list files')
  }

  const files = listResult.output as Array<{ name: string; path: string; type: string }>

  // Group by size first (quick filter)
  const sizeGroups = new Map<number, string[]>()

  for (const file of files) {
    if (file.type !== 'file') continue

    const infoResult = await toolRegistry.executeTool(
      'file.info',
      { path: file.path },
      {
        taskId: ctx.taskId,
        agentId: FILE_AGENT_ID,
        workingDirectory: ctx.workingDirectory
      }
    )

    if (infoResult.success) {
      const info = infoResult.output as { size: number }
      if (info.size >= minSize) {
        const existing = sizeGroups.get(info.size) || []
        existing.push(file.path)
        sizeGroups.set(info.size, existing)
      }
    }
  }

  // Find groups with more than one file (potential duplicates)
  const groups: Array<{ size: number; files: string[] }> = []
  let totalDuplicates = 0
  let potentialSavings = 0

  for (const [size, paths] of sizeGroups) {
    if (paths.length > 1) {
      groups.push({ size, files: paths })
      totalDuplicates += paths.length - 1
      potentialSavings += size * (paths.length - 1)
    }
  }

  return {
    groups,
    totalDuplicates,
    potentialSavings,
    potentialSavingsFormatted: formatBytes(potentialSavings)
  }
}

// ============================================================================
// Helpers
// ============================================================================

function matchGlob(filename: string, pattern: string): boolean {
  // Simple glob matching: *.{ext1,ext2} or *.ext
  const regex = pattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '.*')
    .replace(/\{([^}]+)\}/g, (_m, p1) => `(${p1.split(',').join('|')})`)

  return new RegExp(`^${regex}$`, 'i').test(filename)
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`
}

// ============================================================================
// Registration
// ============================================================================

export function registerFileAgent(): void {
  agentRegistry.registerAgent(descriptor, implementation)
}

export { FILE_AGENT_ID, descriptor as fileAgentDescriptor }
