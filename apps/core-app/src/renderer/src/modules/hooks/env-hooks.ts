import { useAppSdk } from '@talex-touch/utils/renderer'
import { ref } from 'vue'
import { createRendererLogger } from '~/utils/renderer-log'
import { getPreloadProcessInfo } from '../preload/process-info'

const envLog = createRendererLogger('EnvHooks')

interface PackageJson {
  name: string
  version: string
  devDependencies?: Record<string, string>
  // Add other properties as needed
  [key: string]: unknown
}

interface OSInfo {
  platform: string
  arch: string
  release: string
  version?: string
  // Add other properties as needed
  [key: string]: unknown
}

interface RendererProcessInfo {
  platform: string
  arch: string
  versions?: Partial<NodeJS.ProcessVersions>
  [key: string]: unknown
}

function resolveProcessInfo(): RendererProcessInfo {
  const processInfo = getPreloadProcessInfo()
  return {
    platform: processInfo?.platform ?? 'unknown',
    arch: processInfo?.arch ?? 'unknown',
    versions: processInfo?.versions ?? {}
  }
}

export function useEnv() {
  const appSdk = useAppSdk()
  const packageJson = ref<PackageJson | null>(null)
  const os = ref<OSInfo | null>(null)
  const processInfo = ref<RendererProcessInfo>(resolveProcessInfo())

  void appSdk
    .getPackage()
    .then((pkg) => {
      packageJson.value = pkg as PackageJson
    })
    .catch((error) => {
      envLog.warn('Failed to load package info:', error)
    })

  void appSdk
    .getOS()
    .then((info) => {
      os.value = info as OSInfo
    })
    .catch((error) => {
      envLog.warn('Failed to load OS info:', error)
    })

  return { packageJson, os, processInfo }
}
