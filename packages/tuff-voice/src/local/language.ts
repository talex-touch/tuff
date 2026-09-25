import type { ResolvedLocalModel } from './types'

/**
 * Narrowing a requested language onto what a recogniser CLI actually accepts.
 *
 * Callers name the language the way a UI does — `zh-CN`, `en-US`, `zh_CN` — while every CLI in this
 * package takes a closed set of plain tags. Narrowing therefore belongs to the engine rather than
 * to the caller: a host should be able to pass through whatever its own interface produced, and
 * each engine decides whether the value is one it can honour.
 *
 * The failure this exists to prevent is silent rather than loud. whisper.cpp prints its usage text
 * and exits 0 when `-l` names a language it cannot resolve, so a locale reaching it produced no
 * transcript, no exit code, and no message — the decode simply reported "no result" afterwards. A
 * value that cannot be honoured is therefore replaced with `auto`, which asks the model to detect
 * the language instead of handing the CLI something it will reject.
 */

/** `zh-CN` / `zh_CN` / `ZH` all name the same primary tag. */
export function primaryLanguageTag(tag: string | undefined): string {
  return (tag ?? '').trim().toLowerCase().split(/[-_]/)[0] ?? ''
}

/** The requested tag when `accepted` holds it, otherwise `auto`. */
export function narrowLanguageTag(requested: string, accepted: ReadonlySet<string>): string {
  const primary = primaryLanguageTag(requested)
  return accepted.has(primary) ? primary : 'auto'
}

/**
 * The language to hand an engine, narrowed to what the bundle declares.
 *
 * A bundle's descriptor is the statement of what it was delivered for, so it is the only list a
 * decode can trust without a table of its own. `auto` is always accepted because detection is
 * always better than a flag the engine would refuse.
 */
export function narrowToDeclaredLanguages(model: ResolvedLocalModel, requested: string): string {
  const descriptor = model.descriptor
  const accepted = new Set<string>(['auto'])
  for (const tag of [descriptor.defaultLanguage, ...descriptor.languages]) {
    const primary = primaryLanguageTag(tag)
    if (primary)
      accepted.add(primary)
  }
  return narrowLanguageTag(requested, accepted)
}
