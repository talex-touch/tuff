import type { ITuffIcon } from '@talex-touch/utils'

/** One channel the models were listed under, and the glyph that stands for it. */
export interface ModelSource {
  id: string
  /** Tested against the lower-cased source name. Never `g` or `y`: see the table. */
  test: RegExp
  icon: ITuffIcon
}

function classIcon(value: string): ITuffIcon {
  return Object.freeze({ type: 'class', value }) as ITuffIcon
}

/**
 * The channel table, in match order.
 *
 * A channel is the `/` prefix of a pi model id (`codex/gpt-6-astra` → `codex`), and unlike a model
 * family it is **named by the user**: this machine's pi config lists `anthropic`, `DeepSeekOfficial`,
 * `touchapi`, `mesh`, `codex`, `kimi`, `cpa` and `router`. Half of those are private endpoint names,
 * which is why this is a table of patterns rather than a lookup: `/deepseek/` has to catch
 * `DeepSeekOfficial`, so the patterns match on containment.
 *
 * Containment cuts both ways, so every pattern here has to be narrow enough that a private endpoint
 * cannot fall into it. `/openrouter/` is written out in full and `/router/` is banned outright — the
 * user's own `router` endpoint would otherwise be branded as OpenRouter. The same goes for anything
 * as generic as `/api/`, `/ai/` or `/mesh/`.
 *
 * `codex` resolves to OpenAI: `@iconify-json/simple-icons@1.2.90` carries no `codex` glyph (checked
 * against the installed set), and codex is OpenAI's CLI.
 *
 * The regexes are frozen and carry no `g`/`y` flag, for the reason `MODEL_FAMILIES` gives: either
 * flag makes `test()` stateful through `lastIndex`, so the same name would alternate between a hit
 * and a miss.
 */
export const MODEL_SOURCES: readonly ModelSource[] = Object.freeze([
  { id: 'openai', test: Object.freeze(/openai|codex/), icon: classIcon('i-simple-icons-openai') },
  {
    id: 'anthropic',
    test: Object.freeze(/anthropic|claude/),
    icon: classIcon('i-simple-icons-anthropic')
  },
  { id: 'deepseek', test: Object.freeze(/deepseek/), icon: classIcon('i-simple-icons-deepseek') },
  { id: 'kimi', test: Object.freeze(/kimi|moonshot/), icon: classIcon('i-simple-icons-kimi') },
  { id: 'ollama', test: Object.freeze(/ollama/), icon: classIcon('i-simple-icons-ollama') },
  // Spelled in full, never `/router/`: see the note above.
  {
    id: 'openrouter',
    test: Object.freeze(/openrouter/),
    icon: classIcon('i-simple-icons-openrouter')
  },
  {
    id: 'gemini',
    test: Object.freeze(/gemini|googleai/),
    icon: classIcon('i-simple-icons-googlegemini')
  },
  { id: 'qwen', test: Object.freeze(/qwen|dashscope/), icon: classIcon('i-simple-icons-qwen') },
  { id: 'mistral', test: Object.freeze(/mistral/), icon: classIcon('i-simple-icons-mistralai') },
  {
    id: 'huggingface',
    test: Object.freeze(/huggingface/),
    icon: classIcon('i-simple-icons-huggingface')
  },
  {
    id: 'copilot',
    test: Object.freeze(/githubcopilot|copilot/),
    icon: classIcon('i-simple-icons-githubcopilot')
  }
])

/**
 * Every class the table can render, de-duplicated, for the UnoCSS safelist in `uno.config.ts`.
 * Same trap as `PROVIDER_ICON_CLASSES` and `MODEL_FAMILY_ICON_CLASSES`: UnoCSS scans templates, not
 * `.ts` modules, so a class that lives only here is never generated and the tab shows an empty box.
 * Derived from the table so the safelist cannot drift from it.
 */
export const MODEL_SOURCE_ICON_CLASSES: readonly string[] = Object.freeze(
  Array.from(new Set(MODEL_SOURCES.map((source) => source.icon.value)))
)

/**
 * The brand icon for a channel, or `null` when the name is one the table cannot place — a private
 * endpoint such as `touchapi` or `mesh`. There is deliberately no generic channel glyph to fall
 * back on: this machine alone has four unplaceable channels, and one shared icon would render them
 * as four identical tabs. `modelSourceInitialFor` gives the caller something that tells them apart.
 */
export function modelSourceIconFor(source: string): ITuffIcon | null {
  const name = source.toLowerCase()
  const match = MODEL_SOURCES.find((candidate) => candidate.test.test(name))
  return match ? match.icon : null
}

/**
 * The badge drawn where a channel has no brand icon: the first character of its name, upper-cased.
 *
 * `Array.from` rather than `source[0]`, so a name outside the BMP is not cut through the middle of
 * a surrogate pair — a channel name is free text from the user's own pi config, emoji included.
 * `toLocaleUpperCase` for the same reason: the name may not be Latin.
 */
export function modelSourceInitialFor(source: string): string {
  const first = Array.from(source.trim())[0]
  return first ? first.toLocaleUpperCase() : '?'
}
