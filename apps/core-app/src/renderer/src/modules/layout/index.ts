/**
 * Layout Module
 *
 * The switchable-layout system (registry, dynamic loading, layout atoms, preset
 * import/export) was removed when the app collapsed to a single fixed shell. What remains
 * are the shell-adjacent capabilities that outlived it:
 * - Secondary navigation (back affordance)
 * - Wallpaper state and controls
 */

export { useSecondaryNavigation } from './useSecondaryNavigation'
export { useWallpaper } from './useWallpaper'
export * from './wallpaper-state'
