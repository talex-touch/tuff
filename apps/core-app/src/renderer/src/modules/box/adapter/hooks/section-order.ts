import type { TuffContainerLayout, TuffItem, TuffSection } from '@talex-touch/utils'

export interface SectionAlignedResult {
  items: TuffItem[]
  layout: TuffContainerLayout | undefined
}

/**
 * Line the rendered list up with what the sections show.
 *
 * `BoxGrid` numbers positions by walking the sections in order — the grid tier first, then the
 * list — and that number is what `boxOptions.focus` holds. Everything else reads the focused item
 * as `res[focus]`: the preview pane, the footer, Enter, the ⌘1–⌘0 quick keys. The backend hands
 * `items` over in rank order, where a newly added file can sit above the apps that fill the grid,
 * so without this step ⌘1 highlights the first tile while the pane previews the first file.
 *
 * Sections may also name items the pipeline has since dropped (file filters run after the layout
 * is built). Those ids are pruned so keyboard navigation, which sizes a section by its `itemIds`,
 * agrees with what `BoxGrid` actually renders.
 *
 * Only a grid layout is touched: that is the one `BoxGrid` renders, and a plain list shows `res`
 * in the order it arrived, sections or not.
 */
export function alignItemsToSections(
  items: TuffItem[],
  layout: TuffContainerLayout | undefined
): SectionAlignedResult {
  const sections = layout?.sections
  if (!layout || layout.mode !== 'grid' || !sections || sections.length === 0) {
    return { items, layout }
  }

  const byId = new Map<string, TuffItem>()
  for (const item of items) {
    if (!byId.has(item.id)) byId.set(item.id, item)
  }

  const placed = new Set<TuffItem>()
  const ordered: TuffItem[] = []
  const alignedSections: TuffSection[] = []

  for (const section of sections) {
    const itemIds: string[] = []
    for (const id of section.itemIds) {
      const item = byId.get(id)
      if (!item || placed.has(item)) continue
      placed.add(item)
      ordered.push(item)
      itemIds.push(id)
    }
    if (itemIds.length > 0) alignedSections.push({ ...section, itemIds })
  }

  // An item no section claims must not vanish; it trails the tiers.
  for (const item of items) {
    if (!placed.has(item)) ordered.push(item)
  }

  return { items: ordered, layout: { ...layout, sections: alignedSections } }
}
