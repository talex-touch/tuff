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
  const packageJson = ref<PackageJson>(window.$nodeApi.getPackageJSON())
  const os = ref<OSInfo>(window.$nodeApi.getOS())
  const processInfo = ref<NodeProcess>({ ...window.process })

  return { packageJson, os, processInfo }
}

export function useCPUUsage() {
  const value = ref<CPUUsage>(window.process.getCPUUsage())

  let cancel = false

  function running() {
    value.value = window.process.getCPUUsage()

    if (!cancel)
      setTimeout(running, 1000)
  }

  running()

  return [value, () => (cancel = true)]
}

export function useMemoryUsage() {
  const value = ref<MemoryUsage>(window.process.memoryUsage())

  let cancel = false

  function running() {
    value.value = window.process.memoryUsage()

    if (!cancel)
      setTimeout(running, 1000)
  }

  running()

  return [value, () => (cancel = true)]
}
