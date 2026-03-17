import { createError } from 'h3'
import { requirePilotAuth } from '../../../../utils/auth'
import { resolvePilotChannelSelection } from '../../../../utils/pilot-channel'
import { requireSessionId } from '../../../../utils/pilot-http'
import { generateTitle } from '../../../../utils/pilot-title'
import { createPilotStoreAdapter } from '../../../../utils/pilot-store'

interface TitleBody {
  force?: boolean
}

export default defineEventHandler(async (event) => {
  const { userId } = requirePilotAuth(event)
  const sessionId = requireSessionId(event)
  const body = await readBody<TitleBody>(event)

  const store = createPilotStoreAdapter(event, userId)
  await store.runtime.ensureSchema()

  const session = await store.runtime.getSession(sessionId)
  if (!session) {
    throw createError({
      statusCode: 404,
      statusMessage: 'session not found',
    })
  }

  if (session.title && !body?.force) {
    return {
      title: session.title,
      source: 'stored',
      generated: false,
    }
  }

  const messages = await store.runtime.listMessages(sessionId)
  if (messages.length <= 0) {
    return {
      title: session.title || 'New chat',
      source: 'empty',
      generated: false,
    }
  }

  const selectedChannel = await resolvePilotChannelSelection(event)
  let result: Awaited<ReturnType<typeof generateTitle>>
  try {
    result = await generateTitle({
      baseUrl: selectedChannel.channel.baseUrl,
      apiKey: selectedChannel.channel.apiKey,
      model: selectedChannel.channel.model,
      messages: messages.map(item => ({
        role: item.role,
        content: item.content,
      })),
    })
  }
  catch {
    result = {
      title: session.title || 'New chat',
      source: 'fallback',
      generated: false,
    }
  }

  if (result.title) {
    await store.runtime.setSessionTitle(sessionId, result.title)
  }

  return {
    title: result.title,
    source: result.source,
    generated: result.generated,
  }
})
