/**
 * Singleton holder for the permission module.
 *
 * Split out of index.ts so channel-guard.ts — the code that gates IPC channels — can reach the
 * getter without importing the barrel that re-exports channel-guard itself (#525). The barrel
 * still re-exports both functions, so callers outside this directory are unaffected.
 *
 * The `PermissionModule` import below is type-only and erased at compile time, so nothing here
 * puts index.ts back on the runtime graph.
 */
import type { PermissionModule } from './index'

let permissionModule: PermissionModule | null = null

export function getPermissionModule(): PermissionModule | null {
  return permissionModule
}

export function setPermissionModule(module: PermissionModule): void {
  permissionModule = module
}
