/// <reference types="node" />

import type { Buffer } from 'node:buffer'

export interface NativeScreenshotSupport {
  supported: boolean
  platform: string
  engine?: 'xcap' | string
  reason?: string
}

export interface NativeScreenshotDisplay {
  id: string
  name: string
  friendlyName?: string
  x: number
  y: number
  width: number
  height: number
  scaleFactor: number
  rotation: number
  isPrimary: boolean
}

export interface NativeScreenshotRegion {
  x: number
  y: number
  width: number
  height: number
}

export interface NativeScreenshotCaptureOptions {
  displayId?: string
  cursorX?: number
  cursorY?: number
  region?: NativeScreenshotRegion
}

export interface NativeScreenshotCaptureResult {
  image: Buffer
  mimeType: 'image/png' | string
  width: number
  height: number
  displayId: string
  displayName: string
  x: number
  y: number
  scaleFactor: number
  durationMs: number
}

export declare function getNativeScreenshotSupport(): NativeScreenshotSupport
export declare function listDisplays(): NativeScreenshotDisplay[]
export declare function captureDisplay(displayId?: string): NativeScreenshotCaptureResult
export declare function captureRegion(
  options: NativeScreenshotCaptureOptions,
): NativeScreenshotCaptureResult
export declare function capture(
  options?: NativeScreenshotCaptureOptions,
): NativeScreenshotCaptureResult
