import { resetZIndex } from '@talex-touch/tuffex/utils'

/**
 * The tuffex z-index allocator keeps its counter in module scope. In a Node SSR
 * process that module is instantiated once and shared by every request, so an
 * overlay rendered for one request moves the counter for every later one — the
 * server then emits a z-index the freshly loaded client module never computes,
 * and the style attribute mismatches on hydration.
 *
 * Resetting at the start of each request restores the "fresh module" state the
 * client always starts from. Extracted from the Nitro plugin so it can be tested
 * without booting a server.
 */
export function resetZIndexForRequest(): void {
  resetZIndex(undefined, 'ssr request')
}
