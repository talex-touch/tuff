/**
 * Display rules for the home model menu. Pure so the menu, the pill and the tests share one
 * reading of a model id; nothing here touches storage or the SDK.
 */

/** The two fields that identify a model across providers; also the shape that gets persisted. */
export interface ModelRef {
  providerId: string
  model: string
}

/** What a row and a search need to know about a model, beyond its identity. */
export interface ModelDisplayFields extends ModelRef {
  providerName: string
  /** The `/` prefix of a pi id (`codex/gpt-6-astra` → `codex`); `null` when the id has none. */
  source: string | null
  /** The id without its source prefix; equals `model` when there is no prefix. */
  displayName: string
}

export interface SplitModelId {
  source: string | null
  name: string
}

/**
 * Splits a model id at its first `/`. The pi catalog builds ids as `${source}/${id}`, so the
 * prefix is the upstream source and the rest is what the user knows the model as. Ids without a
 * `/` — including local ones such as `qwen2.5:3b`, whose `:` is part of the name — are returned
 * whole. A `/` at either end has nothing on one side and is treated as part of the name.
 */
export function splitModelId(model: string): SplitModelId {
  const slash = model.indexOf('/')
  if (slash <= 0 || slash === model.length - 1) return { source: null, name: model }
  return { source: model.slice(0, slash), name: model.slice(slash + 1) }
}

export function modelDisplayName(model: string): string {
  return splitModelId(model).name
}

/** `providerName · source`, or just the provider name when the model has no source. */
export function modelSubtitle(providerName: string, source: string | null): string {
  return source ? `${providerName} · ${source}` : providerName
}

/**
 * Case-insensitive substring match over the id, display name, provider name and source. An empty
 * or whitespace-only query matches everything, so a cleared search box shows the full list.
 */
export function matchesModelQuery(choice: ModelDisplayFields, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return [choice.model, choice.displayName, choice.providerName, choice.source ?? ''].some(
    (field) => field.toLowerCase().includes(needle)
  )
}

export function sameModelRef(a: ModelRef, b: ModelRef): boolean {
  return a.providerId === b.providerId && a.model === b.model
}
