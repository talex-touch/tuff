/**
 * The `reason` strings a plugin may return alongside `{ status: 'blocked' }` (#1711).
 *
 * Measured across `plugins/` before this file existed: 34 distinct reason literals, of which 14
 * appear in two or more plugins and 20 belong to exactly one. `permission-denied` alone is written
 * out in 12 plugins. So the set is **open**, not closed — the 20 single-plugin reasons describe
 * things only that plugin can fail at (`workspace-script-failed`, `invalid-flow-action`,
 * `archived-session-continuation`), and forcing them into a union here would be a worse contract
 * than no contract.
 *
 * What is defined here is the shared half: a reason that two or more plugins already emit means the
 * same thing in each, and a renderer that wants to distinguish "you have not granted this" from
 * "that action was malformed" has to match on it. Those are the ones worth owning.
 *
 * ## This is a vocabulary, not an import target
 *
 * Plugin Preludes take everything from `globalThis` — `const { plugin, clipboard, http, logger } =
 * globalThis` — and none of the 24 `index.js` files contains a single `import` or `require`. So the
 * plugins cannot import this, and #1711's second acceptance criterion is not reachable by adding a
 * constant. `scripts/check-plugin-blocked-reasons.mjs` supplies the property that the import would
 * have: a permission-family literal that is not in this set fails the build.
 *
 * Everything that *can* import it — `packages/test`, `apps/core-app` — should, so that a rename
 * breaks compilation rather than an assertion.
 */
export const PLUGIN_BLOCKED_REASONS = {
  /** The user has this permission and refused, or the grant was revoked. 12 plugins. */
  PERMISSION_DENIED: 'permission-denied',
  /** The permission exists but cannot be evaluated right now. 3 plugins. */
  PERMISSION_UNAVAILABLE: 'permission-unavailable',
  /** The host did not inject a permission SDK at all. 3 plugins. */
  PERMISSION_SDK_UNAVAILABLE: 'permission-sdk-unavailable',
  /** The permission check itself threw. 3 plugins. */
  PERMISSION_CHECK_FAILED: 'permission-check-failed',
  /**
   * The host cannot perform the action, independent of permission.
   *
   * Shared with `ContextActionUnavailableCode` in `../core-box/context-actions` deliberately, which
   * #1711 asked to make explicit rather than leave as a coincidence: both mean "the capability is
   * not present", one for a context action and one for a plugin action. Same word, same meaning,
   * now one definition. If they ever diverge, this comment is where to say so.
   */
  CAPABILITY_UNAVAILABLE: 'capability-unavailable',
  /**
   * `network.internet` specifically was not granted. 1 plugin.
   *
   * The only single-plugin reason in this file, and it is here because it is a permission claim:
   * the family below is enforced as closed, so a reason that says "permission" and is missing from
   * it reads as a typo. The blocked shape is `{ status, reason }` with nowhere to name *which*
   * permission, which is why this exists as its own string rather than as `permission-denied`.
   */
  NETWORK_INTERNET_PERMISSION_REQUIRED: 'network-internet-permission-required',
  /** No clipboard bridge. 4 plugins. */
  CLIPBOARD_UNAVAILABLE: 'clipboard-unavailable',
  /** The clipboard bridge was there and the write failed. 2 plugins. */
  CLIPBOARD_WRITE_FAILED: 'clipboard-write-failed',
  /** No URL opener. 2 plugins. */
  OPEN_URL_UNAVAILABLE: 'open-url-unavailable',
  /** The action id is not one this plugin serves. 3 plugins. */
  INVALID_ACTION: 'invalid-action',
  /** The action was valid and did not complete. 2 plugins. */
  ACTION_FAILED: 'action-failed',
  /** The user dismissed a confirmation. 3 plugins. */
  CANCELLED: 'cancelled',
  /** The action exceeded its own deadline. 3 plugins. */
  TIMEOUT: 'timeout',
  /** A newer request superseded this one before it resolved. 2 plugins. */
  STALE_REQUEST: 'stale-request',
  /** A capability token aged out. 2 plugins. */
  TOKEN_EXPIRED: 'token-expired',
} as const

export type PluginBlockedReason =
  (typeof PLUGIN_BLOCKED_REASONS)[keyof typeof PLUGIN_BLOCKED_REASONS]

const SHARED_REASONS: ReadonlySet<string> = new Set(Object.values(PLUGIN_BLOCKED_REASONS))

/**
 * The subset the guard enforces.
 *
 * Only the permission family is closed. A plugin inventing `workspace-script-failed` is describing
 * its own domain and nobody else needs to agree; a plugin inventing `permission_denied` or
 * `permissions-denied` is claiming to speak a shared language and getting it wrong, which is the
 * failure #1711 is about — silent on both sides, since a reason nobody handles looks exactly like a
 * handler for a reason nobody emits.
 */
export const PLUGIN_PERMISSION_BLOCKED_REASONS: readonly PluginBlockedReason[] = [
  PLUGIN_BLOCKED_REASONS.PERMISSION_DENIED,
  PLUGIN_BLOCKED_REASONS.PERMISSION_UNAVAILABLE,
  PLUGIN_BLOCKED_REASONS.PERMISSION_SDK_UNAVAILABLE,
  PLUGIN_BLOCKED_REASONS.PERMISSION_CHECK_FAILED,
  PLUGIN_BLOCKED_REASONS.CAPABILITY_UNAVAILABLE,
  PLUGIN_BLOCKED_REASONS.NETWORK_INTERNET_PERMISSION_REQUIRED,
]

/** Whether `reason` is one of the shared vocabulary rather than a plugin-private string. */
export function isSharedPluginBlockedReason(
  reason: string,
): reason is PluginBlockedReason {
  return SHARED_REASONS.has(reason)
}
