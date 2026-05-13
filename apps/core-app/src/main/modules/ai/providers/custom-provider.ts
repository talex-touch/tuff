import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'
import { OpenAiCompatibleLangChainProvider } from './langchain-openai-compatible-provider'

export class CustomProvider extends OpenAiCompatibleLangChainProvider {
  readonly type = IntelligenceProviderType.CUSTOM
  protected readonly defaultBaseUrl = 'https://api.openai.com/v1'
  protected readonly defaultChatModel = 'gpt-4o-mini'
}
