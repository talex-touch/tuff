import { createError, defineEventHandler, readBody } from 'h3'
import { requirePilotAuth } from '../../../utils/auth'
import { executePilotMediaWithFallback } from '../../../utils/pilot-media-fallback'
import { resolvePilotRoutingSelection } from '../../../utils/pilot-routing-resolver'
import {
  createPilotVideoGenerateNotImplementedError,
  executePilotAudioSttTool,
  executePilotAudioTranscribeTool,
  executePilotAudioTtsTool,
  executePilotImageEditTool,
  executePilotImageGenerateTool,
  PILOT_MEDIA_VIDEO_NOT_IMPLEMENTED_CODE,
} from '../../../utils/pilot-tool-gateway'
import { quotaOk } from '../../../utils/quota-api'

type CapabilityId =
  | 'image.generate'
  | 'image.edit'
  | 'audio.tts'
  | 'audio.stt'
  | 'audio.transcribe'
  | 'video.generate'

interface CapabilityTestBody {
  capability?: CapabilityId
  prompt?: string
  text?: string
  image?: {
    base64?: string
    mimeType?: string
    filename?: string
  }
  mask?: {
    base64?: string
    mimeType?: string
    filename?: string
  }
  audio?: {
    base64?: string
    mimeType?: string
    filename?: string
  }
  size?: string
  count?: number
  voice?: string
  format?: 'mp3' | 'wav' | 'opus' | 'flac' | 'aac' | 'pcm'
  language?: string
  includeBase64?: boolean
  channelId?: string
  modelId?: string
  routeComboId?: string
}

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

function normalizeCapability(value: unknown): CapabilityId {
  const text = normalizeText(value).toLowerCase()
  if (
    text === 'image.generate'
    || text === 'image.edit'
    || text === 'audio.tts'
    || text === 'audio.stt'
    || text === 'audio.transcribe'
    || text === 'video.generate'
  ) {
    return text as CapabilityId
  }
  return 'image.generate'
}

function randomRequestId(sessionId: string, capability: CapabilityId): string {
  return `runtime_${capability.replace(/\./g, '_')}_${sessionId}_${Date.now().toString(36)}`
}

function toBadRequest(message: string): never {
  throw createError({
    statusCode: 400,
    statusMessage: 'Bad Request',
    message,
  })
}

export default defineEventHandler(async (event) => {
  const auth = requirePilotAuth(event)
  const body = await readBody<CapabilityTestBody>(event)
  const capability = normalizeCapability(body?.capability)
  const includeBase64 = body?.includeBase64 === true
  const requestId = randomRequestId(auth.userId, capability)
  const sessionId = `runtime_capability_${auth.userId}`

  if (capability === 'video.generate') {
    const notImplemented = createPilotVideoGenerateNotImplementedError()
    throw createError({
      statusCode: 501,
      statusMessage: 'Not Implemented',
      message: notImplemented.message,
      data: {
        code: PILOT_MEDIA_VIDEO_NOT_IMPLEMENTED_CODE,
      },
    })
  }

  if (capability === 'image.generate' || capability === 'image.edit') {
    const prompt = normalizeText(body?.prompt)
    if (!prompt) {
      toBadRequest('prompt 不能为空')
    }
  }

  if (capability === 'audio.tts') {
    const text = normalizeText(body?.text || body?.prompt)
    if (!text) {
      toBadRequest('text 不能为空')
    }
  }

  if ((capability === 'audio.stt' || capability === 'audio.transcribe') && !normalizeText(body?.audio?.base64)) {
    toBadRequest('audio.base64 不能为空')
  }

  if (capability === 'image.edit' && !normalizeText(body?.image?.base64)) {
    toBadRequest('image.base64 不能为空')
  }

  const initialSelection = await resolvePilotRoutingSelection(event, {
    requestChannelId: normalizeText(body?.channelId) || undefined,
    requestedModelId: normalizeText(body?.modelId) || undefined,
    routeComboId: normalizeText(body?.routeComboId) || undefined,
    internet: false,
    thinking: false,
    intentType: capability.startsWith('image.') ? 'image_generate' : 'chat',
    requiredCapability: capability,
  })

  try {
    const execution = await executePilotMediaWithFallback({
      event,
      capability,
      initialSelection,
      context: {
        requestChannelId: normalizeText(body?.channelId) || undefined,
        requestedModelId: normalizeText(body?.modelId) || undefined,
        routeComboId: normalizeText(body?.routeComboId) || undefined,
        internet: false,
        thinking: false,
        intentType: capability.startsWith('image.') ? 'image_generate' : 'chat',
      },
      execute: async (routeSelection) => {
        if (capability === 'image.generate') {
          return await executePilotImageGenerateTool({
            event,
            userId: auth.userId,
            sessionId,
            requestId,
            prompt: normalizeText(body?.prompt),
            size: body?.size,
            count: body?.count,
            output: {
              includeBase64,
            },
            channel: {
              baseUrl: routeSelection.channel.baseUrl,
              apiKey: routeSelection.channel.apiKey,
              model: routeSelection.providerModel || routeSelection.channel.model,
              adapter: routeSelection.adapter,
              transport: routeSelection.transport,
              timeoutMs: routeSelection.channel.timeoutMs,
            },
          })
        }

        if (capability === 'image.edit') {
          return await executePilotImageEditTool({
            event,
            userId: auth.userId,
            sessionId,
            requestId,
            prompt: normalizeText(body?.prompt),
            image: {
              base64: normalizeText(body?.image?.base64),
              mimeType: normalizeText(body?.image?.mimeType) || 'image/png',
              filename: normalizeText(body?.image?.filename) || 'image.png',
            },
            mask: normalizeText(body?.mask?.base64)
              ? {
                  base64: normalizeText(body?.mask?.base64),
                  mimeType: normalizeText(body?.mask?.mimeType) || 'image/png',
                  filename: normalizeText(body?.mask?.filename) || 'mask.png',
                }
              : undefined,
            size: body?.size,
            count: body?.count,
            output: {
              includeBase64,
            },
            channel: {
              baseUrl: routeSelection.channel.baseUrl,
              apiKey: routeSelection.channel.apiKey,
              model: routeSelection.providerModel || routeSelection.channel.model,
              adapter: routeSelection.adapter,
              transport: routeSelection.transport,
              timeoutMs: routeSelection.channel.timeoutMs,
            },
          })
        }

        if (capability === 'audio.tts') {
          return await executePilotAudioTtsTool({
            event,
            userId: auth.userId,
            sessionId,
            requestId,
            text: normalizeText(body?.text || body?.prompt),
            voice: normalizeText(body?.voice) || undefined,
            format: body?.format,
            output: {
              includeBase64,
            },
            channel: {
              baseUrl: routeSelection.channel.baseUrl,
              apiKey: routeSelection.channel.apiKey,
              model: routeSelection.providerModel || routeSelection.channel.model,
              adapter: routeSelection.adapter,
              transport: routeSelection.transport,
              timeoutMs: routeSelection.channel.timeoutMs,
            },
          })
        }

        if (capability === 'audio.stt') {
          return await executePilotAudioSttTool({
            event,
            userId: auth.userId,
            sessionId,
            requestId,
            audio: {
              base64: normalizeText(body?.audio?.base64),
              mimeType: normalizeText(body?.audio?.mimeType) || 'audio/wav',
              filename: normalizeText(body?.audio?.filename) || 'audio.wav',
            },
            language: normalizeText(body?.language) || undefined,
            prompt: normalizeText(body?.prompt) || undefined,
            channel: {
              baseUrl: routeSelection.channel.baseUrl,
              apiKey: routeSelection.channel.apiKey,
              model: routeSelection.providerModel || routeSelection.channel.model,
              adapter: routeSelection.adapter,
              transport: routeSelection.transport,
              timeoutMs: routeSelection.channel.timeoutMs,
            },
          })
        }

        return await executePilotAudioTranscribeTool({
          event,
          userId: auth.userId,
          sessionId,
          requestId,
          audio: {
            base64: normalizeText(body?.audio?.base64),
            mimeType: normalizeText(body?.audio?.mimeType) || 'audio/wav',
            filename: normalizeText(body?.audio?.filename) || 'audio.wav',
          },
          language: normalizeText(body?.language) || undefined,
          prompt: normalizeText(body?.prompt) || undefined,
          channel: {
            baseUrl: routeSelection.channel.baseUrl,
            apiKey: routeSelection.channel.apiKey,
            model: routeSelection.providerModel || routeSelection.channel.model,
            adapter: routeSelection.adapter,
            transport: routeSelection.transport,
            timeoutMs: routeSelection.channel.timeoutMs,
          },
        })
      },
    })

    return quotaOk({
      capability,
      result: execution.result,
      selectedRoute: {
        channelId: execution.selected.channelId,
        modelId: execution.selected.modelId,
        providerModel: execution.selected.providerModel,
        routeComboId: execution.selected.routeComboId,
        selectionSource: execution.selected.selectionSource,
        selectionReason: execution.selected.selectionReason,
      },
      attempts: execution.attempts,
    })
  }
  catch (error) {
    throw createError({
      statusCode: 502,
      statusMessage: 'Bad Gateway',
      message: error instanceof Error ? error.message : '能力测试调用失败',
      data: {
        code: normalizeText((error as Record<string, unknown>)?.code) || 'PILOT_CAPABILITY_TEST_FAILED',
      },
    })
  }
})
