import { ref } from 'vue'

/**
 * Every `TxToastHost` reads the same global queue, so two mounted hosts paint
 * every toast twice in the same corner — two stacked shadows, two close buttons
 * on top of each other. Docs pages hit this the moment two demos each mount
 * their own host.
 *
 * The first host to mount claims the render; later ones keep their (empty)
 * container so hydration still matches, and stand down until the owner leaves.
 * Claims are made from `onMounted`, which never runs on the server, so a shared
 * SSR module never accumulates tokens across requests.
 */
const claims = ref<symbol[]>([])

export function claimToastHost(token: symbol): boolean {
  if (!claims.value.includes(token))
    claims.value.push(token)
  return claims.value[0] === token
}

export function releaseToastHost(token: symbol): void {
  const index = claims.value.indexOf(token)
  if (index !== -1)
    claims.value.splice(index, 1)
}

export function ownsToastHost(token: symbol): boolean {
  return claims.value[0] === token
}

/** Test seam: drop every claim so one spec's host cannot silence the next one's. */
export function resetToastHostClaims(): void {
  claims.value.splice(0, claims.value.length)
}
