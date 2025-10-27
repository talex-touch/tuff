/**
 * Icon type definitions
 *
 * @description
 * Defines common icon interfaces and types, supporting emoji, url, and file types
 */

/**
 * Icon type enumeration
 * @description
 * - emoji: Emoji characters (e.g., "🚀")
 * - url: Remote URL (http/https) or Data URL (data:image/...)
 * - file: Local file path (relative to plugin root directory)
 */
export type TuffIconType = 'emoji' | 'url' | 'file'

/**
 * Icon status enumeration
 * @description
 * - normal: Normal state
 * - loading: Loading state
 * - error: Error state
 */
export type TuffIconStatus = 'normal' | 'loading' | 'error'

/**
 * Common icon interface
 *
 * @description
 * Unified icon data structure supporting three icon types and status management
 */
export interface ITuffIcon {
  /** Icon type */
  type: TuffIconType

  /** Icon value */
  value: string

  /** Icon status (optional) */
  status?: TuffIconStatus

  /** Error message (when status is error) */
  error?: string
}
