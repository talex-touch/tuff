import { useAppSdk } from '@talex-touch/utils/renderer'
import { ref } from 'vue'

interface PackageJson {
  name: string
  version: string
  // Add other properties as needed
  [key: string]: any
}

interface OSInfo {
  platform: string
  arch: string
  release: string
  // Add other properties as needed
  [key: string]: any
}

interface CPUUsage {
  percent: number
}

interface MemoryUsage {
  rss: number
  heapTotal: number
  heapUsed: number
  external: number
  arrayBuffers: number
}

interface NodeProcess {
  getCPUUsage: () => CPUUsage
  memoryUsage: () => MemoryUsage
  platform: string
  arch: string
  // Add other process properties as needed
  [key: string]: any
}

declare global {
  interface Window {
    process: NodeProcess
  }
}

export function useEnv() {
  const appSdk = useAppSdk()
  const packageJson = ref<PackageJson | null>(null)
  const os = ref<OSInfo | null>(null)
  const processInfo = ref<NodeProcess>({ ...window.process })

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
  const value = ref<CPUUsage>(window.process.getCPUUsage())

  let cancel = false

  function running() {
    value.value = window.process.getCPUUsage()

    if (!cancel) setTimeout(running, 1000)
  }

  running()

  return [value, () => (cancel = true)]
}

export function useMemoryUsage() {
  const value = ref<MemoryUsage>(window.process.memoryUsage())

  let cancel = false

  function running() {
    value.value = window.process.memoryUsage()

    if (!cancel) setTimeout(running, 1000)
  }

  running()

  return [value, () => (cancel = true)]
}
