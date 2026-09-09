import type {
  IntelligenceAudioTranscribePayload,
  IntelligenceAudioTranscribeResult,
  IntelligenceInvokeResult,
  IntelligenceSTTPayload,
  IntelligenceSTTResult,
  IntelligenceTTSPayload,
  IntelligenceTTSResult
} from '@talex-touch/tuff-intelligence'
import type { CapabilityTestPayload } from './base-tester'
import { BaseCapabilityTester } from './base-tester'

const SAMPLE_WAV_BASE64 =
  'UklGRkQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YSAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=='

export class TtsCapabilityTester extends BaseCapabilityTester<
  IntelligenceTTSPayload,
  IntelligenceTTSResult
> {
  readonly capabilityType = 'tts'

  async generateTestPayload(input: CapabilityTestPayload): Promise<IntelligenceTTSPayload> {
    return {
      text: input.userInput || 'Talex Touch AI capability test is ready.',
      language: 'en-US',
      speed: 1,
      format: 'mp3',
      quality: 'standard'
    }
  }

  formatTestResult(result: IntelligenceInvokeResult<IntelligenceTTSResult>) {
    const duration =
      typeof result.result?.duration === 'number' ? `${result.result.duration}s` : 'unknown'
    const sampleRate =
      typeof result.result?.sampleRate === 'number' ? `, ${result.result.sampleRate}Hz` : ''

    return this.buildTestResult(result, {
      message: `语音合成完成，格式 ${result.result?.format || 'unknown'}`,
      textPreview: `duration: ${duration}${sampleRate}`
    })
  }

  getDefaultInputHint(): string {
    return '请输入要合成为语音的文本'
  }

  requiresUserInput(): boolean {
    return true
  }
}

export class SttCapabilityTester extends BaseCapabilityTester<
  IntelligenceSTTPayload,
  IntelligenceSTTResult
> {
  readonly capabilityType = 'stt'

  async generateTestPayload(): Promise<IntelligenceSTTPayload> {
    return {
      audio: `data:audio/wav;base64,${SAMPLE_WAV_BASE64}`,
      language: 'en-US',
      format: 'wav'
    }
  }

  formatTestResult(result: IntelligenceInvokeResult<IntelligenceSTTResult>) {
    const text = result.result?.text || ''
    const confidence = result.result?.confidence
    const confidenceLabel = typeof confidence === 'number' ? confidence.toFixed(2) : '未知'

    return this.buildTestResult(result, {
      message: `语音识别完成，置信度 ${confidenceLabel}`,
      textPreview: text
    })
  }

  getDefaultInputHint(): string {
    return '使用内置短音频样本进行语音识别测试'
  }

  requiresUserInput(): boolean {
    return false
  }
}

/**
 * Realtime ASR is exercised by the VoiceService stream, never by generic SDK invocation.
 */
export class AsrCapabilityTester extends BaseCapabilityTester<never, never> {
  readonly capabilityType = 'asr'

  async generateTestPayload(): Promise<never> {
    throw new Error('INTELLIGENCE_ASR_STREAM_REQUIRED')
  }

  formatTestResult(): never {
    throw new Error('INTELLIGENCE_ASR_STREAM_REQUIRED')
  }

  formatStreamResult(text: string, latency: number) {
    const textPreview = text.trim()
    return {
      success: true,
      message: textPreview ? '实时语音识别完成' : '实时语音识别完成，未检测到语音内容',
      latency,
      stability: {
        status: textPreview ? ('stable' as const) : ('unknown' as const),
        summary: textPreview
          ? '已通过实际麦克风捕获和实时 ASR 通道完成识别。'
          : '通道已完成实际麦克风捕获，但本次没有可展示的语音文本。'
      },
      ...(textPreview ? { textPreview } : {})
    }
  }

  getDefaultInputHint(): string {
    return '测试会打开麦克风并通过当前实时 ASR 能力绑定完成一次识别'
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
      audio: SAMPLE_WAV_BASE64,
      language: 'en-US',
      format: 'wav',
      task: 'transcribe',
      enableTimestamps: true,
      prompt: 'Short silence fixture for capability smoke testing.'
    }
  }

  formatTestResult(result: IntelligenceInvokeResult<IntelligenceAudioTranscribeResult>) {
    const segmentCount = result.result?.segments?.length || 0

    return this.buildTestResult(result, {
      message: `音频转录完成，${segmentCount} 个片段，时长 ${result.result?.duration ?? 0}s`,
      textPreview: result.result?.text || ''
    })
  }

  getDefaultInputHint(): string {
    return '使用内置短音频样本进行转录测试'
  }

  requiresUserInput(): boolean {
    return false
  }
}
