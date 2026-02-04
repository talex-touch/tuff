import type { CoreBoxThemeConfig, LayoutAtomConfig } from './layout-atom-types'

/**
 * Version of the preset export format
 * Increment when breaking changes occur
 */
export const PRESET_EXPORT_VERSION = 1

/**
 * Preset export data structure
 * Supports both local file export and future cloud publishing
 */
export interface PresetExportData {
  /** Export format version */
  version: number
  /** Export timestamp (ISO 8601) */
  exportedAt: string
  /** Optional preset metadata */
  meta: PresetMeta
  /** Layout atom configuration */
  layout?: LayoutAtomConfig
  /** CoreBox theme configuration */
  coreBox?: CoreBoxThemeConfig
}

/**
 * Preset metadata for identification and discovery
 */
export interface PresetMeta {
  /** Unique preset ID (uuid for local, assigned for cloud) */
  id?: string
  /** Human-readable name */
  name: string
  /** Optional description */
  description?: string
  /** Author information */
  author?: PresetAuthor
  /** Tags for categorization */
  tags?: string[]
  /** Preview image URL or data URI */
  preview?: string
  /** Creation timestamp */
  createdAt?: string
  /** Last update timestamp */
  updatedAt?: string
}

/**
 * Author information for cloud-published presets
 */
export interface PresetAuthor {
  /** Author display name */
  name: string
  /** Author ID (for cloud) */
  id?: string
  /** Author avatar URL */
  avatar?: string
}

/**
 * Cloud preset listing item (for marketplace)
 */
export interface CloudPresetItem {
  /** Unique cloud ID */
  id: string
  /** Preset metadata */
  meta: PresetMeta
  /** Download count */
  downloads: number
  /** Like count */
  likes: number
  /** Whether current user liked */
  liked?: boolean
  /** Publish status */
  status: 'published' | 'pending' | 'rejected'
  /** Publish timestamp */
  publishedAt: string
}

/**
 * Cloud preset API response
 */
export interface CloudPresetListResponse {
  items: CloudPresetItem[]
  total: number
  page: number
  pageSize: number
}

/**
 * Cloud preset publish request
 */
export interface CloudPresetPublishRequest {
  preset: PresetExportData
  visibility: 'public' | 'unlisted' | 'private'
}

/**
 * Validation result for preset import
 */
export interface PresetValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

/**
 * Validates a preset export data structure
 */
export function validatePresetData(data: unknown): PresetValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Invalid data format'], warnings: [] }
  }

  const preset = data as Record<string, unknown>

  // Check version
  if (typeof preset.version !== 'number') {
    errors.push('Missing or invalid version field')
  } else if (preset.version > PRESET_EXPORT_VERSION) {
    warnings.push(`Preset version (${preset.version}) is newer than supported (${PRESET_EXPORT_VERSION})`)
  }

  // Check meta
  if (!preset.meta || typeof preset.meta !== 'object') {
    errors.push('Missing or invalid meta field')
  } else {
    const meta = preset.meta as Record<string, unknown>
    if (typeof meta.name !== 'string' || !meta.name.trim()) {
      errors.push('Missing or invalid preset name')
    }
  }

  // Check that at least one config is present
  if (!preset.layout && !preset.coreBox) {
    warnings.push('Preset contains no layout or CoreBox configuration')
  }

  // Validate layout structure if present
  if (preset.layout) {
    const layout = preset.layout as Record<string, unknown>
    if (!layout.preset || !layout.header || !layout.aside || !layout.view || !layout.nav) {
      errors.push('Invalid layout configuration structure')
    }
  }

  // Validate coreBox structure if present
  if (preset.coreBox) {
    const coreBox = preset.coreBox as Record<string, unknown>
    if (!coreBox.preset || !coreBox.logo || !coreBox.input || !coreBox.result) {
      errors.push('Invalid CoreBox configuration structure')
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  }
}

/**
 * Creates a new preset export data structure
 */
export function createPresetExport(options: {
  name: string
  description?: string
  layout?: LayoutAtomConfig
  coreBox?: CoreBoxThemeConfig
  author?: PresetAuthor
  tags?: string[]
}): PresetExportData {
  const now = new Date().toISOString()
  return {
    version: PRESET_EXPORT_VERSION,
    exportedAt: now,
    meta: {
      id: crypto.randomUUID(),
      name: options.name,
      description: options.description,
      author: options.author,
      tags: options.tags,
      createdAt: now,
      updatedAt: now
    },
    layout: options.layout,
    coreBox: options.coreBox
  }
}
