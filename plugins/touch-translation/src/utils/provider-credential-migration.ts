export type ProviderSecretFields = Readonly<Record<string, readonly string[]>>

/** Legacy plaintext credentials the vault does not hold yet, as providerId -> field -> value. */
export type PendingLegacyCredentials = Record<string, Record<string, string>>

export interface LegacyCredentialVault {
  get: (key: string) => Promise<string | null>
  setMany: (entries: Array<{ key: string, value: string | null }>) => Promise<{ success: boolean }>
}

export interface LegacyCredentialMigrationOptions {
  saved: Record<string, any>
  fields: ProviderSecretFields
  secretKey: (providerId: string, field: string) => string
  vault: LegacyCredentialVault
  persistConfig: (config: Record<string, any>) => Promise<unknown>
}

interface LegacyCredential {
  providerId: string
  field: string
  value: string
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toPending(credentials: LegacyCredential[]): PendingLegacyCredentials {
  const pending: PendingLegacyCredentials = {}
  for (const { providerId, field, value } of credentials) {
    pending[providerId] = { ...pending[providerId], [field]: value }
  }
  return pending
}

/** Moves legacy plaintext credentials into the vault and resolves to the ones it could not take. */
export async function migrateLegacyProviderCredentials(
  options: LegacyCredentialMigrationOptions,
): Promise<PendingLegacyCredentials> {
  const { saved, fields, secretKey, vault, persistConfig } = options
  const sanitized: Record<string, any> = { ...saved }
  const legacy: LegacyCredential[] = []
  let dirty = false

  for (const [providerId, secretFields] of Object.entries(fields)) {
    const section = saved[providerId]
    if (!isRecord(section) || !isRecord(section.config))
      continue
    const present = secretFields.filter(field => Object.hasOwn(section.config, field))
    if (present.length === 0)
      continue
    dirty = true
    const config = { ...section.config }
    for (const field of present) {
      const value = section.config[field]
      delete config[field]
      if (typeof value === 'string' && value.trim())
        legacy.push({ providerId, field, value })
    }
    sanitized[providerId] = { ...section, config }
  }

  if (!dirty)
    return {}

  // Vault first: the file is rewritten only once every credential is safe, so a failure never loses the only copy.
  try {
    const writes: Array<{ key: string, value: string }> = []
    for (const { providerId, field, value } of legacy) {
      const key = secretKey(providerId, field)
      const stored = await vault.get(key)
      if (!stored || !stored.trim())
        writes.push({ key, value })
    }
    if (writes.length > 0 && !(await vault.setMany(writes)).success)
      return toPending(legacy)
  }
  catch {
    return toPending(legacy)
  }

  // A failed rewrite is harmless: the vault is authoritative, so the next load finishes the cleanup.
  try {
    await persistConfig(sanitized)
  }
  catch {}
  return {}
}
