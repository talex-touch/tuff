/**
 * Metadata extracted from a .tpex package file
 */
export interface TpexMetadata {
  readmeMarkdown?: string | null
  manifest?: Record<string, unknown> | null
}

/**
 * Result of package preview operation
 */
export interface TpexPackagePreviewResult {
  manifest: Record<string, unknown> | null
  readmeMarkdown: string | null
}

/**
 * Extracted manifest fields from tpex package
 */
export interface TpexExtractedManifest {
  id?: string
  name?: string
  description?: string
  version?: string
  homepage?: string
  changelog?: string
  channel?: string
  category?: string
  icon?: {
    type?: string
    value?: string
  }
  [key: string]: unknown
}
