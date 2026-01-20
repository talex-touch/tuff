export interface OpenerInfo {
  /**
   * Bundle identifier of the application responsible for handling the file type.
   */
  bundleId: string

  /**
   * Display name of the application.
   */
  name: string

  /**
   * Icon for the application (data URL or resolvable path).
   */
  logo: string

  /**
   * Absolute path of the application bundle/executable.
   */
  path?: string

  /**
   * ISO timestamp representing when this mapping was last refreshed.
   */
  lastResolvedAt?: string
}

export type OpenersMap = Record<string, OpenerInfo>
export type OpenersConfig = OpenersMap

const _openersOriginData: OpenersMap = {}

export const openersOriginData = Object.freeze(_openersOriginData)
