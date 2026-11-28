import type { ToolExecutionContext } from '../tool-registry'
import { spawn } from 'node:child_process'
import process from 'node:process'
import type { AgentPermission } from '@talex-touch/utils'
import type { ClipboardWriteRequest } from '@talex-touch/utils/transport/events/types'
import { network } from '@talex-touch/utils/network'
import { openValidatedExternalUrl } from '../../../../utils/external-url-policy'
import { activeAppService } from '../../../system/active-app'
import { clipboardModule } from '../../../clipboard'
import { intelligenceDesktopContextService } from '../../intelligence-desktop-context'
import { toolRegistry } from '../tool-registry'
import { describeToolFailure } from '../../tool-error-projection'
import { createLogger } from '../../../../utils/logger'
import { fetchSafeWebPageText } from './ssrf-safe-fetch'

const workflowToolsLog = createLogger('Intelligence').child('WorkflowTools')

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export interface WorkflowClipboardCapability {
  write(request: ClipboardWriteRequest): Promise<void>
}

export interface WorkflowSystemShellCapability {
  openExternal: (url: string) => Promise<void>
}

export interface WorkflowToolCapabilities {
  clipboard: WorkflowClipboardCapability
  systemShell: WorkflowSystemShellCapability
}

export function registerWorkflowTools(capabilities: WorkflowToolCapabilities): void {
  toolRegistry.registerTool(
    {
      id: 'clipboard.readRecent',
      name: 'Read Recent Clipboard',
      description: 'Read recent clipboard history items for summarization and workflow context.',
      category: 'clipboard',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Maximum number of recent clipboard items' }
        }
      },
      permissions: ['clipboard:read' as AgentPermission]
    },
    async (input: unknown) => {
      const limit = Math.min(Math.max(Number((input as { limit?: number })?.limit ?? 8), 1), 20)
      const items = await clipboardModule.queryHistoryByMeta({ limit })
      return items.slice(0, limit).map((item) => ({
        id: item.id,
        type: item.type,
        content: item.content,
        sourceApp: item.sourceApp,
        timestamp: item.timestamp ? new Date(item.timestamp).getTime() : undefined,
        metadata: item.meta ?? undefined
      }))
    }
  )

  toolRegistry.registerTool(
    {
      id: 'clipboard.copyResult',
      name: 'Copy Result To Clipboard',
      description: 'Write the provided text or HTML result to the system clipboard.',
      category: 'clipboard',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to write to clipboard' },
          html: { type: 'string', description: 'Optional HTML content to write to clipboard' }
        },
        required: ['text']
      },
      permissions: ['clipboard:write' as AgentPermission]
    },
    async (input: unknown) => {
      const payload = input as { text: string; html?: string }
      await capabilities.clipboard.write({
        text: payload.text ?? '',
        html: payload.html
      })
      return {
        success: true,
        copiedChars: payload.text?.length ?? 0
      }
    }
  )

  toolRegistry.registerTool(
    {
      id: 'desktop.context.activeApp',
      name: 'Get Active App',
      description: 'Read the currently active application and focused window summary.',
      category: 'desktop',
      inputSchema: {
        type: 'object',
        properties: {}
      },
      permissions: ['clipboard:read' as AgentPermission]
    },
    async () => {
      return await activeAppService.getActiveApp({ includeIcon: false })
    }
  )

  toolRegistry.registerTool(
    {
      id: 'desktop.context.snapshot',
      name: 'Capture Desktop Context Snapshot',
      description:
        'Capture a lightweight desktop context snapshot from configured context sources.',
      category: 'desktop',
      inputSchema: {
        type: 'object',
        properties: {
          contextSources: {
            type: 'array',
            description: 'Workflow context sources to capture'
          },
          sessionId: { type: 'string', description: 'Optional intelligence session id' }
        }
      },
      permissions: ['clipboard:read' as AgentPermission]
    },
    async (input: unknown) => {
      const payload = input as {
        contextSources?: Parameters<
          typeof intelligenceDesktopContextService.capture
        >[0]['contextSources']
        sessionId?: string
      }
      return await intelligenceDesktopContextService.capture({
        contextSources: payload.contextSources ?? [],
        sessionId: payload.sessionId
      })
    }
  )

  toolRegistry.registerTool(
    {
      id: 'browser.open',
      name: 'Open Browser URL',
      description: 'Open a URL in the user default browser.',
      category: 'browser',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to open' }
        },
        required: ['url']
      },
      permissions: ['network:access' as AgentPermission]
    },
    async (input: unknown) => {
      const { url } = input as { url: string }
      const decision = await openValidatedExternalUrl(url, {
        opener: capabilities.systemShell.openExternal
      })
      return decision.allowed
        ? { success: true, url: decision.url }
        : { success: false, url, error: decision.reason, protocol: decision.protocol }
    }
  )

  toolRegistry.registerTool(
    {
      id: 'browser.search',
      name: 'Search The Web',
      description:
        'Search the web for real-time information, news, documentation, or websites. Returns relevant search results with titles, URLs, and snippets.',
      category: 'browser',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query keyword or question' },
          provider: {
            type: 'string',
            description: 'Search provider (google or bing), defaults to google'
          },
          open: {
            type: 'boolean',
            description: 'Whether to open the search URL in user browser immediately'
          }
        },
        required: ['query']
      },
      permissions: ['network:access' as AgentPermission]
    },
    async (input: unknown) => {
      const {
        query,
        provider = 'google',
        open = false
      } = input as {
        query: string
        provider?: string
        open?: boolean
      }
      const url =
        provider === 'bing'
          ? `https://www.bing.com/search?q=${encodeURIComponent(query)}`
          : `https://www.google.com/search?q=${encodeURIComponent(query)}`
      let opened = false
      if (open) {
        const decision = await openValidatedExternalUrl(url, {
          opener: capabilities.systemShell.openExternal
        })
        opened = decision.allowed
      }
      let results: Array<{ title: string; url: string; snippet: string }> = []
      try {
        const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
        const html = await network.readText(ddgUrl)
        const blocks =
          html.match(/<div[^>]+class="[^"]*result__body[^"]*"[\s\S]*?<\/div>\s*<\/div>/gi) ?? []
        for (const block of blocks.slice(0, 6)) {
          const titleMatch =
            block.match(
              /<h2[^>]*>[\s\S]*?<a[^>]*class="[^"]*result__url[^"]*"[^>]*>([\s\S]*?)<\/a>/i
            ) ??
            block.match(/<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i) ??
            block.match(/<h2[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i)
          const snippetMatch = block.match(
            /<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i
          )
          const rawHref = block.match(/href="([^"]+)"/i)?.[1]
          let resultUrl = rawHref ?? ''
          if (resultUrl.includes('uddg=')) {
            const match = resultUrl.match(/[?&]uddg=([^&]+)/)
            if (match?.[1]) resultUrl = decodeURIComponent(match[1])
          }
          const title = stripHtml(titleMatch?.[1] ?? '').trim()
          const snippet = stripHtml(snippetMatch?.[1] ?? '').trim()
          if (title || snippet) {
            results.push({ title: title || query, url: resultUrl, snippet })
          }
        }
        if (results.length === 0) {
          workflowToolsLog.warn(
            `browser.search parsed no results from DuckDuckGo: html bytes=${html.length}`
          )
        }
      } catch (error) {
        workflowToolsLog.warn(
          `browser.search DuckDuckGo request failed, returning the search URL only | ${describeToolFailure(error)}`
        )
      }
      return { provider, query, url, opened, results }
    }
  )

  toolRegistry.registerTool(
    {
      id: 'browser.extract',
      name: 'Extract Web Page Text',
      description: 'Fetch a web page and return a lightweight title and text summary.',
      category: 'browser',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to fetch' }
        },
        required: ['url']
      },
      permissions: ['network:access' as AgentPermission]
    },
    async (input: unknown, ctx?: ToolExecutionContext) => {
      const { url } = input as { url: string }
      const fetched = await fetchSafeWebPageText(url, { signal: ctx?.signal })
      const html = fetched.body
      const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
      const text = stripHtml(html).slice(0, 4000)
      return {
        url: fetched.url,
        title: titleMatch?.[1]?.trim() ?? fetched.url,
        content: text
      }
    }
  )

  const MAX_EXEC_BUFFER_BYTES = 10 * 1024 * 1024

  const killProcessTree = (childPid: number | undefined, fallbackKill: () => void) => {
    if (childPid && childPid > 0) {
      if (process.platform !== 'win32') {
        try {
          process.kill(-childPid, 'SIGKILL')
          return
        } catch {
          // Fall back to direct child kill below.
        }
      } else {
        try {
          const killer = spawn('taskkill', ['/pid', String(childPid), '/T', '/F'], {
            stdio: 'ignore',
            windowsHide: true
          })
          killer.unref()
          return
        } catch {
          // Fall back to direct child kill below.
        }
      }
    }
    try {
      fallbackKill()
    } catch {
      // ignore
    }
  }

  const execHandler = async (input: unknown, ctx?: ToolExecutionContext) => {
    if (ctx?.signal?.aborted) {
      throw new Error('TOOL_EXECUTION_CANCELLED')
    }
    const record = input && typeof input === 'object' ? (input as Record<string, unknown>) : null
    const rawCommand = record && typeof record.command === 'string' ? record.command : ''
    const rawCwd = record && typeof record.cwd === 'string' ? record.cwd : undefined
    const rawTimeout =
      record && typeof record.timeoutMs === 'number' && Number.isFinite(record.timeoutMs)
        ? record.timeoutMs
        : 30000

    const cmd = rawCommand.trim()
    if (!cmd) throw new Error('Command is required')
    const effectiveCwd = rawCwd || ctx?.workingDirectory || process.env.HOME || process.cwd()
    const timeoutMs = Math.min(Math.max(1000, rawTimeout), 120000)

    return await new Promise<{
      command: string
      cwd: string
      stdout: string
      stderr: string
      exitCode: number
    }>((resolve, reject) => {
      if (ctx?.signal?.aborted) {
        reject(new Error('TOOL_EXECUTION_CANCELLED'))
        return
      }

      const isWin = process.platform === 'win32'
      const shellBin = isWin ? process.env.ComSpec || 'cmd.exe' : '/bin/sh'
      const shellArgs = isWin ? ['/d', '/s', '/c', cmd] : ['-c', cmd]
      const child = spawn(shellBin, shellArgs, {
        cwd: effectiveCwd,
        env: { ...process.env },
        detached: !isWin,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
      })

      const stdoutChunks: Buffer[] = []
      const stderrChunks: Buffer[] = []
      let stdoutBytes = 0
      let stderrBytes = 0
      let settled = false
      let timedOut = false
      let overflowed = false

      const killTree = () => killProcessTree(child.pid, () => child.kill('SIGKILL'))

      const onAbort = () => {
        killTree()
        finishReject(new Error('TOOL_EXECUTION_CANCELLED'))
      }

      const timer = setTimeout(() => {
        timedOut = true
        killTree()
      }, timeoutMs)

      const cleanup = () => {
        clearTimeout(timer)
        ctx?.signal?.removeEventListener('abort', onAbort)
      }

      const finishResolve = (exitCode: number) => {
        if (settled) return
        settled = true
        cleanup()
        resolve({
          command: cmd,
          cwd: effectiveCwd,
          stdout: Buffer.concat(stdoutChunks, stdoutBytes).toString('utf8'),
          stderr: Buffer.concat(stderrChunks, stderrBytes).toString('utf8'),
          exitCode
        })
      }

      const finishReject = (err: Error) => {
        if (settled) return
        settled = true
        cleanup()
        reject(err)
      }

      ctx?.signal?.addEventListener('abort', onAbort, { once: true })

      child.stdout?.on('data', (chunk: Buffer) => {
        if (stdoutBytes + chunk.byteLength > MAX_EXEC_BUFFER_BYTES) {
          overflowed = true
          killTree()
          return
        }
        stdoutBytes += chunk.byteLength
        stdoutChunks.push(chunk)
      })

      child.stderr?.on('data', (chunk: Buffer) => {
        if (stderrBytes + chunk.byteLength > MAX_EXEC_BUFFER_BYTES) {
          overflowed = true
          killTree()
          return
        }
        stderrBytes += chunk.byteLength
        stderrChunks.push(chunk)
      })

      child.on('error', () => {
        finishResolve(1)
      })

      child.on('close', (code) => {
        if (ctx?.signal?.aborted) {
          finishReject(new Error('TOOL_EXECUTION_CANCELLED'))
          return
        }
        const exitCode = timedOut || overflowed ? 1 : typeof code === 'number' ? code : 1
        finishResolve(exitCode)
      })
    })
  }

  toolRegistry.registerTool(
    {
      id: 'system.exec',
      name: 'Execute Shell Command',
      description:
        'Execute a local shell / terminal command (e.g. pwd, ls, git, cat, npm) in the workspace directory. Returns stdout, stderr, and exit code.',
      category: 'system',
      inputSchema: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The shell command to execute' },
          cwd: {
            type: 'string',
            description: 'Optional working directory. Defaults to current workspace directory'
          },
          timeoutMs: { type: 'number', description: 'Timeout in milliseconds (defaults to 30000)' }
        },
        required: ['command']
      },
      permissions: ['system:exec' as AgentPermission]
    },
    execHandler
  )

  toolRegistry.registerTool(
    {
      id: 'bash',
      name: 'Bash Command',
      description: 'Execute a bash command in the terminal. Alias for system.exec.',
      category: 'system',
      inputSchema: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The bash command to execute' },
          cwd: { type: 'string', description: 'Optional working directory' }
        },
        required: ['command']
      },
      permissions: ['system:exec' as AgentPermission]
    },
    execHandler
  )
}
