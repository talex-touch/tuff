import type { AuthState } from '@talex-touch/utils/renderer'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { AuthEvents } from '@talex-touch/utils/transport/events'

export async function isAuthenticated(): Promise<boolean> {
  const transport = useTuffTransport()
  const state = (await transport.send(AuthEvents.session.getState)) as AuthState
  return Boolean(state?.isSignedIn)
}

export async function handleUnauthorized(): Promise<void> {
  const transport = useTuffTransport()
  await transport.send(AuthEvents.session.logout)
}
