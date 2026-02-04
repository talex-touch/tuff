import { computed } from 'vue'

const DEVICE_ID_KEY = 'tuff_device_id'
const DEVICE_NAME_KEY = 'tuff_device_name'

function resolvePlatform(): string {
  if (import.meta.server)
    return 'web'
  const navigatorAny = navigator as Navigator & { userAgentData?: { platform?: string } }
  return navigatorAny.userAgentData?.platform
    || navigator.platform
    || 'web'
}

function resolveDefaultDeviceName(platform: string): string {
  return `Web-${platform || 'Browser'}`
}

export function useDeviceIdentity() {
  const deviceId = useState<string | null>('device-id', () => null)
  const deviceName = useState<string | null>('device-name', () => null)
  const platformState = useState<string>('device-platform', () => resolvePlatform())

  if (import.meta.client) {
    if (!deviceId.value) {
      const storedId = window.localStorage.getItem(DEVICE_ID_KEY)
      deviceId.value = storedId || crypto.randomUUID()
      window.localStorage.setItem(DEVICE_ID_KEY, deviceId.value)
    }

    if (!deviceName.value) {
      const storedName = window.localStorage.getItem(DEVICE_NAME_KEY)
      deviceName.value = storedName || resolveDefaultDeviceName(platformState.value)
      window.localStorage.setItem(DEVICE_NAME_KEY, deviceName.value)
    }
  }

  const setDeviceName = (name: string) => {
    deviceName.value = name
    if (import.meta.client)
      window.localStorage.setItem(DEVICE_NAME_KEY, name)
  }

  return {
    deviceId: computed(() => deviceId.value),
    deviceName: computed(() => deviceName.value),
    platform: computed(() => platformState.value),
    setDeviceName,
  }
}
