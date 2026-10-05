import type { AgentPresence, AiAgentId } from '@talex-touch/utils/types/ai-orchestrator'
import { aiAgentLabel } from '@talex-touch/utils/types/ai-orchestrator'
import { AGENT_BRAND_ICONS } from './agent-icons'

/**
 * Who an agent is, as the local-resource pages draw it: its brand name, its brand glyph when the
 * icon set has one, and otherwise a monogram badge tinted from the shell palette.
 *
 * Read-only attribution. Nothing here, or in any component built on it, writes to an agent's
 * directory or configuration: the pages only show which agents hold an item.
 */

/** A monogram's tint: the shell's soft fill of that hue with the hue's own ink on it. */
export type AgentMonogramTone = 'primary' | 'success' | 'warning' | 'info'

export interface AgentBrand {
  agentId: AiAgentId
  /** Brand name; product names read the same in every locale. */
  label: string
  /** Brand glyph class, or `null` when the agent draws a monogram. */
  iconClass: string | null
  /** One or two letters, for the badge drawn where there is no glyph. */
  monogram: string
  /** Tint of that badge. Stable per agent id, so an agent keeps its colour across pages. */
  tone: AgentMonogramTone
}

/** One agent on a page's agent bar: the brand, and how many of the page's rows it holds. */
export interface AgentCount {
  agentId: AiAgentId
  label: string
  count: number
}

/** An agent as a row's icon strip lists it. */
export interface AgentRef {
  agentId: AiAgentId
  label: string
}

/**
 * Tints in the order ids are spread over them. `danger` is left out on purpose: an agent is not an
 * error, and red on a badge would read as one.
 */
const MONOGRAM_TONES: readonly AgentMonogramTone[] = Object.freeze([
  'primary',
  'success',
  'warning',
  'info'
])

/** `hasOwnProperty`, not `in`: `constructor` and `toString` are not agents. */
export function agentIconClass(agentId: string): string | null {
  return Object.prototype.hasOwnProperty.call(AGENT_BRAND_ICONS, agentId)
    ? (AGENT_BRAND_ICONS[agentId] ?? null)
    : null
}

/**
 * The badge letters for a name: the initials of its first two words when it has several
 * (`Kilo Code` → `KC`, so it does not collide with `Kiro`'s `K`), else its first letter.
 *
 * `Array.from` takes whole code points, so a name outside the BMP is not cut through a surrogate
 * pair, and `toLocaleUpperCase` leaves a non-Latin initial readable.
 */
export function agentMonogram(label: string): string {
  const words = label
    .trim()
    .split(/[\s_-]+/)
    .filter(Boolean)
  if (words.length === 0) return '?'
  const initials = words.slice(0, 2).map((word) => Array.from(word)[0] ?? '')
  return (words.length > 1 ? initials.join('') : initials[0]!).toLocaleUpperCase()
}

/** A stable tint per id: the same agent is the same colour on every page and every launch. */
export function agentMonogramTone(agentId: string): AgentMonogramTone {
  let sum = 0
  for (const char of agentId) sum = (sum + (char.codePointAt(0) ?? 0)) % 9973
  return MONOGRAM_TONES[sum % MONOGRAM_TONES.length]!
}

/**
 * Everything a page draws for one agent. `label` is the name main sent with the inventory when there
 * is one; it falls back to the build's own brand table, and then to the id itself, so an agent this
 * build has never heard of still names itself instead of vanishing.
 */
export function agentBrand(agentId: AiAgentId, label?: string): AgentBrand {
  const name = label?.trim() || aiAgentLabel(agentId)
  return {
    agentId,
    label: name,
    iconClass: agentIconClass(agentId),
    monogram: agentMonogram(name),
    tone: agentMonogramTone(agentId)
  }
}

/**
 * The agent bar's entries for one resource, from the presence an inventory reported. Agents with no
 * row of this resource are dropped — the bar lists only agents holding at least one — and main's
 * order (most rows first) is kept, so the chip a user expects first stays first.
 */
export function agentCountsFrom(
  presence: readonly AgentPresence[],
  resource: 'skill' | 'mcp'
): AgentCount[] {
  const counts: AgentCount[] = []
  for (const entry of presence) {
    const count = (resource === 'skill' ? entry.skillCount : entry.mcpServerCount) ?? 0
    if (count <= 0) continue
    counts.push({
      agentId: entry.agentId,
      label: agentBrand(entry.agentId, entry.label).label,
      count
    })
  }
  return counts
}
