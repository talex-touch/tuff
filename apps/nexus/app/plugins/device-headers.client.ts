export default defineNuxtPlugin((nuxtApp) => {
  const { deviceId, deviceName, platform } = useDeviceIdentity()

  const fetchWithDevice = $fetch.create({
    onRequest({ options }) {
      if (!deviceId.value)
        return
      const headers = new Headers(options.headers || {})
      headers.set('x-device-id', deviceId.value)
      if (deviceName.value)
        headers.set('x-device-name', deviceName.value)
      if (platform.value)
        headers.set('x-device-platform', platform.value)
      options.headers = headers
    },
  })

  // Override default fetch so useFetch/$fetch inherit device headers
  nuxtApp.$fetch = fetchWithDevice
  globalThis.$fetch = fetchWithDevice
})
