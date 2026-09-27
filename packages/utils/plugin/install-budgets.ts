/**
 * Deadline budgets for one plugin install.
 *
 * Three budgets sit on the install path and only two of them are machine work:
 *
 * - the package download, sized from the registry's advertised package size;
 * - the permission prompt, which is the *user's* latency (bounded by the renderer's auto-deny);
 * - unpacking, signature verification and registration of the downloaded package.
 *
 * The renderer only hears back once the main process has finished every stage (the
 * `plugin:install-source` call spans the download, the prompt and the install). Its transport
 * deadline therefore has to outlast the *sum* of these budgets. It used to be a flat 3 minutes,
 * which fired while the user was still reading the permission card — after the 14 MB download had
 * already succeeded — and reported "install failed" for an install that was still running.
 */

/** Kept for small packages: a fixed 30s survives links faster than ~0.5 MB/s. */
export const INSTALL_DOWNLOAD_TIMEOUT_FLOOR_MS = 30_000
/** A stalled transfer still has to give up. */
export const INSTALL_DOWNLOAD_TIMEOUT_CEILING_MS = 10 * 60_000
/** Pessimistic floor the download deadline is scaled at; real links are usually far faster. */
export const INSTALL_DOWNLOAD_MIN_THROUGHPUT_BYTES_PER_SECOND = 50 * 1024

/**
 * Budget for one install confirmation.
 *
 * The renderer auto-denies its permission card after this long
 * (`PERMISSION_REQUEST_TIMEOUT_MS`), so the main process's wait for the user is bounded by it.
 */
export const INSTALL_CONFIRM_BUDGET_MS = 120_000

/** Unpack, signature verification and registration of an already-downloaded package. */
export const INSTALL_UNPACK_BUDGET_MS = 60_000

/**
 * Deadline for one package download.
 *
 * The timeout is a deadline for the *whole* body, so a fixed 30s only survives links faster than
 * ~0.5 MB/s: a 14 MB package then dies mid-download with `NETWORK_TIMEOUT` on an ordinary
 * connection. Scale by the registry's advertised size at a deliberately pessimistic throughput,
 * keep the 30s floor for small packages, and cap it so a stalled transfer still gives up.
 */
export function resolvePackageDownloadTimeout(packageSize?: number): number {
  if (typeof packageSize !== 'number' || !Number.isFinite(packageSize) || packageSize <= 0) {
    return INSTALL_DOWNLOAD_TIMEOUT_FLOOR_MS
  }
  const scaled = Math.ceil(
    (packageSize / INSTALL_DOWNLOAD_MIN_THROUGHPUT_BYTES_PER_SECOND) * 1000
  )
  return Math.min(
    Math.max(scaled, INSTALL_DOWNLOAD_TIMEOUT_FLOOR_MS),
    INSTALL_DOWNLOAD_TIMEOUT_CEILING_MS
  )
}

/**
 * Deadline for the `plugin:install-source` transport call.
 *
 * Sum of the slowest download the main process can still be working on, the confirmation budget and
 * the post-download work. It may only fire when the main process stopped answering: every stage
 * inside it enforces its own tighter deadline, and a user who takes longer than the permission
 * card's budget is rejected by that card, not by this wall.
 */
export const INSTALL_TRANSPORT_TIMEOUT_MS =
  INSTALL_DOWNLOAD_TIMEOUT_CEILING_MS + INSTALL_CONFIRM_BUDGET_MS + INSTALL_UNPACK_BUDGET_MS
