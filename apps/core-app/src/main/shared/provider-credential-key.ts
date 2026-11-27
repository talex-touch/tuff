import { createHash } from 'node:crypto'

export const PROVIDER_CREDENTIAL_SECURE_STORE_PURPOSE = 'intelligence-provider-credential'

export function providerCredentialSecureStoreKey(providerId: string): string {
  const digest = createHash('sha256').update(providerId, 'utf8').digest('hex').slice(0, 40)
  return `provider.${digest}.api-key`
}
