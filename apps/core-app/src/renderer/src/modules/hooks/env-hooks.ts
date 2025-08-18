import { reactive } from 'vue'

export function useEnv(): {
  packageJson: Object
  os: Object
  process: Object
} {
  const env = reactive({
    packageJson: window.$nodeApi.getPackageJSON(),
    os: window.$nodeApi.getOS(),
    // @ts-ignore
    process: { ...window.process }
  })

  return env
}

export function useCPUUsage() {
  // @ts-ignore
  const value = ref(process.getCPUUsage())

  let cancel = false

  function running() {
    // @ts-ignore
    value.value = process.getCPUUsage()

    if (!cancel) setTimeout(running, 1000)
  }

  running()

  return [value, () => (cancel = true)]
}

export function useMemoryUsage() {
  const value = ref()

  let cancel = false

  function running() {
    // @ts-ignore
    value.value = process.memoryUsage()

    if (!cancel) setTimeout(running, 1000)
  }

  running()

  return [value, () => (cancel = true)]
}
