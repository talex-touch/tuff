export type EverythingInstallArchitecture = 'x64' | 'x86' | 'ARM64'
export type EverythingInstallAssetType = 'everything' | 'sdk' | 'cli'

export interface EverythingInstallResource {
  type: EverythingInstallAssetType
  filename: string
  url: string
  sha256: string
}

export declare const EVERYTHING_INSTALL_RESOURCES: Readonly<
  Record<
    EverythingInstallArchitecture,
    readonly Readonly<EverythingInstallResource>[]
  >
>

export declare function resolveEverythingInstallArchitecture(
  environment?: Record<string, string | undefined>,
): EverythingInstallArchitecture

export declare function getEverythingInstallResources(
  architecture?: EverythingInstallArchitecture,
): EverythingInstallResource[]
