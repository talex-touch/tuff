/**
 * Shapes of the local-resource list kit (`ResourceAgentBar`, `AgentIconRow`, `ResourceRow`). The
 * kit names agents itself — brand names read the same in every locale — and takes every other string
 * from the page.
 */

/** A label beside a row's name: a transport, a storage location, a warning. */
export interface ResourceRowTag {
  /** Stable identity across renders; the label is the fallback. */
  key?: string
  label: string
  /** Colour is additive: the label alone must still say it. */
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger'
  /**
   * What the label stands for, shown when the pointer rests on it: the path behind "本地" when two
   * rows share a name, say. The row's details say it too, for anyone who cannot hover.
   */
  hint?: string
}
