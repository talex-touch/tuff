import type { Ref } from 'vue'
import { getCurrentScope, nextTick, onScopeDispose, ref } from 'vue'

/** The part of Vite's `vite:afterUpdate` payload this reads. */
export interface HotUpdatePayload {
  updates: ReadonlyArray<{ type: string; path: string; acceptedPath: string }>
}

/** The slice of Vite's `import.meta.hot` this needs, so a test can fire the event itself. */
export interface HotUpdateEvents {
  on: (event: 'vite:afterUpdate', listener: (payload: HotUpdatePayload) => void) => void
  off?: (event: 'vite:afterUpdate', listener: (payload: HotUpdatePayload) => void) => void
}

/** The slice of the router this reads: each route's meta and, once loaded, its component. */
export interface KeepAliveRoutes {
  getRoutes: () => ReadonlyArray<{
    meta?: { keepAlive?: unknown }
    components?: Readonly<Record<string, unknown>> | null
  }>
}

/** The fields of a compiled SFC this reads; `__file` is only emitted in dev. */
interface SfcComponent {
  name?: string
  __name?: string
  __file?: string
}

/**
 * The files whose own module an update replaced.
 *
 * `path` is the boundary that accepted the update: a page's `.vue` file also stands for any `.ts`
 * module the page imports, so a change there covers the page too. A `?vue&type=style` sub-module is
 * swapped as CSS and leaves no stale instance behind, so it does not count.
 */
function updatedFiles(payload: HotUpdatePayload): string[] {
  const files = new Set<string>()
  for (const update of payload.updates ?? []) {
    if (update.type !== 'js-update') continue
    for (const url of [update.path, update.acceptedPath]) {
      if (!url || /[?&]type=style(?:&|$)/.test(url)) continue
      const [pathname = ''] = url.split('?')
      // Files outside the dev server root are served as `/@fs/<absolute path>`, on Windows
      // `/@fs/C:/…`.
      const file = pathname.startsWith('/@fs/') ? pathname.slice('/@fs'.length) : pathname
      files.add(file.replace(/^\/(?=[A-Z]:\/)/i, ''))
    }
  }
  return [...files]
}

/**
 * Dev only: after a hot update, drops a page KeepAlive holds off screen when its own component was
 * part of the update.
 *
 * Vue's HMR updates a live instance by re-rendering its parent. For a page that KeepAlive has
 * cached but is not showing, that parent is the KeepAlive, which only renders the current page —
 * so the cached instance keeps the code it was created with, while components mounted inside it
 * pick up the new code. On 2026-09-15 a cached settings page kept a pre-change `updatePrompt`
 * handler while its prompt editor already sent the new arguments, and every click between
 * capabilities wrote one capability's id into the next one's prompt.
 *
 * The keep-alive routes' components are matched to the updated files by the `__file` the SFC
 * compiler stamps on them in dev, and `exclude` is set to just their names for one render.
 * KeepAlive's own prune then unmounts those cached instances and never the one on screen, which
 * Vue hot-updates in place and which is cached again when `exclude` is cleared. Every other cached
 * page — Home mid-reply included — keeps its instance and state, since other sessions hot-update
 * code all the time. A dropped page is rebuilt from the new code when it is next opened.
 *
 * AppShell only calls this behind `import.meta.hot`, which production builds replace with
 * `undefined`, so none of it ships.
 *
 * @returns The value to bind to KeepAlive's `exclude`.
 */
export function useKeepAliveHmrPrune(
  hot: HotUpdateEvents,
  router: KeepAliveRoutes
): Ref<string[] | undefined> {
  const exclude = ref<string[] | undefined>()
  let pending = Promise.resolve()

  /** Names, as KeepAlive matches them, of the keep-alive route components defined in `files`. */
  function cachedComponentsDefinedIn(files: string[]): string[] {
    const names = new Set<string>()
    for (const record of router.getRoutes()) {
      if (!record.meta?.keepAlive) continue
      // A lazy route holds its loader until first visited; vue-router then stores the component.
      const component = record.components?.default as SfcComponent | undefined
      if (!component || typeof component !== 'object' || !component.__file) continue
      const file = component.__file.replace(/\\/g, '/')
      if (!files.some((updated) => file === updated || file.endsWith(updated))) continue
      const name = component.name || component.__name
      if (name) names.add(name)
    }
    return [...names]
  }

  async function pruneUpdatedPages(payload: HotUpdatePayload): Promise<void> {
    // Let Vue finish applying the update first, so the page on screen already runs the new code.
    await nextTick()
    const names = cachedComponentsDefinedIn(updatedFiles(payload))
    if (names.length === 0) return
    exclude.value = names
    try {
      // KeepAlive re-renders, then prunes in a post-flush watcher; both finish within this tick.
      await nextTick()
    } finally {
      exclude.value = undefined
    }
    // The re-render that caches the current page again, before another run can start.
    await nextTick()
  }

  function onAfterUpdate(payload: HotUpdatePayload): void {
    // One run at a time: an overlapping run could clear `exclude` before the other one pruned.
    pending = pending.then(() => pruneUpdatedPages(payload)).catch(() => undefined)
  }

  hot.on('vite:afterUpdate', onAfterUpdate)
  if (getCurrentScope()) {
    onScopeDispose(() => hot.off?.('vite:afterUpdate', onAfterUpdate))
  }

  return exclude
}
