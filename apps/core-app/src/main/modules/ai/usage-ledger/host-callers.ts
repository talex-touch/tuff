/**
 * Default callers for host requests that name none (audit rebuild parent design §1.4).
 *
 * Applied after the plugin binding (`bindPluginMetadataCaller`): a plugin request already carries
 * `plugin:<name>` and is returned untouched, so a plugin can neither omit its caller nor borrow a
 * `core.*` one. A host request that names its own caller keeps it.
 */
export function withHostDefaultCaller<T>(payload: T, isPlugin: boolean, caller: string): T {
  if (isPlugin || !payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload
  }
  const record = payload as T & { metadata?: unknown }
  const metadata =
    record.metadata && typeof record.metadata === 'object' && !Array.isArray(record.metadata)
      ? (record.metadata as Record<string, unknown>)
      : undefined
  if (typeof metadata?.caller === 'string' && metadata.caller) return payload
  return { ...record, metadata: { ...metadata, caller } }
}
