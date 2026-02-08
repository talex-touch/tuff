/// <reference types="node" />

export interface NativeOcrBlock {
  text: string
  confidence?: number
  boundingBox?: [number, number, number, number]
}

export interface NativeOcrOptions {
  image: Buffer
  languageHint?: string
  includeLayout?: boolean
  maxBlocks?: number
}

export interface NativeOcrResult {
  text: string
  confidence?: number
  language?: string
  blocks?: NativeOcrBlock[]
  engine: 'apple-vision' | 'windows-ocr'
  durationMs: number
}

export interface NativeOcrSupport {
  supported: boolean
  platform: string
  reason?: string
}

export declare function recognizeImageText(options: NativeOcrOptions): Promise<NativeOcrResult>
export declare function getNativeOcrSupport(): NativeOcrSupport
