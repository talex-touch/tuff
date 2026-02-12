import type {
  CoreBoxCanvasConfig,
  CoreBoxThemeConfig,
  LayoutAtomConfig,
  LayoutCanvasConfig,
  ThemePresetConfig,
} from './layout-atom-types'

/**
 * Version of the preset export format
 * Increment when breaking changes occur
 */
export const PRESET_EXPORT_VERSION = 2

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
  /** Theme-level configuration */
  theme?: ThemePresetConfig
  /** Main layout canvas configuration */
  mainCanvas?: LayoutCanvasConfig
  /** CoreBox canvas configuration */
  coreBoxCanvas?: CoreBoxCanvasConfig
}

export interface PresetCompat {
  minAppVersion?: string
  maxAppVersion?: string
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
  /** Release channel */
  channel?: 'stable' | 'beta'
  /** Compatibility window */
  compat?: PresetCompat
  /** Preset source */
  source?: 'local' | 'nexus'
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
  if (!preset.layout && !preset.coreBox && !preset.theme && !preset.mainCanvas && !preset.coreBoxCanvas) {
    warnings.push('Preset contains no configurable fields')
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
    if (!coreBox.preset || !coreBox.logo || !coreBox.input || !coreBox.results) {
      errors.push('Invalid CoreBox configuration structure')
    }
  }

  if (preset.theme) {
    const theme = preset.theme as Record<string, unknown>
    if (!theme.style && !theme.addon && !theme.transition && !theme.palette && !theme.window) {
      warnings.push('Theme preset is empty')
    }
  }

  if (preset.mainCanvas) {
    const mainCanvas = preset.mainCanvas as Record<string, unknown>
    if (
      typeof mainCanvas.columns !== 'number'
      || typeof mainCanvas.rowHeight !== 'number'
      || !Array.isArray(mainCanvas.items)
    ) {
      errors.push('Invalid mainCanvas configuration structure')
    }
  }

  if (preset.coreBoxCanvas) {
    const coreBoxCanvas = preset.coreBoxCanvas as Record<string, unknown>
    if (
      typeof coreBoxCanvas.columns !== 'number'
      || typeof coreBoxCanvas.rowHeight !== 'number'
      || !Array.isArray(coreBoxCanvas.items)
    ) {
      errors.push('Invalid coreBoxCanvas configuration structure')
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
  theme?: ThemePresetConfig
  mainCanvas?: LayoutCanvasConfig
  coreBoxCanvas?: CoreBoxCanvasConfig
  author?: PresetAuthor
  tags?: string[]
  channel?: 'stable' | 'beta'
  source?: 'local' | 'nexus'
  compat?: PresetCompat
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
      updatedAt: now,
      channel: options.channel ?? 'beta',
      source: options.source ?? 'local',
      compat: options.compat,
    },
    layout: options.layout,
    coreBox: options.coreBox,
    theme: options.theme,
    mainCanvas: options.mainCanvas,
    coreBoxCanvas: options.coreBoxCanvas,
  }
}
