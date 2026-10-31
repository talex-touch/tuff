import type {
  IntelligenceImageAnalyzePayload,
  IntelligenceImageAnalyzeResult,
  IntelligenceImageCaptionPayload,
  IntelligenceImageCaptionResult,
  IntelligenceImageEditPayload,
  IntelligenceImageEditResult,
  IntelligenceImageGeneratePayload,
  IntelligenceImageGenerateResult,
  IntelligenceImageTranslateE2ePayload,
  IntelligenceImageTranslateE2eResult,
  IntelligenceInvokeResult,
  IntelligenceVisionImageSource
} from '@talex-touch/tuff-intelligence'
import type { CapabilityTestPayload } from './base-tester'
import { t } from '../../../utils/i18n-helper'
import { BaseCapabilityTester } from './base-tester'

const SAMPLE_IMAGE_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAfAAAAA0CAIAAAD6wP2nAAAB2klEQVR42u3c0Y2DMBBFUYqg/8rSS0gJoOR5Zpxzpf2LWIPNCVJkjpckaYuOz99bkjQ8oEsS0CVJQJckAV2SBHRJArokCeiSJKBLkoAuSUCXJO0O+vlFd8aROM6vrlHi3Duc18q5SKyZbvNYdV90GGd6Lqas4apxAh3oQAc60IEOdKADHehABzrQgQ50oAO9HvQENAnU0qBXHXPlDdZt3ld+gU1cG1P+V3qc3R7+Sq450IEOdKADHehABzrQgQ50oAMd6EAHOtCBvgnod47f+cYGOtAngp7+4RfoQAc60IEOdKADHehABzrQgQ50oAMd6EBP3QxVG3YS45x4g63ceLIr6CM2ngxdb4kHo8SGrPI1A3SgAx3oQAc60IEOdKADHehABzrQgQ5073Lxo2gL1IDe51wmjn/lg9d0Tx59HuhABzrQgQ50oAMd6EAHOtCBDnSgAx3oQPdyLi/nAiLQ/8gToAMd6EAHOtCBDnSgAx3oQAc60IFu/EAHemoCEpuVqjZATQR95WalDiBWrbdusFZdt6fH32mcQAc60IEOdKADHehABzrQgQ50oAMd6EDvC7okqUlAlySgS5KALkkCuiQJ6JIEdEkS0CVJQJckAV2SgC5JGg66JGmDLjmMItnkhAyMAAAAAElFTkSuQmCC'

export function createSampleImageSource(): IntelligenceVisionImageSource {
  return {
    type: 'data-url',
    dataUrl: `data:image/png;base64,${SAMPLE_IMAGE_BASE64}`
  }
}

function isVisionImageSource(value: unknown): value is IntelligenceVisionImageSource {
  if (!value || typeof value !== 'object' || !('type' in value)) return false

  const { type } = value
  if (type === 'data-url') {
    return 'dataUrl' in value && typeof value.dataUrl === 'string'
  }
  if (type === 'base64') {
    return 'base64' in value && typeof value.base64 === 'string'
  }
  if (type === 'file') {
    return 'filePath' in value && typeof value.filePath === 'string'
  }
  return false
}

function resolveImageSource(input: CapabilityTestPayload): IntelligenceVisionImageSource {
  return isVisionImageSource(input.source) ? input.source : createSampleImageSource()
}

export class ImageCaptionTester extends BaseCapabilityTester<
  IntelligenceImageCaptionPayload,
  IntelligenceImageCaptionResult
> {
  readonly capabilityType = 'image-caption'

  async generateTestPayload(
    input: CapabilityTestPayload
  ): Promise<IntelligenceImageCaptionPayload> {
    return {
      source: resolveImageSource(input),
      style: 'brief',
      language: 'zh-CN',
      maxLength: 80
    }
  }

  formatTestResult(result: IntelligenceInvokeResult<IntelligenceImageCaptionResult>) {
    const caption = result.result?.caption || ''
    const tags = result.result?.tags?.length
      ? t('intelligence.capabilityTest.preview.tags', { tags: result.result.tags.join(', ') })
      : ''

    return this.buildTestResult(result, {
      message: t('intelligence.capabilityTest.message.imageCaption'),
      textPreview: [caption, tags].filter(Boolean).join('\n')
    })
  }

  getDefaultInputHint(): string {
    return t('intelligence.capabilityTest.hint.imageCaption')
  }

  requiresUserInput(): boolean {
    return false
  }
}

export class ImageAnalyzeTester extends BaseCapabilityTester<
  IntelligenceImageAnalyzePayload,
  IntelligenceImageAnalyzeResult
> {
  readonly capabilityType = 'image-analyze'

  async generateTestPayload(
    input: CapabilityTestPayload
  ): Promise<IntelligenceImageAnalyzePayload> {
    return {
      source: resolveImageSource(input),
      analysisTypes: ['objects', 'text', 'colors', 'composition', 'scene'],
      language: 'zh-CN',
      detailed: true
    }
  }

  formatTestResult(result: IntelligenceInvokeResult<IntelligenceImageAnalyzeResult>) {
    const objectCount = result.result?.objects?.length || 0
    const colorCount = result.result?.colors?.length || 0

    return this.buildTestResult(result, {
      message: t('intelligence.capabilityTest.message.imageAnalyze', {
        objects: objectCount,
        colors: colorCount
      }),
      textPreview: result.result?.description || JSON.stringify(result.result, null, 2)
    })
  }

  getDefaultInputHint(): string {
    return t('intelligence.capabilityTest.hint.imageAnalyze')
  }

  requiresUserInput(): boolean {
    return false
  }
}

export class ImageTranslateE2eTester extends BaseCapabilityTester<
  IntelligenceImageTranslateE2ePayload,
  IntelligenceImageTranslateE2eResult
> {
  readonly capabilityType = 'image-translate-e2e'

  async generateTestPayload(): Promise<IntelligenceImageTranslateE2ePayload> {
    return {
      imageBase64: SAMPLE_IMAGE_BASE64,
      imageMimeType: 'image/png',
      sourceLang: 'en',
      targetLang: 'zh-CN',
      metadata: { fixture: 'capability-test' }
    }
  }

  formatTestResult(result: IntelligenceInvokeResult<IntelligenceImageTranslateE2eResult>) {
    const sourceText = result.result?.sourceText || ''
    const targetText = result.result?.targetText || ''

    return this.buildTestResult(result, {
      message: t('intelligence.capabilityTest.message.imageTranslate', {
        mimeType: result.result?.imageMimeType || 'image/png'
      }),
      textPreview: [sourceText, targetText].filter(Boolean).join('\n→ ')
    })
  }

  getDefaultInputHint(): string {
    return t('intelligence.capabilityTest.hint.imageTranslate')
  }

  requiresUserInput(): boolean {
    return false
  }
}

export class ImageGenerateTester extends BaseCapabilityTester<
  IntelligenceImageGeneratePayload,
  IntelligenceImageGenerateResult
> {
  readonly capabilityType = 'image-generate'

  async generateTestPayload(
    input: CapabilityTestPayload
  ): Promise<IntelligenceImageGeneratePayload> {
    return {
      prompt: input.userInput || 'A compact productivity launcher interface, clean dark UI',
      width: 1024,
      height: 1024,
      style: 'product-ui',
      quality: 'standard',
      count: 1
    }
  }

  formatTestResult(result: IntelligenceInvokeResult<IntelligenceImageGenerateResult>) {
    const imageCount = result.result?.images?.length || 0
    const first = result.result?.images?.[0]
    const preview =
      first?.revisedPrompt ||
      first?.url ||
      (first?.base64 ? t('intelligence.capabilityTest.preview.base64Image') : '')

    return this.buildTestResult(result, {
      message: t('intelligence.capabilityTest.message.imageGenerate', { count: imageCount }),
      textPreview: preview
    })
  }

  getDefaultInputHint(): string {
    return t('intelligence.capabilityTest.hint.imageGenerate')
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
      source: resolveImageSource(input),
      prompt: input.userInput || 'Highlight the visible text with a subtle yellow marker effect.',
      editType: 'inpaint'
    }
  }

  formatTestResult(result: IntelligenceInvokeResult<IntelligenceImageEditResult>) {
    const preview =
      result.result?.revisedPrompt ||
      result.result?.image?.url ||
      t('intelligence.capabilityTest.preview.editedImage')

    return this.buildTestResult(result, {
      message: t('intelligence.capabilityTest.message.imageEdit'),
      textPreview: preview
    })
  }

  getDefaultInputHint(): string {
    return t('intelligence.capabilityTest.hint.imageEdit')
  }

  requiresUserInput(): boolean {
    return true
  }
}
