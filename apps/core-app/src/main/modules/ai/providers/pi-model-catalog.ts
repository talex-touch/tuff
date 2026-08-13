import { readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createLogger } from '../../../utils/logger'

const catalogLog = createLogger('Intelligence').child('PiModelCatalog')

/**
 * Model patterns the locally installed `pi` CLI can serve, read from its own
 * catalogue files. The auto-registered pi provider declares no models of its
 * own, so without this the model menu shows an empty list on a machine where
 * pi answers every conversation.
 *
 * Two files under the agent dir (`PI_CODING_AGENT_DIR`, default `~/.pi/agent`)
 * hold the universe: `models.json` (user-defined providers) and
 * `models-store.json` (the built-in catalogue `pi update` maintains). Neither
 * file is a public contract — every read here is defensive, and a shape this
 * parser does not recognise degrades to "that source lists nothing" rather
 * than an error. `auth.json` sits beside them and is never opened.
 *
 * `models.json` carries provider credentials in plaintext. The secret boundary
 * is the return type: only the `<provider>/<id>` pattern string leaves this
 * module, so nothing a caller logs, sends over transport, or hands the
 * renderer can contain a key.
 */

/** Sync on purpose: `getProviderModelOptions` and the plugin-host dependency it feeds are sync. */
export function listPiCliModels(): string[] {
  const dir = piAgentDir()
  const customPath = join(dir, 'models.json')
  const storePath = join(dir, 'models-store.json')

  const signature = `${fileSignature(customPath)}|${fileSignature(storePath)}`
  if (cache && cache.signature === signature) {
    return cache.patterns
  }

  // Custom providers first: on a pattern collision the user's own definition
  // is the one they recognise, so it wins the dedup below.
  const patterns = dedupe([
    ...readCustomProviderPatterns(customPath),
    ...readStorePatterns(storePath)
  ]).sort((a, b) => a.localeCompare(b))

  cache = { signature, patterns }
  return patterns
}

/** Test seam: drops the memoised read and the warn-once marker. */
export function resetPiModelCatalogCache(): void {
  cache = null
  warned = false
}

let cache: { signature: string; patterns: string[] } | null = null
let warned = false

function piAgentDir(): string {
  return process.env.PI_CODING_AGENT_DIR || join(homedir(), '.pi', 'agent')
}

/**
 * mtime + size, not content: two tiny local files, but the menu re-queries on
 * every open and reparsing JSON that has not changed is pure waste.
 */
function fileSignature(path: string): string {
  try {
    const stats = statSync(path)
    return `${stats.mtimeMs}:${stats.size}`
  } catch {
    return 'absent'
  }
}

/**
 * `reason` is a fixed string, never a caught error: V8's `JSON.parse` message
 * quotes an excerpt of the source text, and these files carry credentials.
 */
function warnOnce(path: string, reason: string): void {
  if (warned) return
  warned = true
  catalogLog.warn(`Could not read pi model catalogue ${path}: ${reason}`)
}

function readJsonRecord(path: string): Record<string, unknown> | null {
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    // Missing file is the normal shape of "pi has no such catalogue" — silent.
    return null
  }

  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    warnOnce(path, 'not a JSON object')
  } catch {
    warnOnce(path, 'invalid JSON')
  }
  return null
}

/** Picks the ids out of one provider's `models` array, whatever else rides beside them. */
function modelIds(models: unknown): string[] {
  if (!Array.isArray(models)) return []
  const ids: string[] = []
  for (const entry of models) {
    if (!entry || typeof entry !== 'object') continue
    const id = (entry as { id?: unknown }).id
    if (typeof id === 'string' && id.trim()) ids.push(id.trim())
  }
  return ids
}

function providerPatterns(providers: Record<string, unknown>): string[] {
  const patterns: string[] = []
  for (const [providerName, config] of Object.entries(providers)) {
    if (!providerName.trim() || !config || typeof config !== 'object') continue
    for (const id of modelIds((config as { models?: unknown }).models)) {
      patterns.push(`${providerName.trim()}/${id}`)
    }
  }
  return patterns
}

/** `models.json`: `{ providers: { <name>: { models: [{ id, ... }], apiKey, ... } } }`. */
function readCustomProviderPatterns(path: string): string[] {
  const parsed = readJsonRecord(path)
  const providers = parsed?.providers
  if (!providers || typeof providers !== 'object' || Array.isArray(providers)) return []
  return providerPatterns(providers as Record<string, unknown>)
}

/** `models-store.json`: `{ <provider>: { models: [...], checkedAt, ... } }` — providers at the top. */
function readStorePatterns(path: string): string[] {
  const parsed = readJsonRecord(path)
  if (!parsed) return []
  return providerPatterns(parsed)
}

function dedupe(patterns: string[]): string[] {
  const seen = new Set<string>()
  const unique: string[] = []
  for (const pattern of patterns) {
    if (seen.has(pattern)) continue
    seen.add(pattern)
    unique.push(pattern)
  }
  return unique
}
