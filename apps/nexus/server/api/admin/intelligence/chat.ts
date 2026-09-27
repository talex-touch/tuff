import { createError } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { getRuntimeSession, upsertRuntimeSession } from '../../../utils/tuffIntelligenceRuntimeStore'
import { streamIntelligenceCapability } from '../../../utils/tuffIntelligenceLabService'

interface ChatHistoryItem {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

const SESSION_PREFIX = 'tuff-intelligence-chat'
const MAX_HISTORY = 48
const SYSTEM_PROMPT = 'You are TuffIntelligence assistant. Respond clearly and concisely.'

function ensureHistory(value: unknown): ChatHistoryItem[] {
  if (!Array.isArray(value))
    return []
  return value
    .map((item) => {
      if (!item || typeof item !== 'object')
        return null
      const row = item as Record<string, unknown>
      const role = String(row.role || '').trim() as ChatHistoryItem['role']
      const content = String(row.content || '').trim()
      if (!role || !content)
        return null
      return {
        role: role === 'assistant' || role === 'system' ? role : 'user',
        content,
        timestamp: typeof row.timestamp === 'number' ? row.timestamp : Date.now(),
      }
    })
    .filter((item): item is ChatHistoryItem => Boolean(item))
    .slice(-MAX_HISTORY)
}

function toCapabilityMessages(history: ChatHistoryItem[]) {
  return [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    ...history.map(item => ({ role: item.role, content: item.content })),
  ]
}

export default defineEventHandler(async (event) => {
  const { userId } = await requireAdmin(event)
  const method = event.method || 'GET'
  const sessionId = `${SESSION_PREFIX}-${userId}`

  if (method === 'GET') {
    const session = await getRuntimeSession(event, userId, sessionId)
    return ensureHistory(session?.history ?? [])
  }

  if (method !== 'POST') {
    throw createError({ statusCode: 405, statusMessage: 'Method not allowed' })
  }

  const body = await readBody<{ message?: string }>(event)
  const message = String(body?.message || '').trim()
  if (!message)
    throw createError({ statusCode: 400, statusMessage: 'message is required' })

  const session = await getRuntimeSession(event, userId, sessionId)
  const nextHistory = ensureHistory(session?.history ?? [])
  nextHistory.push({ role: 'user', content: message, timestamp: Date.now() })
  if (nextHistory.length > MAX_HISTORY)
    nextHistory.splice(0, nextHistory.length - MAX_HISTORY)

  await upsertRuntimeSession(event, {
    sessionId,
    userId,
    status: 'executing',
    phase: 'chat',
    objective: message,
    history: nextHistory,
  })

  const encoder = new TextEncoder()
  const abortController = new AbortController()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (payload: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
      }

      const run = async () => {
        let assistantContent = ''
        let hasError = false
        try {
          await streamIntelligenceCapability(event, userId, {
            capabilityId: 'text.chat',
            payload: { messages: toCapabilityMessages(nextHistory) },
            options: {
              sessionId,
              metadata: {
                source: 'admin-intelligence-chat',
                caller: 'nexus-admin',
              },
            },
          }, {
            signal: abortController.signal,
            onDelta: async (delta) => {
              assistantContent += delta
              send({ type: 'assistant.delta', delta })
            },
          })
        }
        catch {
          hasError = true
          send({ type: 'error', message: 'TuffIntelligence stream failed.' })
        }
        finally {
          if (assistantContent.trim()) {
            nextHistory.push({
              role: 'assistant',
              content: assistantContent.trim(),
              timestamp: Date.now(),
            })
          }
          await upsertRuntimeSession(event, {
            sessionId,
            userId,
            status: hasError ? 'failed' : 'completed',
            phase: 'chat',
            history: nextHistory.slice(-MAX_HISTORY),
          })
          send({ type: 'done' })
          controller.close()
        }
      }

      void run()
    },
    cancel() {
      abortController.abort(new Error('Admin chat stream cancelled.'))
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
})
