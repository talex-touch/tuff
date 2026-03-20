import type {
  IntelligenceAudioTranscribePayload,
  IntelligenceAudioTranscribeResult,
  IntelligenceImageEditPayload,
  IntelligenceImageEditResult,
  IntelligenceImageGeneratePayload,
  IntelligenceImageGenerateResult,
  IntelligenceInvokeResult,
  IntelligenceSTTPayload,
  IntelligenceSTTResult,
  IntelligenceTTSPayload,
  IntelligenceTTSResult,
  IntelligenceVideoGeneratePayload,
  IntelligenceVideoGenerateResult
} from '@talex-touch/tuff-intelligence'
import type { CapabilityTestPayload } from './base-tester'
import { BaseCapabilityTester } from './base-tester'

const SAMPLE_IMAGE_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7ZL3sAAAAASUVORK5CYII='

const SAMPLE_AUDIO_DATA_URL =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAIlYAAESsAAACABAAZGF0YQAAAAA='

export class ImageGenerateTester extends BaseCapabilityTester<
  IntelligenceImageGeneratePayload,
  IntelligenceImageGenerateResult
> {
  readonly capabilityType = 'image-generate'

  async generateTestPayload(
    input: CapabilityTestPayload
  ): Promise<IntelligenceImageGeneratePayload> {
    return {
      prompt: input.userInput || 'A minimalistic mountain landscape, flat design',
      count: 1
    }
  }

  formatTestResult(result: IntelligenceInvokeResult<IntelligenceImageGenerateResult>) {
    const first = result.result.images?.[0]
    const preview = first?.url || (first?.base64 ? '[base64 image generated]' : '')
    return {
      success: true,
      message: '图像生成测试成功',
      textPreview: preview,
      provider: result.provider,
      model: result.model,
      latency: result.latency
    }
  }

  getDefaultInputHint(): string {
    return '输入图片生成提示词，例如：一只赛博朋克风格的猫'
  }

  requiresUserInput(): boolean {
    return true
  }
}

export class ImageEditTester extends BaseCapabilityTester<
  IntelligenceImageEditPayload,
  IntelligenceImageEditResult
> {
  readonly capabilityType = 'image-edit'

  async generateTestPayload(input: CapabilityTestPayload): Promise<IntelligenceImageEditPayload> {
    return {
      source: {
        type: 'data-url',
        dataUrl: SAMPLE_IMAGE_DATA_URL
      },
      prompt: input.userInput || 'Enhance contrast and sharpness',
      editType: 'variation'
    }
  }

  formatTestResult(result: IntelligenceInvokeResult<IntelligenceImageEditResult>) {
    const preview =
      result.result.image?.url || (result.result.image?.base64 ? '[base64 image edited]' : '')
    return {
      success: true,
      message: '图像编辑测试成功',
      textPreview: preview,
      provider: result.provider,
      model: result.model,
      latency: result.latency
    }
  }

  getDefaultInputHint(): string {
    return '输入图像编辑提示，例如：提高清晰度'
  }

  requiresUserInput(): boolean {
    return true
  }
}

export class AudioTTSTester extends BaseCapabilityTester<
  IntelligenceTTSPayload,
  IntelligenceTTSResult
> {
  readonly capabilityType = 'audio-tts'

  async generateTestPayload(input: CapabilityTestPayload): Promise<IntelligenceTTSPayload> {
    return {
      text: input.userInput || 'Hello from Tuff Intelligence',
      voice: 'alloy',
      format: 'mp3'
    }
  }

  formatTestResult(result: IntelligenceInvokeResult<IntelligenceTTSResult>) {
    const preview =
      result.result.url || (typeof result.result.audio === 'string' ? result.result.audio : '')
    return {
      success: true,
      message: '语音合成测试成功',
      textPreview: preview,
      provider: result.provider,
      model: result.model,
      latency: result.latency
    }
  }

  getDefaultInputHint(): string {
    return '输入需要语音合成的文本'
  }

  requiresUserInput(): boolean {
    return true
  }
}

export class AudioSTTTester extends BaseCapabilityTester<
  IntelligenceSTTPayload,
  IntelligenceSTTResult
> {
  readonly capabilityType = 'audio-stt'

  async generateTestPayload(): Promise<IntelligenceSTTPayload> {
    return {
      audio: SAMPLE_AUDIO_DATA_URL,
      format: 'wav',
      enableTimestamps: true
    }
  }

  formatTestResult(result: IntelligenceInvokeResult<IntelligenceSTTResult>) {
    const preview = result.result.text?.slice(0, 200)
    return {
      success: true,
      message: '语音识别测试成功',
      textPreview: preview,
      provider: result.provider,
      model: result.model,
      latency: result.latency
    }
  }

  getDefaultInputHint(): string {
    return '使用内置音频片段进行测试'
  }

  requiresUserInput(): boolean {
    return false
  }
}

export class AudioTranscribeTester extends BaseCapabilityTester<
  IntelligenceAudioTranscribePayload,
  IntelligenceAudioTranscribeResult
> {
  readonly capabilityType = 'audio-transcribe'

  async generateTestPayload(): Promise<IntelligenceAudioTranscribePayload> {
    return {
      audio: SAMPLE_AUDIO_DATA_URL,
      format: 'wav',
      task: 'transcribe',
      enableTimestamps: true
    }
  }

  formatTestResult(result: IntelligenceInvokeResult<IntelligenceAudioTranscribeResult>) {
    const preview = result.result.text?.slice(0, 200)
    return {
      success: true,
      message: '音频转录测试成功',
      textPreview: preview,
      provider: result.provider,
      model: result.model,
      latency: result.latency
    }
  }

  getDefaultInputHint(): string {
    return '使用内置音频片段进行测试'
  }

  requiresUserInput(): boolean {
    return false
  }
}

export class VideoGenerateTester extends BaseCapabilityTester<
  IntelligenceVideoGeneratePayload,
  IntelligenceVideoGenerateResult
> {
  readonly capabilityType = 'video-generate'

  async generateTestPayload(
    input: CapabilityTestPayload
  ): Promise<IntelligenceVideoGeneratePayload> {
    return {
      prompt: input.userInput || 'A calm ocean wave in cinematic style',
      duration: 4,
      fps: 24
    }
  }

  formatTestResult(result: IntelligenceInvokeResult<IntelligenceVideoGenerateResult>) {
    const first = result.result.videos?.[0]
    const preview = first?.url || (first?.base64 ? '[base64 video generated]' : '')
    return {
      success: true,
      message: '视频生成测试成功',
      textPreview: preview,
      provider: result.provider,
      model: result.model,
      latency: result.latency
    }
  }

  getDefaultInputHint(): string {
    return '输入视频生成提示词，例如：黄昏下的城市延时摄影'
  }

  requiresUserInput(): boolean {
    return true
  }
}
