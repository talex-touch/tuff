/// <reference types="node" />

import type { Buffer } from 'node:buffer'

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

export declare function recognizeImageText(
  options: NativeOcrOptions,
): Promise<NativeOcrResult>
export declare function getNativeOcrSupport(): NativeOcrSupport

export interface DarwinAppIconWriteOptions {
  sourcePath: string
  outputPath: string
  size: number
}

export interface DarwinAppIconWriteResult {
  path: string
  width: number
  height: number
}

/**
 * Resolves a Promise, but blocks the calling thread while it works: the underlying AppKit call
 * must run on the main thread, which in Electron is the JS thread. ~28 ms p50 per app on a cold
 * index. See the note in index.js and #857.
 */
export declare function writeDarwinAppIcon(
  options: DarwinAppIconWriteOptions,
): Promise<DarwinAppIconWriteResult>

export type NativeNotificationAuthStatus
  = | 'granted'
    | 'denied'
    | 'notDetermined'
    | 'unverifiable'
    | 'unsupported'

export interface NativeNotificationAuthResult {
  status: NativeNotificationAuthStatus
  reason?: string
}

export declare function getNotificationAuthorizationStatus(): Promise<NativeNotificationAuthResult>
