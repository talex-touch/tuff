/// <reference types="node" />

import type { Buffer } from 'node:buffer'
import type { NativeOcrResult } from './index'

export interface RustOcrRequestOptions {
  filePath?: string
  image?: Buffer
  languageHint?: string
  includeLayout?: boolean
  maxBlocks?: number
}

export interface RustOcrInvocationOptions {
  timeoutMs?: number
  signal?: AbortSignal
  idleTtlMs?: number
}

export interface RustOcrHelperStatus {
  available: boolean
  helperPath: string
  reason?: string
}

export declare function getRustOcrHelperStatus(): RustOcrHelperStatus

export declare function recognizeImageTextViaRustHelper(
  options: RustOcrRequestOptions,
  invocation?: RustOcrInvocationOptions,
): Promise<NativeOcrResult>

export declare function closeRustOcrHelper(): void
