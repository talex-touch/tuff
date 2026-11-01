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
import { t } from '../../../utils/i18n-helper'
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
    const unknown = t('intelligence.capabilityTest.preview.unknown')
    const duration =
      typeof result.result?.duration === 'number' ? `${result.result.duration}s` : unknown
    const sampleRate = result.result?.sampleRate

    return this.buildTestResult(result, {
      message: t('intelligence.capabilityTest.message.tts', {
        format: result.result?.format || unknown
      }),
      textPreview:
        typeof sampleRate === 'number'
          ? t('intelligence.capabilityTest.preview.ttsAudio', { duration, sampleRate })
          : t('intelligence.capabilityTest.preview.ttsDuration', { duration })
    })
  }

  getDefaultInputHint(): string {
    return t('intelligence.capabilityTest.hint.tts')
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
    const confidenceLabel =
      typeof confidence === 'number'
        ? confidence.toFixed(2)
        : t('intelligence.capabilityTest.preview.unknown')

    return this.buildTestResult(result, {
      message: t('intelligence.capabilityTest.message.stt', { confidence: confidenceLabel }),
      textPreview: text
    })
  }

  getDefaultInputHint(): string {
    return t('intelligence.capabilityTest.hint.stt')
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
      message: textPreview
        ? t('intelligence.capabilityTest.message.asr')
        : t('intelligence.capabilityTest.message.asrNoSpeech'),
      latency,
      stability: {
        status: textPreview ? ('stable' as const) : ('unknown' as const),
        summary: textPreview
          ? t('intelligence.capabilityTest.summary.asrRecognized')
          : t('intelligence.capabilityTest.summary.asrNoSpeech')
      },
      ...(textPreview ? { textPreview } : {})
    }
  }

  getDefaultInputHint(): string {
    return t('intelligence.capabilityTest.hint.asr')
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
      message: t('intelligence.capabilityTest.message.audioTranscribe', {
        count: segmentCount,
        duration: result.result?.duration ?? 0
      }),
      textPreview: result.result?.text || ''
    })
  }

  getDefaultInputHint(): string {
    return t('intelligence.capabilityTest.hint.audioTranscribe')
  }

  requiresUserInput(): boolean {
    return false
  }
}
