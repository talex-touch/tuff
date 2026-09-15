export default defineNuxtPlugin((nuxtApp) => {
  const { deviceId, deviceName, platform } = useDeviceIdentity()
  const appOrigin = globalThis.location?.origin

  /**
   * Device headers describe *our* caller to *our* API. Sending them to a
   * third-party host both leaks the device identity and breaks the request:
   * `x-device-*` is not a CORS-safelisted header, so the host's preflight
   * rejects it (the map demos fetching external GeoJSON failed exactly this way).
   */
  const isSameOrigin = (url: string): boolean => {
    if (!appOrigin)
      return true
    try {
      return new URL(url, appOrigin).origin === appOrigin
    }
    catch {
      return false
    }
  }

  const fetchWithDevice = $fetch.create({
    onRequest({ request, options }) {
      if (!deviceId.value)
        return
      if (!isSameOrigin(typeof request === 'string' ? request : request instanceof URL ? request.href : request.url))
        return
      const headers = new Headers(options.headers || {})
      headers.set('x-device-id', deviceId.value)
      if (deviceName.value)
        headers.set('x-device-name', deviceName.value)
      if (platform.value)
        headers.set('x-device-platform', platform.value)
      headers.set('x-device-client', 'app')
      options.headers = headers
    },
  })

  // Override default fetch so useFetch/$fetch inherit device headers
  nuxtApp.$fetch = fetchWithDevice
  globalThis.$fetch = fetchWithDevice
})
