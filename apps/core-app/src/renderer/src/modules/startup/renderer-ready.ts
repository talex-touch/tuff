import { AppEvents } from '@talex-touch/utils/transport/events'

/**
 * The narrow slice of the renderer transport this announcement needs.
 *
 * Declared instead of `Pick<ITuffTransport, 'send'>` so a test can pass a one-method fake
 * without reproducing the transport's overload set.
 */
export interface RendererReadyChannel {
  send(event: typeof AppEvents.window.rendererReady): Promise<unknown>
}

const RENDERER_READY_RETRY_DELAYS_MS = [250, 1_000, 3_000] as const

function scheduleRendererReadyRetry(channel: RendererReadyChannel, retryIndex: number): void {
  const delay = RENDERER_READY_RETRY_DELAYS_MS[retryIndex]
  if (delay === undefined) return
  setTimeout(() => sendRendererReady(channel, retryIndex + 1), delay)
}

function sendRendererReady(channel: RendererReadyChannel, retryIndex: number): void {
  try {
    void channel
      .send(AppEvents.window.rendererReady)
      .catch(() => scheduleRendererReadyRetry(channel, retryIndex))
  } catch {
    scheduleRendererReadyRetry(channel, retryIndex)
  }
}

/**
 * Tells main that this renderer is ready to receive destination routes.
 *
 * Main must not treat the preload `AppEvents.system.startup` invoke as readiness: that runs
 * while the renderer is still collecting boot metadata, before the router exists, so a route
 * delivered on it would land in a page with no `AppEvents.window.navigate` listener. This is
 * sent only after that listener (and the download-center listener) is registered. A wrong
 * window announcing is harmless — main keeps only the primary renderer's sender id.
 */
export function announceRendererReady(channel: RendererReadyChannel): void {
  // Renderer boot has no transport-recovery callback. Retry a small bounded sequence so a
  // transient channel attach race cannot strand queued destinations until the next reload.
  sendRendererReady(channel, 0)
}

/**
 * The readiness announcement, held back until the router has finished its initial navigation.
 *
 * Registering the navigate listener early is not enough to make a destination deliverable:
 * `app.use(router)` performs the initial navigation, which would replace a route pushed into
 * the freshly installed router before the page had settled. Waiting for `isReady()` puts the
 * announcement after the router installed the app, the root mounted and the first navigation
 * resolved — so the route main is about to send is the one the user sees.
 *
 * A rejected `isReady()` rejects here and nothing is sent: a renderer whose initial navigation
 * never resolved cannot honour a destination route, and claiming readiness would consume the
 * queued route into a page that never rendered.
 */
export async function announceRendererReadyAfterRouter(
  channel: RendererReadyChannel,
  router: { isReady(): Promise<unknown> }
): Promise<void> {
  await router.isReady()
  announceRendererReady(channel)
}
