/**
 * Typed Dependency Inversion ports for DP2 Permission module.
 *
 * Higher-layer domains (DP5 Plugin) bind concrete implementations here from the
 * composition root (`core/ports/register-dp2-ports.ts`) so DP2 Security never
 * runtime-imports DP3..DP8.
 *
 * Fail-closed invariants:
 * - Missing or throwing `resolvePluginDeclaredSdkApi` returns `undefined`, causing
 *   `channel-guard` to reject authoritative plugin requests with `SDKAPI_MISMATCH`.
 * - Missing `getPluginSdkHardCutGate` uses the pure stateless baseline contract;
 *   any throwing custom implementation fails closed (`blocked: true`).
 */

import type { PluginSdkHardCutGate } from '../../shared/plugin-sdk-hard-cut-gate'
import { getPluginSdkHardCutGate as defaultGetPluginSdkHardCutGate } from '../../shared/plugin-sdk-hard-cut-gate'

export type ResolvePluginDeclaredSdkApi = (
  pluginId: string
) => number | undefined | Promise<number | undefined>

export type TeardownPluginStorage = (pluginId: string) => void | Promise<void>

export type EvaluatePluginSdkHardCutGate = (
  pluginName: string,
  declaredSdkapi: unknown
) => PluginSdkHardCutGate

export interface PermissionPluginBridge {
  readonly resolvePluginDeclaredSdkApi?: ResolvePluginDeclaredSdkApi
  readonly teardownPluginStorage?: TeardownPluginStorage
  readonly getPluginSdkHardCutGate?: EvaluatePluginSdkHardCutGate
}

interface MutablePermissionPluginBridge {
  resolvePluginDeclaredSdkApi?: ResolvePluginDeclaredSdkApi
  teardownPluginStorage?: TeardownPluginStorage
  getPluginSdkHardCutGate?: EvaluatePluginSdkHardCutGate
}

const activeBridge: MutablePermissionPluginBridge = {}

/**
 * Register plugin runtime bridge callbacks for the Permission module.
 * Returns an idempotent disposer that clears only the bindings still owned by this registration.
 */
export function registerPermissionPluginBridge(bridge: PermissionPluginBridge): () => void {
  const registeredSdkResolver = bridge.resolvePluginDeclaredSdkApi
  const registeredTeardown = bridge.teardownPluginStorage
  const registeredSdkGate = bridge.getPluginSdkHardCutGate

  if (registeredSdkResolver !== undefined) {
    activeBridge.resolvePluginDeclaredSdkApi = registeredSdkResolver
  }
  if (registeredTeardown !== undefined) {
    activeBridge.teardownPluginStorage = registeredTeardown
  }
  if (registeredSdkGate !== undefined) {
    activeBridge.getPluginSdkHardCutGate = registeredSdkGate
  }

  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    if (
      registeredSdkResolver !== undefined &&
      activeBridge.resolvePluginDeclaredSdkApi === registeredSdkResolver
    ) {
      activeBridge.resolvePluginDeclaredSdkApi = undefined
    }
    if (
      registeredTeardown !== undefined &&
      activeBridge.teardownPluginStorage === registeredTeardown
    ) {
      activeBridge.teardownPluginStorage = undefined
    }
    if (
      registeredSdkGate !== undefined &&
      activeBridge.getPluginSdkHardCutGate === registeredSdkGate
    ) {
      activeBridge.getPluginSdkHardCutGate = undefined
    }
  }
}

export function resetPermissionPluginBridge(): void {
  activeBridge.resolvePluginDeclaredSdkApi = undefined
  activeBridge.teardownPluginStorage = undefined
  activeBridge.getPluginSdkHardCutGate = undefined
}

/**
 * Fail-closed authoritative plugin sdkapi lookup.
 * Returns `undefined` when unregistered, invalid, or throwing.
 */
export async function resolvePermissionPluginDeclaredSdkApi(
  pluginId: string
): Promise<number | undefined> {
  const resolver = activeBridge.resolvePluginDeclaredSdkApi
  if (!resolver) {
    return undefined
  }
  try {
    const sdkapi = await resolver(pluginId)
    return typeof sdkapi === 'number' ? sdkapi : undefined
  } catch {
    return undefined
  }
}

/**
 * Await plugin capability-owned storage/resource teardown during permission revocation.
 */
export async function teardownPermissionPluginStorage(pluginId: string): Promise<void> {
  await activeBridge.teardownPluginStorage?.(pluginId)
}

/**
 * Evaluate the plugin SDK hard-cut gate.
 * Uses the pure shared gate by default; any throwing custom bridge fails closed.
 */
export function evaluatePermissionPluginSdkHardCutGate(
  pluginName: string,
  declaredSdkapi: unknown
): PluginSdkHardCutGate {
  const gate = activeBridge.getPluginSdkHardCutGate ?? defaultGetPluginSdkHardCutGate
  try {
    return gate(pluginName, declaredSdkapi)
  } catch {
    return {
      blocked: true,
      reason: 'unsupported-sdkapi',
      message: `Plugin "${pluginName}" is blocked because SDK gate evaluation failed.`
    }
  }
}
