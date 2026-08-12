/**
 * The isolated plugin runtime is installed unconditionally.
 *
 * This module used to export a frozen 22-name "runtime compatible" allowlist that nothing in
 * production read — the runtime was installed for every plugin regardless. Anyone adding a
 * plugin hit the rollout test's length assertion, added their name to the allowlist to make it
 * pass, and reasonably concluded they had opted the plugin in; in fact the runtime had been
 * active for it all along (#536).
 *
 * The inventory now lives in plugin-runtime-rollout.test.ts, which is the only thing that ever
 * used it — it scans those preludes for privileged APIs. Adding a name there reads as what it
 * is: updating a test's inventory, not flipping a runtime switch.
 *
 * If a real gate is wanted, it belongs here and must be consulted below — that is a behaviour
 * change (plugins off the list would lose the runtime) rather than the cleanup this was.
 */
const PLUGIN_RUNTIME_DEFAULT_ENABLED = true

export function shouldInstallPluginRuntimeServiceByDefault(): boolean {
  return PLUGIN_RUNTIME_DEFAULT_ENABLED
}
