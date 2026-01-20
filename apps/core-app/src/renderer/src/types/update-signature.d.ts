import '@talex-touch/utils'

declare module '@talex-touch/utils' {
  interface DownloadAsset {
    signatureUrl?: string
    signatureKeyUrl?: string
  }
}
