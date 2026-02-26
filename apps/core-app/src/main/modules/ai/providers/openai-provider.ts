import { IntelligenceProviderType } from '@talex-touch/utils'
import { OpenAiCompatibleLangChainProvider } from './langchain-openai-compatible-provider'

const DEFAULT_BASE_URL = 'https://api.openai.com/v1'

export class OpenAIProvider extends OpenAiCompatibleLangChainProvider {
  readonly type = IntelligenceProviderType.OPENAI

  protected readonly defaultBaseUrl = DEFAULT_BASE_URL
  protected readonly defaultChatModel = 'gpt-4o-mini'
  protected readonly defaultEmbeddingModel = 'text-embedding-3-small'
  protected readonly defaultVisionModel = 'gpt-4o'
}
