import { useAppSdk } from '@talex-touch/utils/renderer'
import { ref } from 'vue'
import { getPreloadProcessInfo } from '../preload/process-info'

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

type CPUUsage = Electron.CPUUsage
type MemoryUsage = NodeJS.MemoryUsage

interface RendererProcessInfo {
  platform: string
  arch: string
  versions?: Partial<NodeJS.ProcessVersions>
  [key: string]: unknown
}

const EMPTY_CPU_USAGE: CPUUsage = {
  percentCPUUsage: 0,
  idleWakeupsPerSecond: 0
}

const EMPTY_MEMORY_USAGE: MemoryUsage = {
  rss: 0,
  heapTotal: 0,
  heapUsed: 0,
  external: 0,
  arrayBuffers: 0
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
      console.warn('[useEnv] Failed to load package info:', error)
    })

  void appSdk
    .getOS()
    .then((info) => {
      os.value = info as OSInfo
    })
    .catch((error) => {
      console.warn('[useEnv] Failed to load OS info:', error)
    })

  return { packageJson, os, processInfo }
}

export function useCPUUsage() {
  const value = ref<CPUUsage>(EMPTY_CPU_USAGE)

  let cancel = false

  function running() {
    value.value = EMPTY_CPU_USAGE

    if (!cancel) setTimeout(running, 1000)
  }

  running()

  return [value, () => (cancel = true)]
}

export function useMemoryUsage() {
  const value = ref<MemoryUsage>(EMPTY_MEMORY_USAGE)

  let cancel = false

  function running() {
    value.value = EMPTY_MEMORY_USAGE

    if (!cancel) setTimeout(running, 1000)
  }

  running()

  return [value, () => (cancel = true)]
}
