import type { ITuffIcon } from '@talex-touch/utils'
// Relative on purpose: `uno.config.ts` imports this module for its safelist, and the UnoCSS
// config loader (jiti) knows nothing of the `~/` alias. `model-display` has no imports of its
// own, so the whole chain stays evaluable outside Vite.
import { splitModelId } from '../conversation/model-display'

/** One model family: the brand the user knows a model by, and the glyph that stands for it. */
export interface ModelFamily {
  id: string
  /** Tested against the lower-cased name part of the model id. Never `g` or `y`: see the table. */
  test: RegExp
  icon: ITuffIcon
}

function classIcon(value: string): ITuffIcon {
  return Object.freeze({ type: 'class', value }) as ITuffIcon
}

/**
 * Zhipu (GLM) and 01.AI (Yi) have no glyph in `@iconify-json/simple-icons` — checked against the
 * installed set, which has none of `zhipu`, `zhipuai`, `chatglm`, `01ai` or `yi`. They still get
 * a family icon, distinct from the provider fallback, so a known family without a brand mark does
 * not read as "unknown model".
 */
const GENERIC_FAMILY_ICON = classIcon('i-carbon-machine-learning-model')

/**
 * The family table, in match order: the first pattern to hit wins, so the specific ones sit
 * above the generic. DeepSeek precedes Meta and Qwen so a `deepseek-r1-distill-llama-8b` shows
 * DeepSeek, which is what it is; `codestral` is a Mistral model and must not be caught by an
 * OpenAI `codex` pattern, which is why that one is anchored.
 *
 * Every pattern runs on the *name* part of the id, after `splitModelId` has taken the source
 * prefix off: `codex/gpt-6-astra` is matched as `gpt-6-astra` and resolves to OpenAI, not to a
 * "codex" family, and `kimi/k3` is matched as `k3` and resolves to nothing (the caller then falls
 * back to the provider icon). The source names where the model was listed, not what it is.
 *
 * The regexes are frozen and carry no `g`/`y` flag. Either flag makes `test()` stateful through
 * `lastIndex`, so the same id would alternate between a hit and a miss; freezing turns that
 * mistake into a `TypeError` on the first call instead of a flaky icon.
 */
export const MODEL_FAMILIES: readonly ModelFamily[] = Object.freeze([
  {
    id: 'openai',
    test: Object.freeze(/^(gpt|o[1-9]|chatgpt|codex|davinci|text-embedding)/),
    icon: classIcon('i-simple-icons-openai')
  },
  { id: 'claude', test: Object.freeze(/claude/), icon: classIcon('i-simple-icons-claude') },
  {
    id: 'gemini',
    test: Object.freeze(/gemini|gemma/),
    icon: classIcon('i-simple-icons-googlegemini')
  },
  { id: 'deepseek', test: Object.freeze(/deepseek/), icon: classIcon('i-simple-icons-deepseek') },
  { id: 'qwen', test: Object.freeze(/^(qwen|qwq|qvq)/), icon: classIcon('i-simple-icons-qwen') },
  { id: 'meta', test: Object.freeze(/llama/), icon: classIcon('i-simple-icons-meta') },
  {
    id: 'mistral',
    test: Object.freeze(/mistral|mixtral|codestral|ministral/),
    icon: classIcon('i-simple-icons-mistralai')
  },
  // simple-icons has no xAI mark; the X glyph is the closest the set offers.
  { id: 'xai', test: Object.freeze(/grok/), icon: classIcon('i-simple-icons-x') },
  { id: 'kimi', test: Object.freeze(/kimi|moonshot/), icon: classIcon('i-simple-icons-kimi') },
  {
    id: 'minimax',
    test: Object.freeze(/minimax|abab/),
    icon: classIcon('i-simple-icons-minimax')
  },
  {
    id: 'bytedance',
    test: Object.freeze(/doubao|seed-/),
    icon: classIcon('i-simple-icons-bytedance')
  },
  { id: 'baidu', test: Object.freeze(/ernie/), icon: classIcon('i-simple-icons-baidu') },
  { id: 'zhipu', test: Object.freeze(/^(glm|chatglm)|zhipu/), icon: GENERIC_FAMILY_ICON },
  { id: 'yi', test: Object.freeze(/^yi-/), icon: GENERIC_FAMILY_ICON }
])

/**
 * Every class the table can render, de-duplicated, for the UnoCSS safelist in `uno.config.ts`.
 * Same trap as `PROVIDER_ICON_CLASSES`: UnoCSS scans templates, not `.ts` modules, so a class
 * that lives only here is never generated and the row shows an empty box. Derived from the table
 * so the safelist cannot drift from it.
 */
export const MODEL_FAMILY_ICON_CLASSES: readonly string[] = Object.freeze(
  Array.from(new Set(MODEL_FAMILIES.map((family) => family.icon.value)))
)

/**
 * The family icon for a model id, or `null` when the name part names no family the table knows —
 * the caller then shows the provider's icon, which is the next most specific thing it has.
 */
export function modelFamilyIconFor(modelId: string): ITuffIcon | null {
  const name = splitModelId(modelId).name.toLowerCase()
  const family = MODEL_FAMILIES.find((candidate) => candidate.test.test(name))
  return family ? family.icon : null
}
