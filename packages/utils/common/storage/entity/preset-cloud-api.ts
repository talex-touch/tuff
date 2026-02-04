import type { CloudPresetItem, CloudPresetListResponse, CloudPresetPublishRequest, PresetExportData } from './preset-export-types'

/**
 * Cloud preset API endpoints (for future implementation)
 */
export const PRESET_CLOUD_API = {
  /** Base URL for preset cloud service */
  baseUrl: 'https://api.talextouch.com/v1/presets',

  /** List public presets */
  list: '/list',

  /** Get single preset by ID */
  get: (id: string) => `/${id}`,

  /** Publish a preset */
  publish: '/publish',

  /** Like a preset */
  like: (id: string) => `/${id}/like`,

  /** Download a preset */
  download: (id: string) => `/${id}/download`,

  /** Delete a preset (owner only) */
  delete: (id: string) => `/${id}`,

  /** Update a preset (owner only) */
  update: (id: string) => `/${id}`,

  /** Get user's own presets */
  myPresets: '/my'
} as const

/**
 * Cloud preset service interface (for future implementation)
 */
export interface IPresetCloudService {
  /** List public presets with pagination */
  listPresets(options?: {
    page?: number
    pageSize?: number
    sort?: 'popular' | 'recent' | 'likes'
    tags?: string[]
    search?: string
  }): Promise<CloudPresetListResponse>

  /** Get single preset by ID */
  getPreset(id: string): Promise<PresetExportData | null>

  /** Publish a preset to the cloud */
  publishPreset(request: CloudPresetPublishRequest): Promise<CloudPresetItem>

  /** Like a preset */
  likePreset(id: string): Promise<{ liked: boolean; likes: number }>

  /** Download a preset (increments download count) */
  downloadPreset(id: string): Promise<PresetExportData>

  /** Delete a preset (owner only) */
  deletePreset(id: string): Promise<boolean>

  /** Update a preset (owner only) */
  updatePreset(id: string, preset: PresetExportData): Promise<CloudPresetItem>

  /** Get user's own presets */
  getMyPresets(): Promise<CloudPresetItem[]>
}

/**
 * Cloud service status
 */
export interface PresetCloudStatus {
  /** Whether cloud service is available */
  available: boolean
  /** Error message if unavailable */
  error?: string
  /** User authentication status */
  authenticated: boolean
}

/**
 * Placeholder cloud service (returns unavailable)
 * Will be replaced with actual implementation when cloud service is ready
 */
export class PresetCloudServicePlaceholder implements IPresetCloudService {
  private readonly notAvailableError = new Error('Cloud preset service is not yet available')

  async listPresets(): Promise<CloudPresetListResponse> {
    throw this.notAvailableError
  }

  async getPreset(): Promise<PresetExportData | null> {
    throw this.notAvailableError
  }

  async publishPreset(): Promise<CloudPresetItem> {
    throw this.notAvailableError
  }

  async likePreset(): Promise<{ liked: boolean; likes: number }> {
    throw this.notAvailableError
  }

  async downloadPreset(): Promise<PresetExportData> {
    throw this.notAvailableError
  }

  async deletePreset(): Promise<boolean> {
    throw this.notAvailableError
  }

  async updatePreset(): Promise<CloudPresetItem> {
    throw this.notAvailableError
  }

  async getMyPresets(): Promise<CloudPresetItem[]> {
    throw this.notAvailableError
  }

  /** Check if cloud service is available */
  getStatus(): PresetCloudStatus {
    return {
      available: false,
      error: 'Cloud preset service is coming soon',
      authenticated: false
    }
  }
}

/** Singleton placeholder instance */
export const presetCloudService = new PresetCloudServicePlaceholder()
