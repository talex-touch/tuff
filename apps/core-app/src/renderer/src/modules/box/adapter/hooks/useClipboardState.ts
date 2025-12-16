/**
 * Clipboard State Management Hook
 *
 * Centralized clipboard state management for CoreBox search.
 * Ensures consistency between UI display and search query building.
 */

import type { TuffQueryInput } from '@talex-touch/utils'
import type { IClipboardOptions } from './types'
import type { IBoxOptions } from '..'
import { TuffInputType } from '@talex-touch/utils'
import { computed, type ComputedRef } from 'vue'
import { BoxMode } from '..'

const MIN_TEXT_ATTACHMENT_LENGTH = 80

/**
 * Options for clipboard state hook
 */
export interface UseClipboardStateOptions {
  boxOptions: IBoxOptions
  clipboardOptions: IClipboardOptions
}

/**
 * Return type for useClipboardState hook
 */
export interface ClipboardStateReturn {
  /**
   * Whether clipboard content is currently active (visible in UI)
   */
  hasActiveClipboard: ComputedRef<boolean>

  /**
   * Get current clipboard type for display
   */
  clipboardType: ComputedRef<'text' | 'image' | 'files' | 'html' | null>

  /**
   * Build TuffQueryInput array from current clipboard/file state
   * Only includes clipboard if it's active in UI
   */
  buildQueryInputs: () => TuffQueryInput[]

  /**
   * Safely serialize metadata for IPC transfer
   */
  safeSerializeMetadata: (meta: Record<string, unknown> | null | undefined) => Record<string, unknown> | undefined
}

/**
 * Safely serialize metadata for IPC transfer
 */
function safeSerializeMetadata(
  meta: Record<string, unknown> | null | undefined
): Record<string, unknown> | undefined {
  if (!meta) return undefined
  try {
    const safe: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(meta)) {
      if (value === null || value === undefined) continue
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        safe[key] = value
      }
    }
    return Object.keys(safe).length > 0 ? safe : undefined
  } catch {
    return undefined
  }
}

/**
 * Clipboard state management hook
 *
 * Provides centralized clipboard state for CoreBox:
 * - Tracks active clipboard content
 * - Builds query inputs consistently
 * - Ensures UI and search query are always in sync
 */
export function useClipboardState(options: UseClipboardStateOptions): ClipboardStateReturn {
  const { boxOptions, clipboardOptions } = options

  /**
   * Check if clipboard content is currently active (should be shown in UI and included in queries)
   */
  const hasActiveClipboard = computed(() => {
    // File mode overrides clipboard
    if (boxOptions.mode === BoxMode.FILE && boxOptions.file?.paths?.length) {
      return true
    }

    // Check if we have clipboard content
    return clipboardOptions.last !== null && clipboardOptions.last.type !== undefined
  })

  /**
   * Get current clipboard type
   */
  const clipboardType = computed<'text' | 'image' | 'files' | 'html' | null>(() => {
    // File mode
    if (boxOptions.mode === BoxMode.FILE && boxOptions.file?.paths?.length) {
      return 'files'
    }

    if (!clipboardOptions.last) return null

    const type = clipboardOptions.last.type
    if (type === 'text' && clipboardOptions.last.rawContent) {
      return 'html'
    }

    return type as 'text' | 'image' | 'files' | null
  })

  /**
   * Build TuffQueryInput array from current clipboard/file state
   * This is the SINGLE source of truth for clipboard in queries
   */
  function buildQueryInputs(): TuffQueryInput[] {
    const inputs: TuffQueryInput[] = []

    // Priority 1: Image clipboard
    if (clipboardOptions.last?.type === 'image') {
      inputs.push({
        type: TuffInputType.Image,
        content: clipboardOptions.last.content,
        thumbnail: clipboardOptions.last.thumbnail ?? undefined,
        metadata: safeSerializeMetadata(clipboardOptions.last.meta)
      })
      return inputs
    }

    // Priority 2: File mode (explicit file selection)
    if (boxOptions.mode === BoxMode.FILE && boxOptions.file?.paths?.length) {
      inputs.push({
        type: TuffInputType.Files,
        content: JSON.stringify(boxOptions.file.paths),
        metadata: undefined
      })
      return inputs
    }

    // Priority 3: Clipboard files
    if (clipboardOptions.last?.type === 'files') {
      inputs.push({
        type: TuffInputType.Files,
        content: clipboardOptions.last.content,
        metadata: safeSerializeMetadata(clipboardOptions.last.meta)
      })
      return inputs
    }

    // Priority 4: Text/HTML clipboard (only if >= 80 chars)
    const last = clipboardOptions.last
    if (last && (last.type === 'text' || (last.type as string) === 'html')) {
      const content = last.content ?? ''
      if (content.length >= MIN_TEXT_ATTACHMENT_LENGTH) {
        if (last.rawContent) {
          inputs.push({
            type: TuffInputType.Html,
            content,
            rawContent: last.rawContent,
            metadata: safeSerializeMetadata(last.meta)
          })
        } else {
          inputs.push({
            type: TuffInputType.Text,
            content,
            metadata: safeSerializeMetadata(last.meta)
          })
        }
        return inputs
      }
    }

    return inputs
  }

  return {
    hasActiveClipboard,
    clipboardType,
    buildQueryInputs,
    safeSerializeMetadata
  }
}
