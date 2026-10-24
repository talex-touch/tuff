import type { ShallowRef } from 'vue'
import { shallowRef } from 'vue'

export interface LazyComponent<T> {
  /** The component, once it has loaded. */
  component: Readonly<ShallowRef<T | null>>
  /** Starts loading it, unless a load is under way or done. */
  load: () => void
}

/**
 * A component loaded the first time it is about to be needed, so the page carries neither it nor
 * its stylesheet until then. A load that fails calls `onFailed`, and the next `load` tries again.
 *
 * `importer` holds the `import()` itself, and it stays in the host's own file: the build adds the
 * component's stylesheet to the `import()` calls it finds there.
 */
export function useLazyComponent<T>(importer: () => Promise<T>, onFailed: () => void): LazyComponent<T> {
  const component = shallowRef<T | null>(null)
  let loading: Promise<void> | null = null

  function load(): void {
    loading ??= importer().then(
      (loaded) => {
        component.value = loaded
      },
      () => {
        loading = null
        onFailed()
      },
    )
  }

  return { component, load }
}
