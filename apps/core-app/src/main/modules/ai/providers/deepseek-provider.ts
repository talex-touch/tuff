import type {
  IntelligenceEmbeddingPayload,
  IntelligenceInvokeOptions,
  IntelligenceInvokeResult
} from '@talex-touch/utils'
import { IntelligenceProviderType } from '@talex-touch/utils'
import { OpenAiCompatibleLangChainProvider } from './langchain-openai-compatible-provider'

const DEFAULT_BASE_URL = 'https://api.deepseek.com/v1'

export class DeepSeekProvider extends OpenAiCompatibleLangChainProvider {
  readonly type = IntelligenceProviderType.DEEPSEEK

  protected readonly defaultBaseUrl = DEFAULT_BASE_URL
  protected readonly defaultChatModel = 'deepseek-chat'
  protected readonly embeddingSupported = false

  async embedding(
    _payload: IntelligenceEmbeddingPayload,
    _options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<number[]>> {
    throw new Error('[DeepSeekProvider] Embedding is not supported by DeepSeek')
  }
}
