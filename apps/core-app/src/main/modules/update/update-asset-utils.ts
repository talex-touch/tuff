/**
 * Release assets are resolved by exact name against the release manifest
 * (`update-system.ts` `resolveAssetByName` / `fetchReleaseManifest`), which returns null when no
 * manifest is present rather than falling back to guesswork.
 *
 * This module previously also carried filename-heuristic ranking -- calculateUpdateAssetScore,
 * getInstallerExtensionScore and six asset-classification predicates. That was the older,
 * manifest-less approach; nothing has called any of it since the manifest became mandatory, so
 * it was removed rather than left to read as live installer-selection policy (#529).
 */
export function normalizeUpdateAssetKey(filename: string): string {
  return filename.toLowerCase()
}
