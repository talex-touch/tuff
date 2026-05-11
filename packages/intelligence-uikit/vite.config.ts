import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

interface LiveHistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

interface DeepAgentInvokeRequest {
  message?: string
  sessionId?: string
  seq?: number
  history?: LiveHistoryMessage[]
  config?: {
    baseUrl?: string
    apiKey?: string
    model?: string
    transport?: 'auto' | 'responses' | 'chat.completions'
    systemPrompt?: string
  }
  metadata?: Record<string, unknown>
}

type InvokeDeepAgentResponses = typeof import('@talex-touch/tuff-intelligence/src/adapters/deepagent-engine')['invokeDeepAgentResponses']

const DEEPAGENT_ENGINE_MODULE = `/@fs/${fileURLToPath(new URL('../tuff-intelligence/src/adapters/deepagent-engine.ts', import.meta.url))}`

function readJsonBody(req: import('node:http').IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.setEncoding('utf8')
    req.on('data', (chunk) => {
      body += chunk
      if (body.length > 1024 * 1024) {
        reject(new Error('Request body too large'))
        req.destroy()
      }
    })
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      }
      catch {
        reject(new Error('Invalid JSON body'))
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res: import('node:http').ServerResponse, status: number, payload: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

function normalizeHistory(value: unknown): LiveHistoryMessage[] {
  if (!Array.isArray(value))
    return []

  const history: LiveHistoryMessage[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object')
      continue

    const row = item as Record<string, unknown>
    const role = row.role === 'user' ? 'user' : row.role === 'assistant' ? 'assistant' : ''
    const content = typeof row.content === 'string' ? row.content.trim() : ''
    if (!role || !content)
      continue

    history.push({ role, content })
  }
  return history.slice(-12)
}

export default defineConfig({
  plugins: [
    vue(),
    {
      name: 'intelligence-uikit-deepagent-dev-server',
      configureServer(server) {
        server.middlewares.use('/__intelligence-uikit/deepagent/invoke', async (req, res) => {
          if (req.method !== 'POST') {
            sendJson(res, 405, { error: 'Method not allowed' })
            return
          }

          try {
            const body = await readJsonBody(req) as DeepAgentInvokeRequest
            const config = body.config ?? {}
            const message = String(body.message || '').trim()
            const baseUrl = String(config.baseUrl || '').trim()
            const apiKey = String(config.apiKey || '').trim()
            const model = String(config.model || '').trim()
            const systemPrompt = String(config.systemPrompt || '').trim()

            if (!message || !baseUrl || !apiKey || !model) {
              sendJson(res, 400, { error: 'Missing message, baseUrl, apiKey, or model' })
              return
            }

            const audit: Array<{ type: string, payload: Record<string, unknown> }> = []
            const module = await server.ssrLoadModule(DEEPAGENT_ENGINE_MODULE) as {
              invokeDeepAgentResponses: InvokeDeepAgentResponses
            }
            const { invokeDeepAgentResponses } = module
            const response = await invokeDeepAgentResponses({
              sessionId: String(body.sessionId || 'intelligence-uikit-playground'),
              turnId: `turn_${Date.now()}`,
              done: false,
              seq: Number.isFinite(body.seq) ? Number(body.seq) : 0,
              messages: [...normalizeHistory(body.history), { role: 'user', content: message }],
              events: [],
              metadata: {
                playground: 'intelligence-uikit',
                ...(body.metadata && typeof body.metadata === 'object' ? body.metadata : {}),
              },
            }, {
              baseUrl,
              apiKey,
              model,
              transport: config.transport ?? 'auto',
              systemPrompt: systemPrompt || undefined,
              instructions: systemPrompt || undefined,
              metadata: {
                playground: 'intelligence-uikit',
                ...(body.metadata && typeof body.metadata === 'object' ? body.metadata : {}),
              },
              onAudit(record) {
                audit.push({ type: record.type, payload: record.payload })
              },
            })

            sendJson(res, 200, { ...response, audit })
          }
          catch (error) {
            const message = error instanceof Error ? error.message : String(error || 'DeepAgent request failed')
            sendJson(res, 500, { error: message })
          }
        })
      },
    },
  ],
  server: {
    host: '127.0.0.1',
    port: 3405,
  },
})
