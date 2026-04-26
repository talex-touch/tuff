import type { AgentPermission } from '@talex-touch/utils'
import { network } from '@talex-touch/utils/network'
import { clipboard } from 'electron'
import { shell } from 'electron'
import { activeAppService } from '../../../system/active-app'
import { clipboardModule } from '../../../clipboard'
import { intelligenceDesktopContextService } from '../../intelligence-desktop-context'
import { toolRegistry } from '../tool-registry'

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function registerWorkflowTools(): void {
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
      clipboard.write({
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
      await shell.openExternal(url)
      return { success: true, url }
    }
  )

  toolRegistry.registerTool(
    {
      id: 'browser.search',
      name: 'Search The Web',
      description: 'Construct a search URL and optionally open it in the browser.',
      category: 'browser',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          provider: { type: 'string', description: 'Search provider, defaults to Google' },
          open: { type: 'boolean', description: 'Whether to open the search URL immediately' }
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
      if (open) {
        await shell.openExternal(url)
      }
      return { provider, query, url, opened: open }
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
    async (input: unknown) => {
      const { url } = input as { url: string }
      const html = await network.readText(url)
      const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
      const text = stripHtml(html).slice(0, 4000)
      return {
        url,
        title: titleMatch?.[1]?.trim() ?? url,
        content: text
      }
    }
  )
}
