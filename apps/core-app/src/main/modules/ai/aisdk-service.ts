import path from 'node:path'
import { readdirSync, existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'

import { ChannelType, DataCode } from '@talex-touch/utils/channel'
import { AiCapabilityType, AiProviderType } from '@talex-touch/utils'
import type {
  AiProviderConfig,
  AiVisionOcrPayload,
  AiVisionOcrResult
} from '@talex-touch/utils'
import { aiCapabilityRegistry } from './ai-capability-registry'
import { ai, setIntelligenceProviderManager } from './ai-sdk'
import { genTouchChannel } from '../../core/channel-core'
import { ensureAiConfigLoaded, getCapabilityOptions, getCapabilityPrompt } from './ai-config'
import { OpenAIProvider } from './providers/openai-provider'
import { DeepSeekProvider } from './providers/deepseek-provider'
import { SiliconflowProvider } from './providers/siliconflow-provider'
import { LocalProvider } from './providers/local-provider'
import { AnthropicProvider } from './providers/anthropic-provider'
import chalk from 'chalk'
import { IntelligenceProviderManager } from './runtime/provider-manager'

const LOG = chalk.hex('#b388ff').bold('[Intelligence]')
const logInfo = (...args: any[]) => console.log(LOG, ...args)
const logError = (...args: any[]) => console.error(LOG, ...args)

let initialized = false

export function initAiSdkService(): void {
  if (initialized) {
    return
  }
  const channel = genTouchChannel()
  if (!channel) {
    throw new Error('[AISDK] Touch channel not ready')
  }
  initialized = true

  const manager = new IntelligenceProviderManager()
  manager.registerFactory(AiProviderType.OPENAI, (config) => new OpenAIProvider(config))
  manager.registerFactory(AiProviderType.DEEPSEEK, (config) => new DeepSeekProvider(config))
  manager.registerFactory(AiProviderType.SILICONFLOW, (config) => new SiliconflowProvider(config))
  manager.registerFactory(AiProviderType.LOCAL, (config) => new LocalProvider(config))
  manager.registerFactory(AiProviderType.ANTHROPIC, (config) => new AnthropicProvider(config))
  setIntelligenceProviderManager(manager)
  logInfo('Provider factories registered')

  channel.regChannel(ChannelType.MAIN, 'aisdk:invoke', async ({ data, reply }) => {
  try {
    if (!data || typeof data !== 'object' || typeof (data as any).capabilityId !== 'string') {
      throw new Error('Invalid invoke payload')
    }

    const { capabilityId, payload, options } = data as {
      capabilityId: string
      payload: unknown
      options?: any
    }

    ensureAiConfigLoaded()
    logInfo(`Invoking capability ${capabilityId}`)
    const result = await ai.invoke(capabilityId, payload, options)
    logInfo(`Capability ${capabilityId} completed via provider ${result.provider} (${result.model})`)
    reply(DataCode.SUCCESS, { ok: true, result })
  } catch (error) {
    logError('Invoke failed:', error)
    reply(DataCode.ERROR, {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    })
  }
  })

  channel.regChannel(ChannelType.MAIN, 'aisdk:test-provider', async ({ data, reply }) => {
  try {
    if (!data || typeof data !== 'object' || !(data as any).provider) {
      throw new Error('Missing provider payload')
    }

    const { provider } = data as { provider: AiProviderConfig }
    ensureAiConfigLoaded()
    logInfo(`Testing provider ${provider.id}`)
    const result = await ai.testProvider(provider)
    logInfo(`Provider ${provider.id} test success`)

    reply(DataCode.SUCCESS, {
      ok: true,
      result
    })
  } catch (error) {
    logError('Provider test failed:', error)
    reply(DataCode.ERROR, {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    })
  }
  })

  channel.regChannel(ChannelType.MAIN, 'aisdk:test-capability', async ({ data, reply }) => {
  try {
    if (!data || typeof data !== 'object' || typeof data.capabilityId !== 'string') {
      throw new Error('Invalid capability test payload')
    }

    const { capabilityId, providerId, source } = data as {
      capabilityId: string
      providerId?: string
      source?: AiVisionOcrPayload['source']
    }

    const capability = aiCapabilityRegistry.get(capabilityId)
    if (!capability) {
      throw new Error(`Capability ${capabilityId} not registered`)
    }

    ensureAiConfigLoaded()
    const options = getCapabilityOptions(capabilityId)
    const allowedProviderIds = providerId ? [providerId] : options.allowedProviderIds

    logInfo(`Testing capability ${capabilityId}`)
    switch (capability.type) {
      case AiCapabilityType.VISION: {
        if (capabilityId !== 'vision.ocr') {
          throw new Error(`Vision capability ${capabilityId} is not testable yet`)
        }

        const payload: AiVisionOcrPayload = {
          source: source ?? (await loadSampleImageSource('ocr')),
          prompt: getCapabilityPrompt(capabilityId),
          includeKeywords: true,
          includeLayout: true
        }

        const result = await ai.invoke<AiVisionOcrResult>('vision.ocr', payload, {
          modelPreference: options.modelPreference,
          allowedProviderIds
        })

        logInfo(`Capability ${capabilityId} test success via provider ${result.provider}`)
        reply(DataCode.SUCCESS, {
          ok: true,
          result
        })
        break
      }
      default:
        throw new Error(`Capability type ${capability.type} not supported for testing`)
    }
  } catch (error) {
    logError('Capability test failed:', error)
    reply(DataCode.ERROR, {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    })
  }
  })
}

async function loadSampleImageSource(folder: string): Promise<AiVisionOcrPayload['source']> {
  const dir = resolveSampleDirectory(folder)
  if (!dir) {
    throw new Error('Sample image directory not found')
  }

  const files = readdirSync(dir).filter((file) =>
    /\.(png|jpe?g|webp|gif|bmp)$/i.test(file)
  )

  if (files.length === 0) {
    throw new Error('Sample image folder is empty')
  }

  const fileName = files[Math.floor(Math.random() * files.length)]
  const filePath = path.join(dir, fileName)
  const buffer = await readFile(filePath)
  const mime = detectMime(fileName)

  return {
    type: 'data-url',
    dataUrl: `data:${mime};base64,${buffer.toString('base64')}`
  }
}

function resolveSampleDirectory(folder: string): string | null {
  const guesses = [
    path.resolve(process.cwd(), 'apps/core-app/resources/intelligence/test-capability', folder),
    path.resolve(process.cwd(), 'resources/intelligence/test-capability', folder),
    path.resolve(process.resourcesPath, 'intelligence/test-capability', folder)
  ]

  for (const guess of guesses) {
    if (existsSync(guess)) {
      return guess
    }
  }

  console.warn('[AISDK] Sample folder not found in guesses:', guesses)
  return null
}

function detectMime(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase()
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.webp':
      return 'image/webp'
    case '.gif':
      return 'image/gif'
    case '.bmp':
      return 'image/bmp'
    default:
      return 'image/png'
  }
}
