import type {
  IntelligenceAudioTranscribePayload,
  IntelligenceAudioTranscribeResult,
  IntelligenceEmbeddingPayload,
  IntelligenceImageEditPayload,
  IntelligenceImageEditResult,
  IntelligenceImageGeneratePayload,
  IntelligenceImageGenerateResult,
  IntelligenceInvokeOptions,
  IntelligenceInvokeResult,
  IntelligenceSTTPayload,
  IntelligenceSTTResult,
  IntelligenceTTSPayload,
  IntelligenceTTSResult,
  IntelligenceVideoGeneratePayload,
  IntelligenceVideoGenerateResult
} from '@talex-touch/tuff-intelligence'
import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'
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

  async imageGenerate(
    _payload: IntelligenceImageGeneratePayload,
    _options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<IntelligenceImageGenerateResult>> {
    throw new Error('[DeepSeekProvider] Image generate capability is unsupported')
  }

  async imageEdit(
    _payload: IntelligenceImageEditPayload,
    _options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<IntelligenceImageEditResult>> {
    throw new Error('[DeepSeekProvider] Image edit capability is unsupported')
  }

  async tts(
    _payload: IntelligenceTTSPayload,
    _options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<IntelligenceTTSResult>> {
    throw new Error('[DeepSeekProvider] TTS capability is unsupported')
  }

  async stt(
    _payload: IntelligenceSTTPayload,
    _options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<IntelligenceSTTResult>> {
    throw new Error('[DeepSeekProvider] STT capability is unsupported')
  }

  async audioTranscribe(
    _payload: IntelligenceAudioTranscribePayload,
    _options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<IntelligenceAudioTranscribeResult>> {
    throw new Error('[DeepSeekProvider] Audio transcribe capability is unsupported')
  }

  async videoGenerate(
    _payload: IntelligenceVideoGeneratePayload,
    _options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<IntelligenceVideoGenerateResult>> {
    throw new Error('[DeepSeekProvider] Video generate capability is unsupported')
  }
}
