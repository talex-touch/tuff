import type {
  IntelligenceChatPayload,
  IntelligenceInvokeOptions,
  IntelligenceInvokeResult,
  IntelligenceMessage,
} from '@talex-touch/utils/types/intelligence'
import { PromptTemplate } from '@langchain/core/prompts'
import type { TuffIntelligenceConfig } from './types'

export interface IntelligenceInvoker {
  (capabilityId: string, payload: any, options?: IntelligenceInvokeOptions): Promise<IntelligenceInvokeResult<any>>
}

export interface LangChainChatInput {
  messages: IntelligenceMessage[]
  metadata?: Record<string, any>
}

export interface LangChainChatOptions {
  capabilityId?: string
  providerId?: string
  model?: string
  promptTemplate?: string
  promptVariables?: Record<string, any>
  stream?: boolean
  metadata?: Record<string, any>
}

function extractMustacheVariables(template: string): string[] {
  const vars = new Set<string>()
  const regex = /{{\s*([a-zA-Z0-9_\.]+)\s*}}/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(template))) {
    if (match[1])
      vars.add(match[1])
  }
  return Array.from(vars)
}

async function renderPromptTemplate(template: string, variables?: Record<string, any>): Promise<string> {
  const inputVariables = extractMustacheVariables(template)
  if (inputVariables.length === 0)
    return template

  const prompt = new PromptTemplate({
    template,
    inputVariables,
    templateFormat: 'mustache' as any,
  })

  return await prompt.format(variables ?? {})
}

async function applyPromptTemplate(
  messages: IntelligenceMessage[],
  template?: string,
  vars?: Record<string, any>,
): Promise<IntelligenceMessage[]> {
  if (!template)
    return messages

  const rendered = await renderPromptTemplate(template, vars)

  return [{ role: 'system', content: rendered }, ...messages]
}

/**
 * Build a LangChain-compatible chat runner that delegates to the intelligence invoke flow.
 */
export function buildLangChainChatRunnable(
  invoke: IntelligenceInvoker,
  config?: Partial<TuffIntelligenceConfig>,
) {
  const capabilityId = config?.capabilities?.find(c => c.id === 'text.chat')?.id ?? 'text.chat'

  return {
    /**
     * Invoke chat using intelligence providers, compatible with LangChain Runnable signature.
     */
    async invoke(input: LangChainChatInput, options?: LangChainChatOptions): Promise<{ content: string, traceId: string }> {
      const messages = await applyPromptTemplate(input.messages, options?.promptTemplate, options?.promptVariables)

      const payload: IntelligenceChatPayload = {
        messages,
        context: {
          source: options?.metadata?.source,
          locale: options?.metadata?.locale,
          userId: options?.metadata?.userId,
          sessionId: options?.metadata?.sessionId,
        },
      }

      const invokeOptions: IntelligenceInvokeOptions = {
        preferredProviderId: options?.providerId,
        modelPreference: options?.model ? [options.model] : undefined,
        stream: options?.stream,
        metadata: options?.metadata,
      }

      const result = await invoke(options?.capabilityId || capabilityId, payload, invokeOptions)

      return {
        content: result.result as string,
        traceId: result.traceId,
      }
    },
  }
}
