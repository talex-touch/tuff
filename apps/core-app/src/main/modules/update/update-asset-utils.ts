/**
 * Asset-name normalization for update resolution.
 *
 * This module used to also rank candidate installers — `calculateUpdateAssetScore` and seven
 * classification helpers. `3175ba33a` (feat(update): unify OTA lifecycle and release gates) moved
 * asset selection to the release manifest, which names each artifact by component, and removed
 * the only call to the scorer. The scoring table survived with no callers and no tests for three
 * months, long enough that anyone debugging "the updater downloaded the wrong artifact" would
 * have found it, adjusted its weights, and shipped a change that could not affect behaviour
 * (#529). Removed rather than left as a plausible-looking implementation.
 *
 * Selection now happens in update-system.ts: `resolveArtifact` picks by `component`, and
 * `resolveAssetByName` matches the manifest entry against the release asset through the key below.
 */

/**
 * Case-insensitive key for matching a manifest entry to a release asset.
 *
 * GitHub preserves the case an asset was uploaded with while manifests are written by hand, so
 * the two disagree often enough that every lookup in update-system.ts goes through this.
 */
export function normalizeUpdateAssetKey(filename: string): string {
  return filename.toLowerCase()
}
