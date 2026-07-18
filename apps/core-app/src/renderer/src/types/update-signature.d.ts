import '@talex-touch/utils'

declare module '@talex-touch/utils' {
  interface DownloadAsset {
    signatureUrl?: string
    component?: import('@talex-touch/utils').UpdateArtifactComponent
    coreRange?: string
  }
}
