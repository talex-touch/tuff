import { describe, expect, it, vi } from 'vitest'
import {
  PUSH_SERVICE_WORKER_SCOPE,
  PUSH_SERVICE_WORKER_URL,
  registerPushServiceWorker,
} from './push-service-worker'

/**
 * `/notification-sw.js` was registered with no scope option, so it claimed `/`.
 * The @vite-pwa worker also owns `/` and re-registers on every page load because
 * `registerType` is `autoUpdate`. A registration is keyed by (origin, scope), so
 * the two scripts overwrote each other — and once the generated `sw.js` won, the
 * surviving push subscription was served by a worker with no `push` listener,
 * killing delivery silently (#680).
 */

describe('push service worker registration', () => {
  it('registers under its own scope rather than the default', async () => {
    const register = vi.fn(async () => ({}) as ServiceWorkerRegistration)

    await registerPushServiceWorker({ register })

    expect(register).toHaveBeenCalledWith(PUSH_SERVICE_WORKER_URL, {
      scope: PUSH_SERVICE_WORKER_SCOPE,
    })
  })

  it('never claims the root scope the PWA worker owns', () => {
    // The whole defect is the collision on '/', so pin the value itself: a later
    // "simplification" back to '/' or to undefined would reintroduce it.
    expect(PUSH_SERVICE_WORKER_SCOPE).not.toBe('/')
    expect(PUSH_SERVICE_WORKER_SCOPE).toBeTruthy()
  })

  it('stays within the scope its own script path allows', () => {
    // A worker may only take a scope at or below its own directory unless the
    // server sends Service-Worker-Allowed. notification-sw.js sits at the root,
    // so anything starting with '/' is permitted — but it must still be a path,
    // not a cross-origin or relative value, or registration throws at runtime.
    expect(PUSH_SERVICE_WORKER_SCOPE.startsWith('/')).toBe(true)
    expect(PUSH_SERVICE_WORKER_URL).toBe('/notification-sw.js')
  })

  it('passes the registration back to the caller', async () => {
    const registration = { scope: PUSH_SERVICE_WORKER_SCOPE } as ServiceWorkerRegistration
    const register = vi.fn(async () => registration)

    await expect(registerPushServiceWorker({ register })).resolves.toBe(registration)
  })
})
