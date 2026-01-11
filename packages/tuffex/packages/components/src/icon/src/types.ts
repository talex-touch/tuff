import type { InjectionKey } from 'vue'

export type TxIconType = 'emoji' | 'url' | 'file' | 'class' | 'builtin'

export type TxIconStatus = 'normal' | 'loading' | 'error'

export interface TxIconSource {
  type: TxIconType
  value: string
  status?: TxIconStatus
  /** Icon colorful mode (only for URL/file type) */
  colorful?: boolean
  /** Error message (when status is error) */
  error?: string
}

/**
 * URL resolver function type
 * @param url - Original URL/path value
 * @param type - Icon type ('url' | 'file')
 * @returns Resolved URL string
 */
export type TxIconUrlResolver = (url: string, type: 'url' | 'file') => string

/**
 * SVG fetcher function type for custom fetch logic (e.g., with retry, transport)
 * @param url - Resolved URL to fetch
 * @returns Promise resolving to SVG content string
 */
export type TxIconSvgFetcher = (url: string) => Promise<string>

export interface TxIconConfig {
  /** Custom URL resolver (e.g., for tfile:// protocol) */
  urlResolver?: TxIconUrlResolver
  /** Custom SVG fetcher (e.g., with retry logic) */
  svgFetcher?: TxIconSvgFetcher
  /** Default file protocol prefix (e.g., 'tfile://') */
  fileProtocol?: string
}

export const TX_ICON_CONFIG_KEY: InjectionKey<TxIconConfig> = Symbol('tx-icon-config')
