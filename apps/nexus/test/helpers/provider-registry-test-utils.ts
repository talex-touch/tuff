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

export interface GovernanceConfigRow {
  id: string
  config_type: string
  name: string
  owner_scope: string
  owner_id: string
  target_id: string
  channel: string
  provider: string
  enabled: number
  limits_json: string
  warning_threshold: number | null
  config_json: string
  created_by: string
  created_at: string
  updated_at: string
}

export interface GovernanceEventRow {
  id: string
  scope: string
  action: string
  actor_hash: string | null
  context_hash: string | null
  resource_type: string | null
  resource_id: string | null
  channel: string | null
  unit: string
  quantity: number
  metadata_json: string | null
  occurred_at: string
  created_at: string
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

  /** What `batch` runs: rows for a read, the write's result otherwise. */
  async execute() {
    return /^\s*(?:SELECT|WITH|PRAGMA)\b/i.test(this.sql) ? this.all() : this.run()
  }
}

export class MockD1Database {
  providers = new Map<string, ProviderRow>()
  capabilities = new Map<string, CapabilityRow>()
  credentials = new Map<string, CredentialRow>()
  governanceConfigs = new Map<string, GovernanceConfigRow>()
  governanceEvents: GovernanceEventRow[] = []

  prepare(sql: string) {
    return new MockStatement(this, sql)
  }

  /** In order, like D1's batch (without its rollback, which these tests do not exercise). */
  async batch(statements: MockStatement[]) {
    const results = []
    for (const statement of statements)
      results.push(await statement.execute())
    return results
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

    if (sql.includes('INSERT INTO platform_governance_configs')) {
      const [
        id,
        configType,
        name,
        ownerScope,
        ownerId,
        targetId,
        channel,
        provider,
        enabled,
        limitsJson,
        warningThreshold,
        configJson,
        createdBy,
        createdAt,
        updatedAt,
      ] = args
      this.governanceConfigs.set(String(id), {
        id: String(id),
        config_type: String(configType),
        name: String(name),
        owner_scope: String(ownerScope),
        owner_id: ownerId == null ? '' : String(ownerId),
        target_id: targetId == null ? '' : String(targetId),
        channel: channel == null ? '' : String(channel),
        provider: provider == null ? '' : String(provider),
        enabled: Number(enabled),
        limits_json: String(limitsJson),
        warning_threshold: warningThreshold == null ? null : Number(warningThreshold),
        config_json: String(configJson),
        created_by: String(createdBy),
        created_at: String(createdAt),
        updated_at: String(updatedAt),
      })
      return { meta: { changes: 1 } }
    }

    if (sql.includes('INSERT INTO platform_governance_events')) {
      const [
        id,
        scope,
        action,
        actorHash,
        contextHash,
        resourceType,
        resourceId,
        channel,
        unit,
        quantity,
        metadataJson,
        occurredAt,
        createdAt,
      ] = args
      this.governanceEvents.push({
        id: String(id),
        scope: String(scope),
        action: String(action),
        actor_hash: actorHash == null ? null : String(actorHash),
        context_hash: contextHash == null ? null : String(contextHash),
        resource_type: resourceType == null ? null : String(resourceType),
        resource_id: resourceId == null ? null : String(resourceId),
        channel: channel == null ? null : String(channel),
        unit: String(unit),
        quantity: Number(quantity),
        metadata_json: metadataJson == null ? null : String(metadataJson),
        occurred_at: String(occurredAt),
        created_at: String(createdAt),
      })
      return { meta: { changes: 1 } }
    }

    if (sql.includes('UPDATE platform_governance_configs')) {
      const [name, enabled, limitsJson, warningThreshold, configJson, updatedAt, id] = args
      const existing = this.governanceConfigs.get(String(id))
      if (!existing)
        return { meta: { changes: 0 } }
      this.governanceConfigs.set(String(id), {
        ...existing,
        name: String(name),
        enabled: Number(enabled),
        limits_json: String(limitsJson),
        warning_threshold: warningThreshold == null ? null : Number(warningThreshold),
        config_json: String(configJson),
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
    if (sql.includes('FROM platform_governance_configs')) {
      return this.filterGovernanceConfigs(sql, args)[0] ?? null
    }
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
    return null
  }

  all(sql: string, args: any[]) {
    if (sql.includes('FROM platform_governance_configs')) {
      return this.filterGovernanceConfigs(sql, args)
    }

    if (sql.includes('FROM platform_governance_events')) {
      // Usage counted by the database: events grouped by action and unit, with their count and sum.
      if (sql.includes('GROUP BY action, unit')) {
        let rows = this.filterGovernanceEvents(sql, args)
        if (sql.includes('action IN (SELECT value FROM json_each(?))')) {
          const actions = new Set(JSON.parse(String(args.find(value => typeof value === 'string' && value.startsWith('[')))) as string[])
          rows = rows.filter(row => actions.has(row.action))
        }
        if (sql.includes("json_extract(metadata_json, '$.provider') = ?")) {
          const provider = String(args.at(-1))
          rows = rows.filter(row => (JSON.parse(row.metadata_json || '{}') as { provider?: string }).provider === provider)
        }
        const groups = new Map<string, { action: string, unit: string, events: number, quantity: number }>()
        for (const row of rows) {
          const key = `${row.action}\u0000${row.unit}`
          const group = groups.get(key) ?? { action: row.action, unit: row.unit, events: 0, quantity: 0 }
          group.events += 1
          group.quantity += Number(row.quantity) || 0
          groups.set(key, group)
        }
        return [...groups.values()]
      }
      return this.filterGovernanceEvents(sql, args)
    }

    // The capabilities of the providers a list selects: the subquery repeats the list's filter.
    if (sql.includes('FROM provider_capabilities') && sql.includes('IN (SELECT id FROM provider_registry')) {
      const providerIds = new Set(this.filterProviders(sql, args).map(row => row.id))
      return [...this.capabilities.values()]
        .filter(row => providerIds.has(row.provider_id))
        .sort((a, b) => a.capability.localeCompare(b.capability))
    }

    if (sql.includes('FROM provider_registry')) {
      return this.filterProviders(sql, args)
    }

    if (sql.includes('FROM provider_capabilities')) {
      return this.filterCapabilities(sql, args)
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

  private filterGovernanceConfigs(sql: string, args: any[]) {
    let rows = [...this.governanceConfigs.values()]

    if (sql.includes('WHERE config_type = ?1')) {
      const [configType, ownerScope, ownerId, targetId, channel, provider] = args.map(value => value == null ? '' : String(value))
      rows = rows.filter(row =>
        row.config_type === configType
        && row.owner_scope === ownerScope
        && row.owner_id === ownerId
        && row.target_id === targetId
        && row.channel === channel
        && row.provider === provider,
      )
      return rows.slice(0, 1)
    }

    const filterCandidates: Array<[string, keyof GovernanceConfigRow, (value: any) => string | number]> = [
      ['config_type = ?', 'config_type', String],
      ['owner_scope = ?', 'owner_scope', String],
      ['owner_id = ?', 'owner_id', String],
      ['target_id = ?', 'target_id', String],
      ['channel = ?', 'channel', String],
      ['provider = ?', 'provider', String],
      ['enabled = ?', 'enabled', Number],
    ]
    const filters = filterCandidates.filter(([fragment]) => sql.includes(fragment))

    rows = rows.filter(row => filters.every(([, column, normalize], index) => {
      return (row as any)[column] === normalize(args[index])
    }))

    return rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  }

  private filterGovernanceEvents(sql: string, args: any[]) {
    let rows = [...this.governanceEvents]
    const filterCandidates: Array<[string, keyof GovernanceEventRow, (value: any) => string | number]> = [
      ['scope = ?', 'scope', String],
      ['action = ?', 'action', String],
      ['resource_type = ?', 'resource_type', String],
      ['resource_id = ?', 'resource_id', String],
      ['channel = ?', 'channel', String],
      ['unit = ?', 'unit', String],
    ]
    let argIndex = 0
    if (sql.includes('occurred_at >= ?'))
      argIndex += 1

    for (const [fragment, column, normalize] of filterCandidates) {
      if (!sql.includes(fragment))
        continue
      const expected = normalize(args[argIndex++])
      rows = rows.filter(row => (row as any)[column] === expected)
    }

    return rows.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
  }
}

export function makeProviderRegistryEvent() {
  return {
    path: '/api/dashboard/provider-registry/providers',
    node: { req: { url: '/api/dashboard/provider-registry/providers' } },
    context: { params: {} },
  }
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
      adapterKey: 'tencent-translation',
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
