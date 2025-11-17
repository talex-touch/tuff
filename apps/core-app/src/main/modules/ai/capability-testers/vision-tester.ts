import path from 'node:path'
import { readdirSync, existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import type { AiInvokeResult, AiVisionOcrPayload, AiVisionOcrResult } from '@talex-touch/utils'
import { BaseCapabilityTester, type CapabilityTestPayload } from './base-tester'
import { getCapabilityPrompt } from '../ai-config'

export class VisionCapabilityTester extends BaseCapabilityTester {
  readonly capabilityType = 'vision'

  async generateTestPayload(input: CapabilityTestPayload): Promise<AiVisionOcrPayload> {
    const source = input.source ?? (await this.loadSampleImageSource('ocr'))
    
    return {
      source,
      prompt: getCapabilityPrompt('vision.ocr'),
      includeKeywords: true,
      includeLayout: true
    }
  }

  formatTestResult(result: AiInvokeResult<AiVisionOcrResult>) {
    const ocrResult = result.result
    const preview = ocrResult.text.length > 200 
      ? `${ocrResult.text.slice(0, 200)}...` 
      : ocrResult.text

    const keywords = ocrResult.keywords?.length 
      ? `\n关键词: ${ocrResult.keywords.join(', ')}` 
      : ''

    return {
      success: true,
      message: 'OCR 测试成功',
      textPreview: preview + keywords,
      provider: result.provider,
      model: result.model,
      latency: result.latency
    }
  }

  getDefaultInputHint(): string {
    return '使用内置示例图片进行测试'
  }

  requiresUserInput(): boolean {
    return false
  }

  private async loadSampleImageSource(folder: string): Promise<AiVisionOcrPayload['source']> {
    const dir = this.resolveSampleDirectory(folder)
    if (!dir) {
      throw new Error('Sample image directory not found')
    }

    const files = readdirSync(dir).filter((file) => /\.(png|jpe?g|webp|gif|bmp)$/i.test(file))

    if (files.length === 0) {
      throw new Error('Sample image folder is empty')
    }

    const fileName = files[Math.floor(Math.random() * files.length)]
    const filePath = path.join(dir, fileName)
    const buffer = await readFile(filePath)
    const mime = this.detectMime(fileName)

    return {
      type: 'data-url',
      dataUrl: `data:${mime};base64,${buffer.toString('base64')}`
    }
  }

  private resolveSampleDirectory(folder: string): string | null {
    const guesses = [
      path.resolve(process.cwd(), 'apps/core-app/resources/intelligence/test-capability', folder),
      path.resolve(process.cwd(), 'resources/intelligence/test-capability', folder),
      path.resolve(process.resourcesPath, 'intelligence/test-capability', folder)
    ]

    for (const guess of guesses) {
      if (existsSync(guess)) {
        return guess
      }
    }

    return null
  }

  private detectMime(fileName: string): string {
    const ext = path.extname(fileName).toLowerCase()
    switch (ext) {
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg'
      case '.webp':
        return 'image/webp'
      case '.gif':
        return 'image/gif'
      case '.bmp':
        return 'image/bmp'
      default:
        return 'image/png'
    }
  }
}
