/**
 * Counts the times this tab's signed-in account changed: a sign-in, a sign-out, a switch to another
 * account. Whatever is cached for "the current account" records the generation it was fetched in and
 * is used only while that generation lasts, so one account's profile is never handed to the next.
 * `useNexusAuth` reports every session it settles on; the first report counts as a change too, since
 * nothing fetched before it can be tied to an account.
 */
let lastIdentity: string | null | undefined
let generation = 0

export function noteSessionIdentity(identity: string | null): void {
  if (identity === lastIdentity)
    return
  lastIdentity = identity
  generation += 1
}

export function sessionGeneration(): number {
  return generation
}
