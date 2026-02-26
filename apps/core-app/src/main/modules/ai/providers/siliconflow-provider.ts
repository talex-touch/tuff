import { IntelligenceProviderType } from '@talex-touch/utils'
import { OpenAiCompatibleLangChainProvider } from './langchain-openai-compatible-provider'

const DEFAULT_BASE_URL = 'https://api.siliconflow.cn/v1'

export class SiliconflowProvider extends OpenAiCompatibleLangChainProvider {
  readonly type = IntelligenceProviderType.SILICONFLOW

  protected readonly defaultBaseUrl = DEFAULT_BASE_URL
  protected readonly defaultChatModel = 'deepseek-ai/DeepSeek-R1-0528-Qwen3-8B'
  protected readonly defaultEmbeddingModel = 'netease-youdao/bce-embedding-base_v1'
  protected readonly defaultVisionModel = 'deepseek-ai/DeepSeek-OCR'
}
