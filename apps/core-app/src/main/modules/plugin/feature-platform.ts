/**
 * Manifest-declared platform availability for a plugin feature (#820).
 *
 * Every shipped manifest writes `feature.platform` as `{ win32, darwin, linux }` booleans —
 * all 20 of them — and until now nothing read it. Five features declared themselves
 * unavailable on Linux (one also on macOS) and registered there anyway; they only avoided
 * misbehaving because each prelude re-checks `process.platform` itself, so the user saw the
 * feature, triggered it, and was told it was unsupported.
 *
 * `plugins:validate` already rejects any other shape, including the `IPlatform`
 * `{ win: { enable, arch, os } }` form that `addFeature` uses for *runtime*-registered
 * features. That check is what makes reading a plain boolean here safe.
 */

/** The manifest shape, which is not `IPlatform` — see the module comment. */
export interface ManifestFeaturePlatform {
  win32?: unknown
  darwin?: unknown
  linux?: unknown
}

/**
 * Whether the manifest says this feature does not belong on `platform`.
 *
 * Only an explicit `false` excludes, and that single rule covers three cases at once:
 *
 * - **no `platform` at all** — available everywhere. 25 of the 30 shipped features declare
 *   nothing, so requiring a declaration would empty the launcher.
 * - **a platform the object does not mention** — one the author did not consider, not one
 *   they ruled out. `undefined === false` is already false, so no separate check earns its
 *   keep here; a guard a test could only verify by grep is worse than none.
 * - **a falsy-but-not-false value** (`0`, `''`, `null`) — not a declaration of anything.
 */
export function isFeatureUnavailableOnPlatform(
  feature: { platform?: unknown } | null | undefined,
  platform: NodeJS.Platform
): boolean {
  const declared = feature?.platform
  if (!declared || typeof declared !== 'object' || Array.isArray(declared)) return false

  return (declared as Record<string, unknown>)[platform] === false
}
