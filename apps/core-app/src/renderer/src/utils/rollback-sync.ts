/**
 * Runs an optimistic write's remote half and puts the local value back when it is refused.
 *
 * The agent-tools pill wrote the persisted flag and then called the main-process sync with `void`,
 * discarding both the result and any rejection. A failed sync left the pill reading `on` and
 * `aria-pressed="true"` across restarts while the tool gateway was shut (#835).
 *
 * Extracted rather than written inline in HomePage.vue, which has no mounting harness: the
 * rollback only runs on a path that is awkward to reach by hand, and an invariant nobody can
 * exercise is one that quietly stops holding.
 */
export interface RollbackSyncOptions<T> {
  /** The remote half of the write. Rejecting means the value did not take. */
  sync: (value: T) => Promise<unknown>
  /**
   * Restores the value observed before the write.
   *
   * Takes the previous value rather than negating the new one, and runs only when this attempt is
   * still the newest — otherwise a slow failing write would clobber the state a later successful
   * one had already established.
   */
  rollback: (previous: T) => void
  /** Always called on failure, including a superseded one: the failure still happened. */
  onError: (error: unknown) => void
}

export function createRollbackSync<T>(
  options: RollbackSyncOptions<T>
): (value: T, previous: T) => Promise<void> {
  let latest = 0

  return async (value, previous) => {
    const token = ++latest
    try {
      await options.sync(value)
    } catch (error) {
      options.onError(error)
      if (token !== latest) return
      options.rollback(previous)
    }
  }
}
