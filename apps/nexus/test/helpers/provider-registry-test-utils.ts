export interface ProviderRow {
  id: string
  name: string
  display_name: string
  vendor: string
  status: string
  auth_type: string
  auth_ref: string | null
  owner_scope: string
  owner_id: string | null
  description: string | null
  endpoint: string | null
  region: string | null
  metadata: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface CapabilityRow {
  id: string
  provider_id: string
  capability: string
  schema_ref: string | null
  metering: string | null
  constraints_json: string | null
  metadata: string | null
  created_at: string
  updated_at: string
}

export interface CredentialRow {
  auth_ref: string
  purpose: string
  encrypted_value: string
  created_by: string
  created_at: string
  updated_at: string
}

export interface IntelligenceProviderRow {
  id: string
  user_id: string
  type: string
  name: string
  enabled: number
  api_key_encrypted: string | null
  base_url: string | null
  models: string | null
  default_model: string | null
  instructions: string | null
  timeout: number
  priority: number
  rate_limit: string | null
  capabilities: string | null
  metadata: string | null
  created_at: string
  updated_at: string
}

class MockStatement {
  private args: any[] = []

  constructor(
    private readonly db: MockD1Database,
    private readonly sql: string,
  ) {}

  bind(...args: any[]) {
    this.args = args
    return this
  }

  async run() {
    return this.db.run(this.sql, this.args)
  }

  async first<T = any>() {
    return this.db.first(this.sql, this.args) as T
  }

  async all<T = any>() {
    return { results: this.db.all(this.sql, this.args) as T[] }
  }
}

export class MockD1Database {
  providers = new Map<string, ProviderRow>()
  capabilities = new Map<string, CapabilityRow>()
  credentials = new Map<string, CredentialRow>()
  intelligenceProviders = new Map<string, IntelligenceProviderRow>()

  prepare(sql: string) {
    return new MockStatement(this, sql)
  }

  seedIntelligenceProvider(row: IntelligenceProviderRow) {
    this.intelligenceProviders.set(row.id, row)
  }

  run(sql: string, args: any[]) {
    if (sql.includes('CREATE TABLE') || sql.includes('CREATE INDEX')) {
      return { meta: { changes: 0 } }
    }

    if (sql.includes('INSERT INTO provider_registry')) {
      const [
        id,
        name,
        displayName,
        vendor,
        status,
        authType,
        authRef,
        ownerScope,
        ownerId,
        description,
        endpoint,
        region,
        metadata,
        createdBy,
        createdAt,
        updatedAt,
      ] = args
      this.providers.set(String(id), {
        id: String(id),
        name: String(name),
        display_name: String(displayName),
        vendor: String(vendor),
        status: String(status),
        auth_type: String(authType),
        auth_ref: authRef == null ? null : String(authRef),
        owner_scope: String(ownerScope),
        owner_id: ownerId == null ? null : String(ownerId),
        description: description == null ? null : String(description),
        endpoint: endpoint == null ? null : String(endpoint),
        region: region == null ? null : String(region),
        metadata: metadata == null ? null : String(metadata),
        created_by: String(createdBy),
        created_at: String(createdAt),
        updated_at: String(updatedAt),
      })
      return { meta: { changes: 1 } }
    }

    if (sql.includes('INSERT INTO provider_capabilities')) {
      const [id, providerId, capability, schemaRef, metering, constraintsJson, metadata, createdAt, updatedAt] = args
      const duplicated = [...this.capabilities.values()].some(row =>
        row.provider_id === String(providerId) && row.capability === String(capability),
      )
      if (duplicated) {
        throw new Error('UNIQUE constraint failed: provider_capabilities.provider_id, provider_capabilities.capability')
      }
      this.capabilities.set(String(id), {
        id: String(id),
        provider_id: String(providerId),
        capability: String(capability),
        schema_ref: schemaRef == null ? null : String(schemaRef),
        metering: metering == null ? null : String(metering),
        constraints_json: constraintsJson == null ? null : String(constraintsJson),
        metadata: metadata == null ? null : String(metadata),
        created_at: String(createdAt),
        updated_at: String(updatedAt),
      })
      return { meta: { changes: 1 } }
    }

    if (sql.includes('INSERT INTO provider_secure_store')) {
      const [authRef, purpose, encryptedValue, createdBy, createdAt, updatedAt] = args
      this.credentials.set(`${String(authRef)}:${String(purpose)}`, {
        auth_ref: String(authRef),
        purpose: String(purpose),
        encrypted_value: String(encryptedValue),
        created_by: String(createdBy),
        created_at: String(createdAt),
        updated_at: String(updatedAt),
      })
      return { meta: { changes: 1 } }
    }

    if (sql.includes('UPDATE provider_registry') && !sql.includes('display_name')) {
      const [updatedAt, id] = args
      const existing = this.providers.get(String(id))
      if (!existing)
        return { meta: { changes: 0 } }
      this.providers.set(String(id), {
        ...existing,
        updated_at: String(updatedAt),
      })
      return { meta: { changes: 1 } }
    }

    if (sql.includes('UPDATE provider_registry')) {
      const [
        name,
        displayName,
        vendor,
        status,
        authType,
        authRef,
        ownerScope,
        ownerId,
        description,
        endpoint,
        region,
        metadata,
        updatedAt,
        id,
      ] = args
      const existing = this.providers.get(String(id))
      if (!existing)
        return { meta: { changes: 0 } }
      this.providers.set(String(id), {
        ...existing,
        name: String(name),
        display_name: String(displayName),
        vendor: String(vendor),
        status: String(status),
        auth_type: String(authType),
        auth_ref: authRef == null ? null : String(authRef),
        owner_scope: String(ownerScope),
        owner_id: ownerId == null ? null : String(ownerId),
        description: description == null ? null : String(description),
        endpoint: endpoint == null ? null : String(endpoint),
        region: region == null ? null : String(region),
        metadata: metadata == null ? null : String(metadata),
        updated_at: String(updatedAt),
      })
      return { meta: { changes: 1 } }
    }

    if (sql.includes('UPDATE provider_capabilities')) {
      const [capability, schemaRef, metering, constraintsJson, metadata, updatedAt, providerId, id] = args
      const existing = this.capabilities.get(String(id))
      if (!existing || existing.provider_id !== String(providerId))
        return { meta: { changes: 0 } }
      const duplicated = [...this.capabilities.values()].some(row =>
        row.id !== String(id)
        && row.provider_id === String(providerId)
        && row.capability === String(capability),
      )
      if (duplicated) {
        throw new Error('UNIQUE constraint failed: provider_capabilities.provider_id, provider_capabilities.capability')
      }
      this.capabilities.set(String(id), {
        ...existing,
        capability: String(capability),
        schema_ref: schemaRef == null ? null : String(schemaRef),
        metering: metering == null ? null : String(metering),
        constraints_json: constraintsJson == null ? null : String(constraintsJson),
        metadata: metadata == null ? null : String(metadata),
        updated_at: String(updatedAt),
      })
      return { meta: { changes: 1 } }
    }

    if (sql.includes('DELETE FROM provider_capabilities')) {
      const providerId = String(args[0])
      const capabilityId = args[1] == null ? null : String(args[1])
      if (capabilityId) {
        const existing = this.capabilities.get(capabilityId)
        if (existing?.provider_id === providerId) {
          this.capabilities.delete(capabilityId)
          return { meta: { changes: 1 } }
        }
        return { meta: { changes: 0 } }
      }
      for (const [id, row] of [...this.capabilities.entries()]) {
        if (row.provider_id === providerId)
          this.capabilities.delete(id)
      }
      return { meta: { changes: 1 } }
    }

    if (sql.includes('DELETE FROM provider_registry')) {
      const id = String(args[0])
      this.providers.delete(id)
      return { meta: { changes: 1 } }
    }

    return { meta: { changes: 0 } }
  }

  first(sql: string, args: any[]) {
    if (sql.includes('FROM provider_registry') && sql.includes('WHERE id = ?')) {
      return this.providers.get(String(args[0])) ?? null
    }
    if (sql.includes('FROM provider_capabilities') && sql.includes('WHERE provider_id') && sql.includes('AND id')) {
      const providerId = String(args[0])
      const capabilityId = String(args[1])
      const row = this.capabilities.get(capabilityId)
      return row?.provider_id === providerId ? row : null
    }
    if (sql.includes('FROM provider_secure_store')) {
      return this.credentials.get(`${String(args[0])}:${String(args[1])}`) ?? null
    }
    if (sql.includes('FROM intelligence_providers') && sql.includes('SELECT api_key_encrypted')) {
      const row = this.intelligenceProviders.get(String(args[0]))
      return row?.user_id === String(args[1])
        ? { api_key_encrypted: row.api_key_encrypted }
        : null
    }
    if (sql.includes('FROM intelligence_providers') && sql.includes('WHERE id = ? AND user_id = ?')) {
      const row = this.intelligenceProviders.get(String(args[0]))
      return row?.user_id === String(args[1]) ? row : null
    }
    return null
  }

  all(sql: string, args: any[]) {
    if (sql.includes('FROM provider_registry')) {
      return this.filterProviders(sql, args)
    }

    if (sql.includes('FROM provider_capabilities')) {
      return this.filterCapabilities(sql, args)
    }

    if (sql.includes('FROM intelligence_providers')) {
      const userId = String(args[0])
      return [...this.intelligenceProviders.values()]
        .filter(row => row.user_id === userId)
        .sort((a, b) => {
          const priorityDiff = a.priority - b.priority
          return priorityDiff || a.created_at.localeCompare(b.created_at)
        })
    }

    return []
  }

  private filterProviders(sql: string, args: any[]) {
    const filterCandidates: Array<[string, keyof ProviderRow]> = [
      ['vendor = ?', 'vendor'],
      ['status = ?', 'status'],
      ['owner_scope = ?', 'owner_scope'],
    ]
    const filters = filterCandidates.filter(([fragment]) => sql.includes(fragment))

    return [...this.providers.values()]
      .filter(row => filters.every(([, column], index) => String((row as any)[column]) === String(args[index])))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
  }

  private filterCapabilities(sql: string, args: any[]) {
    let rows = [...this.capabilities.values()]

    if (sql.includes('provider_id IN')) {
      const providerIds = new Set(args.map(String))
      rows = rows.filter(row => providerIds.has(row.provider_id))
    }

    if (/\bc\.provider_id\s*=\s*\?/.test(sql)) {
      const providerId = String(args.shift())
      rows = rows.filter(row => row.provider_id === providerId)
    }

    if (/\bc\.capability\s*=\s*\?/.test(sql)) {
      const capability = String(args.shift())
      rows = rows.filter(row => row.capability === capability)
    }

    if (sql.includes('p.vendor = ?')) {
      const vendor = String(args.shift())
      const providerIds = new Set([...this.providers.values()].filter(row => row.vendor === vendor).map(row => row.id))
      rows = rows.filter(row => providerIds.has(row.provider_id))
    }

    return rows.sort((a, b) => a.capability.localeCompare(b.capability))
  }
}

export function makeProviderRegistryEvent() {
  return {
    path: '/api/dashboard/provider-registry/providers',
    node: { req: { url: '/api/dashboard/provider-registry/providers' } },
    context: { params: {} },
  }
}

export function seedOpenAiIntelligenceProvider(
  db: MockD1Database,
  overrides: Partial<IntelligenceProviderRow> = {},
) {
  db.seedIntelligenceProvider({
    id: 'ip_local_dry_run',
    user_id: 'admin-user-1',
    type: 'openai',
    name: 'OpenAI Main',
    enabled: 1,
    api_key_encrypted: 'encrypted-local-secret-placeholder',
    base_url: 'https://api.openai.com/v1/',
    models: JSON.stringify(['gpt-4.1-mini']),
    default_model: 'gpt-4.1-mini',
    instructions: null,
    timeout: 30000,
    priority: 20,
    rate_limit: null,
    capabilities: JSON.stringify(['text.chat', 'text.summarize']),
    metadata: null,
    created_at: '2026-05-17T00:00:00.000Z',
    updated_at: '2026-05-17T00:00:00.000Z',
    ...overrides,
  })
}

export function tencentTranslateProviderBody() {
  return {
    name: 'tencent-cloud-mt-main',
    displayName: 'Tencent Cloud Machine Translation',
    vendor: 'tencent-cloud',
    status: 'enabled',
    authType: 'secret_pair',
    authRef: 'secure://providers/tencent-cloud-mt-main',
    ownerScope: 'system',
    endpoint: 'https://tmt.tencentcloudapi.com',
    region: 'ap-shanghai',
    metadata: {
      prdScene: 'screenshot-translation',
    },
    capabilities: [
      {
        capability: 'text.translate',
        schemaRef: 'nexus://schemas/provider/text-translate.v1',
        metering: { unit: 'character' },
        constraints: { maxTextLength: 5000 },
      },
      {
        capability: 'image.translate',
        schemaRef: 'nexus://schemas/provider/image-translate.v1',
        metering: { unit: 'image' },
      },
      {
        capability: 'image.translate.e2e',
        schemaRef: 'nexus://schemas/provider/image-translate-e2e.v1',
      },
    ],
  }
}
