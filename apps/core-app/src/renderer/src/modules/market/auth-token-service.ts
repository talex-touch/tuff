import type { AuthState } from '@talex-touch/utils'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { useTuffTransport } from '@talex-touch/utils/transport'

const authGetStateEvent = defineRawEvent<void, AuthState>('auth:get-state')
const authLogoutEvent = defineRawEvent<void, { success: boolean }>('auth:logout')

export async function isAuthenticated(): Promise<boolean> {
  const transport = useTuffTransport()
  const state = (await transport.send(authGetStateEvent)) as AuthState
  return Boolean(state?.isSignedIn)
}

export async function handleUnauthorized(): Promise<void> {
  const transport = useTuffTransport()
  await transport.send(authLogoutEvent)
}
