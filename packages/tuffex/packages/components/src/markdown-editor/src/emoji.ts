import type { TxEmojiPack } from '../../icon/src/emoji-pack'
import type { MarkdownEmojiCategory } from './emoji-data'

export interface MarkdownEmoji {
  /** The character a built-in emoji is written as; empty for a custom one. */
  char: string
  name: string
  keywords: string[]
  /** The image of a custom emoji. */
  src?: string
}

export interface MarkdownEmojiPack {
  key: string
  label: string
  items: MarkdownEmoji[]
}

export interface MarkdownEmojiIndex {
  packs: MarkdownEmojiPack[]
  categories: Array<{ key: MarkdownEmojiCategory, items: MarkdownEmoji[] }>
  /** Every emoji, custom ones first. */
  all: MarkdownEmoji[]
  /** Shortcode to emoji. */
  byName: Map<string, MarkdownEmoji>
}

const SHORTCODE = /^[a-z0-9_+-]{1,40}$/

let loaded: MarkdownEmojiIndex | null = null
let loading: Promise<MarkdownEmojiIndex> | null = null

/** The ~1.5k built-in emoji, fetched on first use and shared by every editor. */
export function loadMarkdownEmoji(): Promise<MarkdownEmojiIndex> {
  loading ??= import('./emoji-data').then(({ MARKDOWN_EMOJI_CATEGORIES, MARKDOWN_EMOJI_DATA }) => {
    const all: MarkdownEmoji[] = []
    const byName = new Map<string, MarkdownEmoji>()
    const categories = MARKDOWN_EMOJI_CATEGORIES.map((key) => {
      const items = MARKDOWN_EMOJI_DATA[key].split('|').map((entry) => {
        const [char = '', name = '', ...keywords] = entry.split(' ')
        return { char, name, keywords }
      })
      for (const item of items) {
        all.push(item)
        byName.set(item.name, item)
      }
      return { key, items }
    })
    loaded = { packs: [], categories, all, byName }
    return loaded
  })
  return loading
}

export function peekMarkdownEmoji(): MarkdownEmojiIndex | null {
  return loaded
}

/** The text an emoji is written as: its character, or its `:name:` for a custom one. */
export function markdownEmojiText(emoji: MarkdownEmoji): string {
  return emoji.src ? `:${emoji.name}:` : emoji.char
}

function customPacks(packs: readonly TxEmojiPack[] | undefined): MarkdownEmojiPack[] {
  const packIds = new Set<string>()
  const names = new Set<string>()
  const out: MarkdownEmojiPack[] = []
  for (const pack of packs ?? []) {
    if (packIds.has(pack.id))
      continue
    packIds.add(pack.id)
    const items: MarkdownEmoji[] = []
    for (const emoji of pack.emoji) {
      if (!SHORTCODE.test(emoji.name) || !emoji.src || names.has(emoji.name))
        continue
      names.add(emoji.name)
      items.push({ char: '', name: emoji.name, keywords: emoji.keywords?.split(/\s+/).filter(Boolean) ?? [], src: emoji.src })
    }
    if (items.length)
      out.push({ key: `pack:${pack.id}`, label: pack.name, items })
  }
  return out
}

/** The built-in index with the host's packs on top; a custom emoji takes the shortcode of a built-in one. */
export function composeMarkdownEmoji(base: MarkdownEmojiIndex, packs: readonly TxEmojiPack[] | undefined): MarkdownEmojiIndex {
  const custom = customPacks(packs)
  if (!custom.length)
    return base
  const customItems = custom.flatMap(pack => pack.items)
  const replaced = new Set(customItems.map(item => item.name))
  const byName = new Map(base.byName)
  for (const item of customItems)
    byName.set(item.name, item)
  return {
    packs: custom,
    categories: base.categories.map(category => ({ key: category.key, items: category.items.filter(item => !replaced.has(item.name)) })),
    all: [...customItems, ...base.all.filter(item => !replaced.has(item.name))],
    byName,
  }
}

/** Shortcode matches before keyword matches, prefixes before substrings. */
export function searchMarkdownEmoji(index: MarkdownEmojiIndex, query: string, limit = 64): MarkdownEmoji[] {
  const needle = query.trim().toLowerCase().replace(/^:|:$/g, '')
  if (!needle)
    return []
  const ranked: Array<[number, number, MarkdownEmoji]> = []
  index.all.forEach((item, order) => {
    let rank = -1
    if (item.name === needle)
      rank = 0
    else if (item.name.startsWith(needle))
      rank = 1
    else if (item.name.includes(needle))
      rank = 2
    else if (item.keywords.some(word => word.startsWith(needle)))
      rank = 3
    else if (item.keywords.some(word => word.includes(needle)))
      rank = 4
    if (rank >= 0)
      ranked.push([rank, order, item])
  })
  return ranked
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    .slice(0, limit)
    .map(entry => entry[2])
}

const RECENT_LIMIT = 24
const recent: string[] = []

export function rememberMarkdownEmoji(text: string): void {
  const index = recent.indexOf(text)
  if (index >= 0)
    recent.splice(index, 1)
  recent.unshift(text)
  recent.length = Math.min(recent.length, RECENT_LIMIT)
}

export function recentMarkdownEmoji(index: MarkdownEmojiIndex): MarkdownEmoji[] {
  const byText = new Map(index.all.map(item => [markdownEmojiText(item), item]))
  return recent.map(text => byText.get(text)).filter((item): item is MarkdownEmoji => !!item)
}
