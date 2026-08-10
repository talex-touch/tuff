/**
 * Scope for the Web Push service worker.
 *
 * Deliberately not `/`. A registration is keyed by (origin, scope), and the
 * @vite-pwa worker already owns `/` — re-registering on every page load, since
 * `registerType` is `autoUpdate`. Registering `notification-sw.js` with no scope
 * option put both scripts on the same key, so whichever ran last replaced the
 * other. The push subscription survived on the registration but was then served
 * by the generated `sw.js`, which has no `push` listener, and delivery stopped
 * with no error anywhere (#680).
 */
export const PUSH_SERVICE_WORKER_SCOPE = '/push/'

export const PUSH_SERVICE_WORKER_URL = '/notification-sw.js'

/**
 * Registers the push worker under its own scope.
 *
 * A scope narrower than the script's own path is always permitted, and push
 * delivery is not scope-limited, so `subscribe()` and `showNotification()` are
 * unaffected. Keeping a separate worker — rather than folding the push listener
 * into the PWA one — also means push still works when the PWA is disabled via
 * NUXT_DISABLE_PWA.
 */
export function registerPushServiceWorker(
  container: Pick<ServiceWorkerContainer, 'register'>,
): Promise<ServiceWorkerRegistration> {
  return container.register(PUSH_SERVICE_WORKER_URL, {
    scope: PUSH_SERVICE_WORKER_SCOPE,
  })
}
